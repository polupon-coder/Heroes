'use strict';

const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/config');
const D = require('../src/dice');
const I = require('../src/items');
const { Game, baseStats } = require('../src/game');

function seq(values) {
  let i = 0;
  return () => values[i++ % values.length];
}
// Valor de rng que produce cada cara.
const F = { rojo: 0.01, azul: 0.2, verde: 0.4, amarillo: 0.55, negro: 0.7, blanco: 0.9 };

test('Humano Guerrero 14/6/12 y Fuerza inicial mínima 10', () => {
  assert.deepStrictEqual(baseStats('humano', 'guerrero'), { vida: 14, mana: 6, fuerza: 12 });
  assert.strictEqual(baseStats('gnomo', 'mago').fuerza, 10);
  assert.strictEqual(baseStats('durgan', 'barbaro').fuerza, 15);
});

test('tablas de Fuerza y Maná', () => {
  assert.deepStrictEqual([0, 5, 6, 10, 11, 16, 21, 40].map(C.diceForFuerza), [1, 1, 2, 2, 3, 4, 5, 5]);
  assert.deepStrictEqual([3, 4, 5, 9, 12, 25, 99].map(C.fixedDiceForMana), [0, 0, 1, 1, 2, 5, 5]);
});

test('combinaciones con comodín blanco y negro', () => {
  const combo = ['rojo', 'rojo', 'azul', 'verde'];
  assert.ok(D.isSatisfied(['rojo', 'blanco', 'azul', 'verde'], combo));
  assert.ok(!D.isSatisfied(['rojo', 'negro', 'azul', 'verde'], combo));
  assert.ok(D.isSatisfied(['rojo', 'rojo', 'azul', 'verde', 'negro'], combo));
  assert.deepStrictEqual(D.missingColors(['rojo', 'negro'], ['rojo', 'rojo']), ['rojo']);
  // Un blanco ya conservado sigue siendo flexible para la maldición.
  assert.deepStrictEqual(D.successfulNewDice(['blanco', 'azul'], [1], ['rojo', 'azul']), [1]);
});

test('ocupación de manos: arma a dos manos y conflictos', () => {
  const inv = I.emptyInventory();
  const mk = (slot, bonus, id) => ({ id, tipo: 'equipo', slot, bonus, nombre: id });
  assert.strictEqual(I.tryPlace(inv, mk('arma', 1, 'a')), null);
  assert.strictEqual(I.tryPlace(inv, mk('escudo', 1, 'b')), null);
  const big = mk('dosManos', 4, 'c');
  const conf = I.tryPlace(inv, big);
  assert.strictEqual(conf.length, 2);
  I.resolveConflict(inv, big, 'todas');
  assert.deepStrictEqual(inv.manos.map((x) => x.id), ['c']);
  assert.strictEqual(I.equipmentFuerza(inv), 4);
});

function soloGame(rng, raza = 'humano', clase = 'guerrero') {
  const g = new Game('T', { rng });
  const p = g.addPlayer('Ana');
  g.act(p.id, 'setHero', { raza, clase });
  g.act(p.id, 'start');
  g.act(p.id, 'ready');
  return { g, p };
}

test('combate: tres tiradas, conservar dados y maldición', () => {
  const { g, p } = soloGame(() => F.blanco);
  p.offers[0].combo = ['rojo', 'azul'];
  g.act(p.id, 'chooseMonster', { index: 0 });
  assert.strictEqual(p.combat.diceCount, 3);
  g.act(p.id, 'roll', {});
  assert.strictEqual(p.combat.status, 'victoria');
  assert.strictEqual(p.stage, 'recompensa');

  // Maldición: el primer rojo exitoso se repite.
  const g2 = soloGame(seq([0.5]));
  const q = g2.p;
  q.hero.curses = 1;
  g2.g.rng = seq([F.rojo, F.negro, F.negro, F.negro]);
  g2.g.act(q.id, 'chooseMonster', { index: 0 });
  g2.g.act(q.id, 'roll', {});
  assert.strictEqual(q.combat.dice[0].face, 'negro');
  assert.strictEqual(q.combat.cursesLeft, 0);
});

test('tamaños de monstruo: más colores, más daño y mejores recompensas', () => {
  assert.deepStrictEqual(C.variantCombo(['rojo', 'azul'], 1), ['rojo', 'azul']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 2), ['rojo', 'rojo', 'rojo']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 3), ['rojo', 'rojo', 'rojo', 'rojo']);
  assert.strictEqual(C.variantCombo(['rojo', 'azul', 'verde', 'amarillo', 'amarillo'], 3).length, 5);
  const { p } = soloGame(() => F.blanco); // 0.9 -> tamaño grande
  const m = p.offers[0];
  assert.strictEqual(m.variante, 3);
  assert.strictEqual(m.dano, C.monsterDamage(m.level) + 2);
});

test('caer a 0 Vida en Fase 1 reinicia el héroe', () => {
  const { g, p } = soloGame(() => F.negro, 'gnomo', 'mago');
  p.hero.vida = 1;
  p.hero.inv.botas = { id: 'x', tipo: 'equipo', slot: 'botas', bonus: 1, nombre: 'Botas +1' };
  g.act(p.id, 'chooseMonster', { index: 0 });
  g.act(p.id, 'roll', {});
  g.act(p.id, 'concede');
  assert.strictEqual(g.phase, 'prep'); // ronda terminada (derrota)
  assert.strictEqual(p.hero.vida, p.hero.base.vida);
  assert.strictEqual(p.hero.inv.botas, null);
  assert.strictEqual(p.hero.caidas, 1);
});

