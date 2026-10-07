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

test('MANA: un jugador humano (con jugadas al azar) puede completar la partida', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const p = new Partida(3, { seed, registro: true }).iniciar();
    let azar = seed;
    const r = () => (azar = (azar * 16807) % 2147483647) / 2147483647;
    let turnos = 0;
    while (!p.fin) {
      const i = p.comenzarTurno();
      if (i !== 0) {
        p.turnoBot(i);
        p.terminarTurno();
      } else {
        const j = p.jug[0];
        while (j.mano.length) {
          const k = Math.floor(r() * j.mano.length);
          if (r() < 0.4 && j.mano[k].accion.length) p.humanoAccion(k);
          else p.humanoMana(k);
        }
        const u = p.umbral.findIndex((_, k) => p.puedeVincular(k));
        if (u >= 0) p.humanoVincular(u);
        const ini = p.turno.manaUsadas.findIndex((c) => c.inicial);
        if (ini >= 0 && p.puedeLiberar()) p.humanoLiberar('mana', ini);
        assert.ok(p.manaDisponible() >= 0, 'no se gasta más Maná del que hay');
        p.humanoTerminar();
      }
      assert.ok(++turnos <= 3 * 15, 'la partida termina');
    }
    assert.strictEqual(turnos, 45);
    assert.ok(p.ganadores.length >= 1);
    const j = p.jug[0];
    assert.strictEqual(j.mazo.length + j.desc.length + j.mano.length, 10 + j.vinculadas - j.liberadas);
    assert.ok(p.registro.some((e) => e.tipo === 'vincula'));
  }
});

test('MANA: exportar e importar una partida a medias la deja igual', () => {
  const { Partida } = require('../mana/motor');
  const a = new Partida(3, { seed: 7, registro: true }).iniciar();
  for (let t = 0; t < 7; t++) { const i = a.comenzarTurno(); a.turnoBot(i); a.terminarTurno(); }
  a.comenzarTurno();
  const texto = a.exportar();
  const b = new Partida(3, { seed: 99, registro: true }).importar(texto, 5);
  assert.equal(b.exportar(), texto);
  assert.equal(b.jug[1].mano[0], a.jug[1].mano[0]); // las cartas vuelven a ser las del catálogo
  while (!b.fin) { const i = b.comenzarTurno(); b.turnoBot(i); b.terminarTurno(); }
  assert.ok(b.ganadores.length >= 1);
});
