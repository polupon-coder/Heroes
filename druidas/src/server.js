'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Game, GameError } = require('./game');
const { botStep } = require('./bot');
const C = require('./config');

const PORT = process.env.PORT || 3000;
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS || 900);
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // salas inactivas se borran a las 6 h
const PUBLIC = path.join(__dirname, '..', 'public');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(PUBLIC, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

// Ilustraciones disponibles en public/img/<carpeta> (nombre sin extensión -> archivo).
function listImages(dir) {
  try {
    const out = {};
    for (const f of fs.readdirSync(path.join(PUBLIC, 'img', dir))) {
      const m = f.match(/^(.+)\.(webp|png|jpe?g|svg)$/i);
      if (m) out[m[1]] = `img/${dir}/${f}`;
    }
    return out;
  } catch {
    return {};
  }
}

app.get('/api/datos', (req, res) => {
  res.json({
    ing: C.ING,
    ingInfo: C.ING_INFO,
    cartas: C.CARTAS,
    iniciales: C.INICIALES,
    mascotas: C.MASCOTAS,
    druidas: C.DRUIDAS,
    rondas: C.RONDAS,
    meta: C.META,
    limiteReserva: C.LIMITE_RESERVA,
    img: {
      druidas: listImages('druidas'),
      retratos: listImages('retratos'),
      sinfondo: listImages('retratos-sin-fondo'),
      ilustradas: listImages('cartas-ilustradas'),
      recortes: listImages('druidas-recorte'),
      mascotas: listImages('mascotas'),
      cartas: listImages('cartas'),
      ingredientes: listImages('ingredientes'),
      ui: listImages('ui'),
    },
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
  if (!g.players.some((p) => p.bot) || g.phase !== 'juego') return;
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

function attach(room, socket, playerId, token) {
  socket.data = { room: room.game.code, playerId, token };
  socket.join(room.game.code);
  if (!room.sockets.has(playerId)) room.sockets.set(playerId, new Set());
  room.sockets.get(playerId).add(socket);
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
    attach(room, socket, p.id, token);
    reply(cb, { ok: true, code, token });
    broadcast(room);
  });

  socket.on('join', ({ code, name, token } = {}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return reply(cb, { ok: false, error: 'No existe ninguna sala con ese código', errorEn: 'There is no room with that code' });
    let pid = token && room.tokens.get(token);
    if (pid && !room.game.players.some((p) => p.id === pid)) pid = null;
    if (!pid) {
      try {
        const p = room.game.addPlayer(name);
        pid = p.id;
        token = crypto.randomUUID();
        room.tokens.set(token, pid);
      } catch (e) {
        return reply(cb, { ok: false, error: e.message, errorEn: e.en || e.message });
      }
    }
    attach(room, socket, pid, token);
    reply(cb, { ok: true, code: room.game.code, token });
    broadcast(room);
  });

  socket.on('act', ({ type, data } = {}, cb) => {
    const room = rooms.get(socket.data && socket.data.room);
    if (!room) return reply(cb, { ok: false, error: 'No estás en ninguna sala', errorEn: 'You are not in a room' });
    try {
      room.game.act(socket.data.playerId, type, data);
      reply(cb, { ok: true });
    } catch (e) {
      if (!(e instanceof GameError)) console.error(e);
      reply(cb, { ok: false, error: e instanceof GameError ? e.message : 'Error interno', errorEn: e instanceof GameError ? e.en : 'Internal error' });
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
    const room = rooms.get(socket.data && socket.data.room);
    if (!room) return;
    const p = room.game.players.find((x) => x.id === socket.data.playerId);
    const msg = String(text || '').trim().slice(0, 200);
    if (!p || !msg) return;
    io.to(room.game.code).emit('chat', { from: p.name, druida: p.druida, text: msg });
  });

  socket.on('disconnect', () => {
    const room = rooms.get(socket.data && socket.data.room);
    if (!room) return;
    const set = room.sockets.get(socket.data.playerId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      const p = room.game.players.find((x) => x.id === socket.data.playerId);
      if (p) p.connected = false;
    }
    broadcast(room);
  });
});

// Plazos de la ventana de ataque y de la defensa.
setInterval(() => {
  for (const room of rooms.values()) {
    try {
      if (room.game.tick()) broadcast(room);
    } catch (e) {
      console.error(e);
    }
  }
}, 500).unref();

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
  console.log(`ESCUELA DE MAGIA escuchando en http://localhost:${PORT}`);
});
