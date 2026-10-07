'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Partida, V01 } = require('../mana/motor');

test('MANA: partidas completas con bots terminan con ganador y 24 Sellos en juego', () => {
  for (let seed = 1; seed <= 20; seed++) {
    for (const n of [2, 3, 4]) {
      for (const op of [{}, V01]) {
        const p = new Partida(n, { ...op, seed }).jugar();
        assert.ok(p.ganadores.length >= 1);
        const total = p.jug.reduce((a, j) => a + j.sellos, 0);
        assert.ok(total <= 24, `como mucho 4 Santuarios × (1+2+3): ${total}`);
        for (const j of p.jug) assert.strictEqual(j.mazo.length + j.desc.length + j.mano.length, 10 + j.vinculadas - j.liberadas, 'no se pierden ni duplican cartas');
      }
    }
  }
});
