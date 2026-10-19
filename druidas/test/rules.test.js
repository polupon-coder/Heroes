'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { Game, GameError } = require('../src/game');

const ing = (o = {}) => ({ eter: 0, umbra: 0, lumen: 0, raiz: 0, ...o });

// Partida de 3 con A como jugador activo, recién empezada.
function setup() {
  const g = new Game('T', { rng: () => 0, ventanaMs: 1000, now: () => 0 });
  const a = g.addPlayer('Ana');
  const b = g.addPlayer('Bruno');
  const c = g.addPlayer('Carla');
  g.start();
  g.claro = ['eter', 'umbra', 'lumen', 'raiz', 'eter', 'umbra'];
  return { g, a, b, c };
}

test('recoger 3, rellenar El Claro y pasar al estudio si nadie puede atacar', () => {
  const { g, a } = setup();
  assert.strictEqual(g.turn.pid, a.id);
  assert.throws(() => g.act(a.id, 'recoger', { slots: [0, 1] }), GameError);
  g.act(a.id, 'recoger', { slots: [0, 1, 2] });
  assert.deepStrictEqual(a.reserva, ing({ eter: 1, umbra: 1, lumen: 1 }));
  assert.strictEqual(g.claro.filter(Boolean).length, 6);
  assert.strictEqual(g.turn.paso, 'estudiar');
});

test('estudiar: máximo 2 ingredientes, aprender da puntos y devuelve a la bolsa', () => {
  const { g, a } = setup();
  g.act(a.id, 'recoger', { slots: [0, 1, 2] });
  a.reserva = ing({ eter: 1, lumen: 1, raiz: 1 });
  g.act(a.id, 'elegir', { carta: 'memoria' });
  g.act(a.id, 'colocar', { tipo: 'eter' });
  g.act(a.id, 'colocar', { tipo: 'lumen' });
  assert.throws(() => g.act(a.id, 'colocar', { tipo: 'raiz' }), /Ya has colocado/);
  g.act(a.id, 'fin_estudio');
  g.act(a.id, 'fin_turno');
  // Siguiente vuelta de A: completa y recibe la poción gratis.
  g.turnInRound = g.players.length - 1;
  g.round = 1;
  g.nextTurn();
  while (g.turn.pid !== a.id) g.nextTurn();
  g.act(a.id, 'recoger', { slots: [0, 1, 2] });
  const bag = g.bag.eter;
  g.act(a.id, 'colocar', { tipo: 'raiz' });
  assert.deepStrictEqual(a.aprendidas, ['memoria']);
  assert.deepStrictEqual(a.pociones, ['memoria']);
  assert.strictEqual(g.points(a), 3);
  assert.strictEqual(g.bag.eter, bag + 1);
  assert.throws(() => g.act(a.id, 'elegir', { carta: 'idea' }), /próximo turno/);
});

test('ataque con Robo: prioridad por orden de juego y defensa con Burbuja', () => {
  const { g, a, b, c } = setup();
  for (const p of [b, c]) {
    p.aprendidas.push('robo');
    p.reserva = ing({ umbra: 1 });
  }
  a.reserva = ing({ lumen: 2 });
  g.act(a.id, 'recoger', { slots: [0, 3, 4] }); // eter, raiz, eter
  assert.strictEqual(g.turn.paso, 'ventana');
  // Carla declara primero, pero Bruno va antes en el orden: se espera a Bruno.
  g.act(c.id, 'atacar', { carta: 'robo', tipo: 'eter' });
  assert.strictEqual(g.turn.paso, 'ventana');
  g.act(b.id, 'atacar', { carta: 'robo', tipo: 'raiz' });
  assert.strictEqual(g.turn.paso, 'defensa');
  assert.strictEqual(b.reserva.umbra, 0);
  g.act(a.id, 'defender');
  assert.strictEqual(a.reserva.lumen, 0);
  assert.strictEqual(a.reserva.raiz, 1);
  assert.strictEqual(b.reserva.raiz, 0);
  assert.strictEqual(c.reserva.umbra, 1, 'el ataque de Carla no llega a pagarse');
  assert.strictEqual(g.turn.paso, 'estudiar');
});

