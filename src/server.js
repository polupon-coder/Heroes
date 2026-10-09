'use strict';

const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');
const { botStep } = require('./bot');
const fs = require('fs');
const C = require('./config');

const PORT = process.env.PORT || 3000;
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS || 700);
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // salas inactivas se borran a las 6 h

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Siempre se revalida con el servidor (ETag): tras cada despliegue se ven las
// ilustraciones y estilos nuevos, no los que el navegador tenía guardados.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
function listImages(dir) {
  try {
    return fs.readdirSync(path.join(__dirname, '..', 'public', 'img', dir))
      .filter((f) => f.endsWith('.webp'))
      .map((f) => f.replace('.webp', ''));
  } catch {
    return [];
  }
}

app.get('/api/datos', (req, res) => {
  res.json({
    razas: C.RACES,
    clases: C.CLASSES,
    afinidad: C.AFINIDAD,
    afinidadEfecto: C.AFINIDAD_EFECTO,
    base: C.BASE_STATS,
    minFuerza: C.MIN_FUERZA_INICIAL,
    tiradasBase: C.TIRADAS_BASE,
    tiradasFuerza: C.TIRADAS_FUERZA,
    golpeFuerza: C.GOLPE_FUERZA,
    maxMana: C.MAX_MANA_INICIAL,
    monstruos: C.MONSTERS,
    colores: C.COLORS,
    retratos: listImages('heroes'),
    ilustracionesMonstruos: listImages('monstruos'),
    ilustracionesObjetos: listImages('objetos'),
  });
});
app.get('/healthz', (req, res) => res.send('ok'));

// code -> { game, tokens: Map(token -> playerId), local: Map(token -> [playerId]) (jugadores
// extra del mismo dispositivo), sockets: Map(playerId -> Set(socket)), botTimer, touched }
const rooms = new Map();

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function sendState(room, s) {
  const g = room.game;
  const mine = [...(s.data.players || [])].filter((id) => g.players.some((p) => p.id === id));
  if (!mine.length) return;
  if (!mine.includes(s.data.playerId)) s.data.playerId = mine[0];
  const view = g.view(s.data.playerId);
  // Jugadores de este mismo dispositivo y si les toca hacer algo.
  view.local = mine.length > 1 ? mine.map((id) => ({ id, name: g.player(id).name, needs: g.needsAction(id) })) : null;
  s.emit('state', view);
}

function broadcast(room) {
  room.touched = Date.now();
  const all = new Set();
  for (const set of room.sockets.values()) for (const s of set) all.add(s);
  for (const s of all) sendState(room, s);
  scheduleBots(room);
}

function scheduleBots(room) {
  if (room.botTimer) return;
  const g = room.game;
  if (!g.players.some((p) => p.bot) || g.phase === 'lobby' || g.phase === 'fin') return;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    let acted = false;
    for (const p of g.players) {
      if (!p.bot) continue;
      try {
        if (botStep(g, p)) acted = true;
      } catch (e) {
        console.error('Error de bot', e);
      }
      if (acted) break; // una acción cada vez para que se pueda seguir
    }
    if (acted) broadcast(room);
  }, g.phase === 'torneo' ? BOT_DELAY_MS * 2.5 : BOT_DELAY_MS);
}

function attach(room, socket, playerId, token) {
  const ids = [playerId, ...((token && room.local.get(token)) || [])];
  socket.data.players = new Set(ids);
  socket.data.token = token;
  socket.data.room = room.game.code;
  socket.data.playerId = playerId;
  socket.join(room.game.code);
  for (const id of ids) {
    if (!room.sockets.has(id)) room.sockets.set(id, new Set());
    room.sockets.get(id).add(socket);
    const p = room.game.players.find((x) => x.id === id);
    if (p) p.connected = true;
  }
}

