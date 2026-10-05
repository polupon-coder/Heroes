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

app.use(express.static(path.join(__dirname, '..', 'public')));
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
    maxMana: C.MAX_MANA_INICIAL,
    monstruos: C.MONSTERS,
    colores: C.COLORS,
    retratos: listImages('heroes'),
    ilustracionesMonstruos: listImages('monstruos'),
    ilustracionesObjetos: listImages('objetos'),
  });
});
app.get('/healthz', (req, res) => res.send('ok'));

// code -> { game, tokens: Map(token -> playerId), sockets: Map(playerId -> Set(socket)), botTimer, touched }
const rooms = new Map();

function newCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function broadcast(room) {
  room.touched = Date.now();
  for (const [pid, set] of room.sockets) {
    if (!room.game.players.some((p) => p.id === pid)) continue;
    const view = room.game.view(pid);
    for (const s of set) s.emit('state', view);
  }
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
  }, BOT_DELAY_MS);
}

function attach(room, socket, playerId) {
  if (!room.sockets.has(playerId)) room.sockets.set(playerId, new Set());
  room.sockets.get(playerId).add(socket);
  socket.data.room = room.game.code;
  socket.data.playerId = playerId;
  socket.join(room.game.code);
  const p = room.game.players.find((x) => x.id === playerId);
  if (p) p.connected = true;
}

io.on('connection', (socket) => {
  const reply = (cb, payload) => typeof cb === 'function' && cb(payload);

  socket.on('create', ({ name } = {}, cb) => {
    const code = newCode();
    const game = new Game(code);
    const room = { game, tokens: new Map(), sockets: new Map(), botTimer: null, touched: Date.now() };
    rooms.set(code, room);
    const p = game.addPlayer(name);
    const token = crypto.randomUUID();
    room.tokens.set(token, p.id);
    attach(room, socket, p.id);
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
    attach(room, socket, pid);
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
    // Si alguien fue expulsado, cerrar sus conexiones.
    for (const [pid, set] of room.sockets) {
      if (!room.game.players.some((p) => p.id === pid)) {
        for (const s of set) s.emit('kicked');
        room.sockets.delete(pid);
      }
    }
    broadcast(room);
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
    const set = room.sockets.get(socket.data.playerId);
    if (set) {
      set.delete(socket);
      if (set.size === 0) {
        const p = room.game.players.find((x) => x.id === socket.data.playerId);
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