test('Sueño limita el estudio a 1 ingrediente, también con Idea', () => {
  const { g, a, b } = setup();
  b.pociones.push('sueno');
  b.aprendidas.push('sueno');
  a.aprendidas.push('idea');
  g.act(a.id, 'recoger', { slots: [0, 3, 4] });
  g.act(b.id, 'atacar', { carta: 'sueno' });
  assert.strictEqual(g.turn.paso, 'estudiar');
  assert.deepStrictEqual(b.pociones, []);
  a.reserva = ing({ eter: 2, raiz: 2, lumen: 1 });
  g.act(a.id, 'elegir', { carta: 'cambio' });
  g.act(a.id, 'magia', { carta: 'idea' });
  g.act(a.id, 'colocar', { tipo: 'raiz' });
  assert.throws(() => g.act(a.id, 'colocar', { tipo: 'raiz' }), /Ya has colocado 1/);
});

test('Lío solo cambia un ingrediente necesario por uno que no sirve', () => {
  const { g, a, b } = setup();
  b.aprendidas.push('lio');
  b.reserva = ing({ umbra: 1, raiz: 1 });
  b.estudio = { card: 'cambio', placed: ing() };
  a.estudio = { card: 'memoria', placed: ing() }; // eter, lumen, raiz
  g.act(a.id, 'recoger', { slots: [0, 1, 2] }); // eter, umbra, lumen
  g.claro = ['umbra', 'umbra', 'eter', 'eter', 'eter', 'eter'];
  assert.throws(() => g.act(b.id, 'atacar', { carta: 'lio', tipo: 'eter', slot: 2 }), /no perjudica/);
  g.act(b.id, 'atacar', { carta: 'lio', tipo: 'eter', slot: 0, bonus: { tipo: 'raiz' } });
  assert.strictEqual(a.reserva.eter, 0);
  assert.strictEqual(a.reserva.umbra, 2);
  assert.strictEqual(g.claro[0], 'eter');
  assert.strictEqual(b.estudio.placed.raiz, 1);
});

test('el ataque caduca si los rivales no deciden a tiempo', () => {
  const { g, a, b } = setup();
  let now = 0;
  g.now = () => now;
  b.aprendidas.push('robo');
  b.reserva = ing({ umbra: 1 });
  g.act(a.id, 'recoger', { slots: [0, 1, 2] });
  assert.strictEqual(g.turn.paso, 'ventana');
  assert.strictEqual(g.tick(), false);
  now = 2000;
  assert.strictEqual(g.tick(), true);
  assert.strictEqual(g.turn.paso, 'estudiar');
});

test('límite de 6 ingredientes al final del turno y una magia por turno', () => {
  const { g, a, b } = setup();
  g.act(a.id, 'recoger', { slots: [0, 1, 2] });
  a.reserva = ing({ eter: 4, lumen: 4 });
  b.pociones.push('memoria');
  b.reserva = ing({ eter: 2 });
  b.estudio = { card: 'pensar', placed: ing() };
  b.aprendidas.push('cambio');
  g.act(b.id, 'magia', { carta: 'memoria', colocar: [{ tipo: 'eter' }, { tipo: 'eter' }] });
  assert.strictEqual(b.estudio.placed.eter, 2);
  b.reserva.eter = 1;
  assert.throws(() => g.act(b.id, 'magia', { carta: 'cambio', colocar: [{ tipo: 'eter', como: 'raiz' }] }), /Ya has usado tu magia/);
  g.act(a.id, 'fin_turno');
  assert.strictEqual(g.turn.paso, 'descartar');
  assert.throws(() => g.act(a.id, 'descartar', { ings: { eter: 1 } }), /exactamente 2/);
  g.act(a.id, 'descartar', { ings: { eter: 1, lumen: 1 } });
  assert.strictEqual(g.turn.pid, b.id);
  // Turno nuevo: la magia vuelve a estar disponible.
  g.act(b.id, 'recoger', { slots: [0, 1, 2] });
});
