'use strict';

const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/config');
const { Game, total } = require('../src/game');
const { botStep } = require('../src/bot');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function count(g) {
  let n = total(g.bag) + g.claro.filter(Boolean).length;
  for (const p of g.players) {
    n += total(p.reserva);
    if (p.estudio) n += total(p.estudio.placed);
  }
  return n;
}

function play(seed, n) {
  const g = new Game('TEST', { rng: seeded(seed), ventanaMs: 0 });
  for (let i = 0; i < n; i += 1) g.addPlayer('', { bot: true });
  g.start();
  let steps = 0;
  while (g.phase === 'juego') {
    let acted = false;
    for (const p of g.players) if (botStep(g, p)) { acted = true; break; }
    if (!acted) assert.ok(g.tick(), `bloqueado en ${g.turn.paso}`);
    assert.strictEqual(count(g), C.POR_TIPO * 4, 'se han perdido o creado ingredientes');
    for (const p of g.players) {
      assert.ok(p.pociones.length <= C.MAX_POCIONES);
      assert.strictEqual(new Set(p.pociones).size, p.pociones.length);
      assert.ok(C.ING.every((t) => p.reserva[t] >= 0));
    }
    steps += 1;
    assert.ok(steps < 5000, 'la partida no termina');
  }
  return g;
}

test('partidas completas entre bots', () => {
  const pts = [];
  for (let seed = 1; seed <= 60; seed += 1) {
    const g = play(seed, 2 + (seed % 3));
    assert.strictEqual(g.phase, 'fin');
    assert.ok(g.winners.length >= 1);
    for (const p of g.players) {
      assert.strictEqual(total(p.reserva) <= C.LIMITE_RESERVA, true);
      pts.push(g.points(p));
    }
  }
  const avg = pts.reduce((a, b) => a + b, 0) / pts.length;
  console.log(`Prestigio medio de los bots: ${avg.toFixed(1)} (mín ${Math.min(...pts)}, máx ${Math.max(...pts)})`);
  assert.ok(avg > 5);
});
