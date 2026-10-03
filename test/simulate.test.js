'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../src/game');
const { botStep } = require('../src/bot');

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function playFull(seed, nPlayers, pvpHits = 4) {
  const g = new Game('TEST', { rng: seeded(seed) });
  for (let i = 0; i < nPlayers; i++) g.addPlayer(`B${i}`, { bot: true });
  g.settings.pvpHits = pvpHits;
  g.startGame();
  let steps = 0;
  while (g.phase !== 'fin') {
    let acted = false;
    for (const p of g.players) if (botStep(g, p)) acted = true;
    assert.ok(acted, `atasco en fase ${g.phase} ronda ${g.round}`);
    assert.ok(++steps < 50000, 'demasiados pasos');
  }
  return g;
}

test('partidas completas con bots terminan con un ganador', () => {
  for (let seed = 1; seed <= 60; seed++) {
    for (const n of [1, 2, 3, 4]) {
      const g = playFull(seed, n, seed % 2 ? 4 : 5);
      assert.ok(g.winner, 'hay ganador');
      assert.strictEqual(g.round, 13);
    }
  }
});