test('duelo del torneo: 4 del color del rival, 3 de daño por golpe', () => {
  const g = new Game('T', { rng: () => F.blanco });
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  for (const p of [a, b]) g.act(p.id, 'setHero', { raza: 'durgan', clase: 'barbaro' });
  g.act(a.id, 'start');
  g.settings.pvpHits = 4;
  for (const p of [a, b]) p.hero.inv.armadura = { id: p.id + 'arm', tipo: 'equipo', slot: 'armadura', bonus: 20, nombre: 'Coraza' };
  g.round = 13;
  g.act(a.id, 'ready');
  g.act(b.id, 'ready');
  assert.strictEqual(g.phase, 'torneo');
  const m = g.tournament.matches[0];
  let guard = 0;
  while (g.phase === 'torneo' && guard++ < 50) {
    const att = g.player(m.attacker);
    assert.deepStrictEqual(att.combat.combo, Array(4).fill(g.player(m.attacker === a.id ? b.id : a.id).color));
    g.act(att.id, 'roll', {});
  }
  assert.strictEqual(g.phase, 'fin');
  // 17 de Vida -> 6 golpes; el primero en atacar gana.
  assert.strictEqual(g.player(g.winner).hero.vida, 17 - 5 * 3);
});

test('magia: 5 de Maná = 1 maldición y Maná gastado hasta el próximo combate', () => {
  const g = new Game('T', { rng: () => F.rojo });
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  g.act(a.id, 'setHero', { raza: 'elfo', clase: 'mago' });
  g.act(b.id, 'setHero', { raza: 'enano', clase: 'guerrero' });
  g.act(a.id, 'start');
  g.round = 2;
  g.act(a.id, 'curse', { targetId: b.id, amount: 10 });
  assert.strictEqual(b.hero.curses, 2);
  assert.strictEqual(g.availableMana(a), 1);
  assert.throws(() => g.act(a.id, 'curse', { targetId: b.id, amount: 5 }));
});

test('comercio entre combates', () => {
  const g = new Game('T');
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  for (const p of [a, b]) g.act(p.id, 'setHero', { raza: 'elfo', clase: 'mago' });
  g.act(a.id, 'start');
  a.hero.inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 2, nombre: 'Yelmo +2' };
  b.hero.inv.pociones.push({ id: 'p', tipo: 'pocion', efecto: 'curacion', valor: 3, nombre: 'Poción' });
  g.act(a.id, 'proposeTrade', { toId: b.id, give: ['y'], want: ['p'] });
  g.act(b.id, 'respondTrade', { tradeId: g.trades[0].id, accept: true });
  assert.strictEqual(b.hero.inv.yelmo.id, 'y');
  assert.strictEqual(a.hero.inv.pociones[0].id, 'p');
});

test('golpe graduado del torneo', () => {
  assert.deepStrictEqual([0, 2, 3, 4, 5, 6].map((n) => C.pvpDamage(n, 5)), [0, 0, 1, 2, 3, 3]);
  assert.deepStrictEqual([1, 2, 3, 4].map((n) => C.pvpDamage(n, 4)), [0, 1, 2, 3]);
  assert.strictEqual(C.pvpMinResults(5), 3);

  // Un héroe con 3 dados que solo saca 3 resultados hace 1 de daño.
  const g = new Game('T', { rng: () => F.blanco });
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  g.act(a.id, 'setHero', { raza: 'humano', clase: 'guerrero' }); // Fuerza 12: 3 dados
  g.act(b.id, 'setHero', { raza: 'humano', clase: 'guerrero' });
  g.act(a.id, 'start');
  g.round = 13;
  g.act(a.id, 'ready');
  g.act(b.id, 'ready');
  const m = g.tournament.matches[0];
  const att = g.player(m.attacker);
  const def = g.player(m.attacker === a.id ? b.id : a.id);
  g.act(att.id, 'roll', {});
  g.act(att.id, 'concede');
  assert.strictEqual(def.hero.vida, def.hero.base.vida - 1);
  assert.strictEqual(m.attacker, def.id);
});

test('tamaños de monstruo: más colores, más daño y mejores recompensas', () => {
  assert.deepStrictEqual(C.variantCombo(['rojo', 'azul'], 1), ['rojo', 'azul']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 2), ['rojo', 'rojo', 'rojo']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 3), ['rojo', 'rojo', 'rojo', 'rojo']);
  assert.strictEqual(C.variantCombo(['rojo', 'azul', 'verde', 'amarillo', 'amarillo'], 3).length, 5);
  const { p } = soloGame(() => F.blanco); // 0.9 -> tamaño grande
  const m = p.offers[0];
  assert.strictEqual(m.variante, 3);
  assert.strictEqual(m.dano, C.monsterDamage(m.level) + 2);
});

test('caer a 0 Vida conserva el equipo salvo el mejor objeto', () => {
  const { g, p } = soloGame(() => F.negro);
  p.hero.vida = 1;
  const inv = p.hero.inv;
  inv.botas = { id: 'b', tipo: 'equipo', slot: 'botas', bonus: 1, nombre: 'Botas +1' };
  inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 4, nombre: 'Yelmo +4' };
  inv.pociones.push({ id: 'p', tipo: 'pocion', efecto: 'curacion', valor: 2, nombre: 'Poción' });
  g.act(p.id, 'chooseMonster', { index: 0 });
  g.act(p.id, 'roll', {});
  g.act(p.id, 'concede');
  assert.strictEqual(p.hero.inv.yelmo, null);
  assert.strictEqual(p.hero.inv.botas.id, 'b');
  assert.strictEqual(p.hero.inv.pociones.length, 0);
});