io.on('connection', (socket) => {
  const reply = (cb, payload) => typeof cb === 'function' && cb(payload);

  socket.on('create', ({ name } = {}, cb) => {
    const code = newCode();
    const game = new Game(code);
    const room = { game, tokens: new Map(), local: new Map(), sockets: new Map(), botTimer: null, touched: Date.now() };
    rooms.set(code, room);
    const p = game.addPlayer(name);
    const token = crypto.randomUUID();
    room.tokens.set(token, p.id);
    attach(room, socket, p.id, token);
    reply(cb, { ok: true, code, token });
    broadcast(room);
  });

  socket.on('join', ({ code, name, token } = {}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return reply(cb, { ok: false, error: 'No existe ninguna sala con ese código' });
    let pid = token && room.tokens.get(token);
    if (pid && !room.game.players.some((p) => p.id === pid)) pid = null;
    if (!pid) {
      try {
        const p = room.game.addPlayer(name);
        pid = p.id;
        token = crypto.randomUUID();
        room.tokens.set(token, pid);
      } catch (e) {
        return reply(cb, { ok: false, error: e.message });
      }
    }
    attach(room, socket, pid, token);
    reply(cb, { ok: true, code: room.game.code, token });
    broadcast(room);
  });

  socket.on('act', ({ type, data } = {}, cb) => {
    const room = rooms.get(socket.data.room);
    if (!room) return reply(cb, { ok: false, error: 'No estás en ninguna sala' });
    try {
      room.game.act(socket.data.playerId, type, data);
      reply(cb, { ok: true });
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      reply(cb, { ok: false, error: e instanceof GameError ? e.message : 'Error interno' });
    }
    // Si alguien fue expulsado, cerrar sus conexiones (salvo que controlen a otro jugador).
    for (const [pid, set] of room.sockets) {
      if (!room.game.players.some((p) => p.id === pid)) {
        for (const s of set) {
          s.data.players.delete(pid);
          if (s.data.players.size === 0) s.emit('kicked');
        }
        room.sockets.delete(pid);
        for (const [tok, list] of room.local) room.local.set(tok, list.filter((x) => x !== pid));
      }
    }
    broadcast(room);
  });

  // Otro jugador en este mismo dispositivo (se juega por turnos pasándose la pantalla).
  socket.on('addLocal', ({ name } = {}, cb) => {
    const room = rooms.get(socket.data.room);
    if (!room || !socket.data.token) return reply(cb, { ok: false, error: 'No estás en ninguna sala' });
    try {
      const p = room.game.addPlayer(name);
      p.local = true;
      const list = room.local.get(socket.data.token) || [];
      list.push(p.id);
      room.local.set(socket.data.token, list);
      // Todas las conexiones de este dispositivo controlan al nuevo jugador.
      const primary = room.tokens.get(socket.data.token);
      for (const s of room.sockets.get(primary) || []) {
        s.data.players.add(p.id);
        if (!room.sockets.has(p.id)) room.sockets.set(p.id, new Set());
        room.sockets.get(p.id).add(s);
      }
      reply(cb, { ok: true });
    } catch (e) {
      reply(cb, { ok: false, error: e.message });
    }
    broadcast(room);
  });

  socket.on('setActive', ({ playerId } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room || !socket.data.players || !socket.data.players.has(playerId)) return;
    socket.data.playerId = playerId;
    sendState(room, socket);
  });

  socket.on('chat', ({ text } = {}) => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    const p = room.game.players.find((x) => x.id === socket.data.playerId);
    const msg = String(text || '').trim().slice(0, 200);
    if (!p || !msg) return;
    io.to(room.game.code).emit('chat', { from: p.name, color: p.color, text: msg });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data.room);
    if (!room) return;
    for (const id of socket.data.players || []) {
      const set = room.sockets.get(id);
      if (!set) continue;
      set.delete(socket);
      if (set.size === 0) {
        const p = room.game.players.find((x) => x.id === id);
        if (p) p.connected = false;
      }
    }
    broadcast(room);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.touched > ROOM_TTL_MS) {
      clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
}, 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`HÉROES escuchando en http://localhost:${PORT}`);
});
