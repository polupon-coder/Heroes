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
const F = { rojo: 0.01, azul: 0.25, verde: 0.45, amarillo: 0.65, multicolor: 0.9 };


test('tablas de Fuerza y Maná', () => {
  assert.deepStrictEqual([0, 5, 6, 10, 11, 16, 21, 40].map(C.diceForFuerza), [1, 1, 2, 2, 3, 4, 5, 5]);
  assert.deepStrictEqual([3, 4, 5, 9, 12, 25, 99].map(C.fixedDiceForMana), [0, 0, 1, 1, 2, 5, 5]);
});

test('combinaciones con comodín multicolor', () => {
  const combo = ['rojo', 'rojo', 'azul', 'verde'];
  assert.ok(D.isSatisfied(['rojo', 'multicolor', 'azul', 'verde'], combo));
  assert.ok(!D.isSatisfied(['rojo', 'amarillo', 'azul', 'verde'], combo));
  assert.ok(D.isSatisfied(['rojo', 'rojo', 'azul', 'verde', 'amarillo'], combo));
  assert.deepStrictEqual(D.missingColors(['rojo', 'amarillo'], ['rojo', 'rojo']), ['rojo']);
  // Un multicolor ya conservado sigue siendo flexible para la maldición.
  assert.deepStrictEqual(D.successfulNewDice(['multicolor', 'azul'], [1], ['rojo', 'azul']), [1]);
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
  for (const pl of g.players) pl.ready = true;
  g.act(p.id, 'start');
  g.act(p.id, 'ready');
  return { g, p };
}






test('comercio entre combates', () => {
  const g = new Game('T');
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  for (const p of [a, b]) g.act(p.id, 'setHero', { raza: 'elfo', clase: 'mago' });
  for (const pl of g.players) pl.ready = true;
  g.act(a.id, 'start');
  a.hero.inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 2, nombre: 'Yelmo +2' };
  b.hero.inv.pociones.push({ id: 'p', tipo: 'pocion', efecto: 'curacion', valor: 3, nombre: 'Poción' });
  // A publica lo que ofrece, B responde con lo que da a cambio y A acepta.
  g.act(a.id, 'offerTrade', { give: ['y'] });
  assert.throws(() => g.act(a.id, 'offerTrade', { give: ['y'] }), /oferta/);
  g.act(b.id, 'counterTrade', { tradeId: g.trades[0].id, give: ['p'] });
  const t = g.trades[0];
  g.act(a.id, 'answerTrade', { tradeId: t.id, counterId: t.counters[0].id, accept: true });
  assert.strictEqual(b.hero.inv.yelmo.id, 'y');
  assert.strictEqual(a.hero.inv.pociones[0].id, 'p');
  assert.strictEqual(g.trades.length, 0);
});


test('tamaños de monstruo: más colores, más daño y mejores recompensas', () => {
  assert.deepStrictEqual(C.variantCombo(['rojo', 'azul'], 1), ['rojo', 'azul']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 2), ['rojo', 'rojo', 'rojo', 'rojo']);
  assert.deepStrictEqual(C.variantCombo(['rojo', 'rojo', 'azul'], 3), ['rojo', 'rojo', 'rojo', 'rojo', 'rojo']);
  assert.strictEqual(C.variantCombo(['rojo', 'azul', 'verde', 'amarillo', 'amarillo'], 3).length, 5);
  const { g } = soloGame(() => F.multicolor);
  const m = g.makeOffer(2, 3, 'color');
  assert.strictEqual(m.variante, 3);
  assert.strictEqual(m.dano, C.monsterDamage(m.level) + 2);
  assert.ok(m.rewards.length > 0);
});




// Lanza hasta que el combate termine.
function fightOut(g, p) {
  let guard = 0;
  while (p.combat && p.combat.status === 'activo' && guard++ < 10) {
    if (p.combat.rolls >= 3) g.act(p.id, 'concede');
    else g.act(p.id, 'roll', {});
  }
}

test('estadísticas iniciales: Maná mínimo 5 y Fuerza mínima 10', () => {
  // Humano Guerrero es combinación natural: +1 Fuerza y +1 Maná.
  assert.deepStrictEqual(baseStats('humano', 'guerrero'), { vida: 14, mana: 9, fuerza: 14 });
  // Durgan Mago es una combinación rara: −1 Vida.
  assert.strictEqual(baseStats('durgan', 'mago').vida, 13);
  // Nadie empieza con más de 2 comodines.
  for (const r of Object.keys(C.RACES)) for (const c of Object.keys(C.CLASSES)) assert.ok(C.fixedDiceForMana(baseStats(r, c).mana) <= 2);
  assert.strictEqual(C.afinidad('durgan', 'clerigo'), 'rara');
  for (const r of Object.keys(C.RACES)) for (const c of Object.keys(C.CLASSES)) {
    const b = baseStats(r, c);
    assert.ok(b.mana >= 5 && b.fuerza >= 10, `${r} ${c}`);
  }
});



test('maleficios: uno recibido por ronda; comercio: uno por ronda', () => {
  const g = new Game('T');
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  const c = g.addPlayer('C');
  g.act(a.id, 'setHero', { raza: 'elfo', clase: 'mago' });
  g.act(b.id, 'setHero', { raza: 'gnomo', clase: 'mago' });
  g.act(c.id, 'setHero', { raza: 'enano', clase: 'guerrero' });
  for (const pl of g.players) pl.ready = true;
  g.act(a.id, 'start');
  g.round = 2;
  g.act(a.id, 'curse', { targetId: c.id, amount: 5 });
  assert.strictEqual(c.hero.curses, 1);
  assert.throws(() => g.act(b.id, 'curse', { targetId: c.id, amount: 5 }), /maleficio/);
  a.hero.inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 2, nombre: 'Yelmo +2' };
  b.hero.inv.botas = { id: 'z', tipo: 'equipo', slot: 'botas', bonus: 2, nombre: 'Botas +2' };
  b.hero.inv.pociones.push({ id: 'q', tipo: 'pocion', efecto: 'curacion', valor: 2, nombre: 'Poción' });
  g.act(a.id, 'offerTrade', { give: ['y'] });
  g.act(b.id, 'counterTrade', { tradeId: g.trades[0].id, give: ['q'] });
  g.act(a.id, 'answerTrade', { tradeId: g.trades[0].id, counterId: g.trades[0].counters[0].id, accept: true });
  assert.throws(() => g.act(b.id, 'offerTrade', { give: ['z'] }), /comerciado/);
});



test('maleficio: anula una esfera acertada y obliga a relanzarla', () => {
  const { g, p } = soloGame(seq([0.5]), 'durgan', 'guerrero');
  p.hero.curses = 1;
  p.combat.cursesLeft = 1;
  p.combat.targets = [{ tipo: 'color', combo: ['rojo', 'rojo', 'rojo', 'rojo', 'rojo'] }];
  g.rng = seq([F.rojo, 0.01, F.amarillo, 0.65, F.amarillo, 0.65, F.amarillo, 0.65, F.amarillo, 0.65]);
  g.act(p.id, 'roll', {});
  assert.strictEqual(p.combat.cursesLeft, 0);
  // Queda anotado qué esfera repitió el maleficio y qué había salido.
  assert.strictEqual(p.combat.cursed.length, 1);
  assert.strictEqual(p.combat.cursed[0].face, 'rojo');
  const i = p.combat.cursed[0].index;
  // La esfera queda anulada (no cuenta para nada)…
  assert.strictEqual(p.combat.dice[i].face, 'maldita');
  assert.ok(!g.targetStatus(p.combat).some((t) => t.used.has(i)));
  // …y aunque intentes guardarla, se relanza.
  g.rng = () => F.azul;
  g.act(p.id, 'roll', { hold: [i] });
  assert.strictEqual(p.combat.dice[i].face, 'azul');
  assert.ok(!p.combat.dice[i].maldita);
});

test('caer a 0 Vida: pierde todos sus objetos', () => {
  const { g, p } = soloGame(() => F.amarillo, 'durgan', 'guerrero');
  p.hero.vida = 1;
  const inv = p.hero.inv;
  inv.botas = { id: 'b', tipo: 'equipo', slot: 'botas', bonus: 1, nombre: 'Botas +1' };
  inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 4, nombre: 'Yelmo +4' };
  inv.pociones.push({ id: 'p', tipo: 'pocion', efecto: 'curacion', valor: 2, nombre: 'Poción' });
  p.combat.targets = p.combat.targets.map((t) => ({ ...t, combo: t.tipo === 'color' ? ['rojo', 'azul', 'verde'] : ['circulo', 'cuadrado', 'rombo'] }));
  fightOut(g, p);
  assert.strictEqual(g.phase, 'prep');
  assert.strictEqual(p.hero.vida, p.hero.base.vida);
  assert.strictEqual(p.hero.inv.yelmo, null);
  assert.strictEqual(p.hero.inv.botas, null);
  assert.strictEqual(p.hero.inv.pociones.length, 0);
  assert.strictEqual(p.hero.caidas, 1);
});

test('robo con tirada: 1-2 roba, 3-5 pierde el Maná, uno por ronda', () => {
  const mk = (rngVal) => {
    const g = new Game('T', { rng: () => 0.5 });
    const a = g.addPlayer('Ana');
    const b = g.addPlayer('Beto');
    for (const [pl, r] of [[a, 'humano'], [b, 'elfo']]) g.act(pl.id, 'setHero', { raza: r, clase: 'mago' });
    for (const pl of g.players) pl.ready = true;
    g.startGame();
    g.phase = 'prep';
    const it = { id: 'x1', tipo: 'pocion', efecto: 'curacion', valor: 2, nombre: 'Poción' };
    b.hero.inv.pociones.push(it);
    g.rng = () => rngVal;
    g.act(a.id, 'stealRoll', { targetId: b.id, targetItemId: 'x1' });
    return { g, a, b };
  };
  const ok = mk(0.1); // 1
  assert.ok(ok.a.hero.inv.pociones.some((x) => x.id === 'x1'));
  assert.ok(!ok.b.hero.inv.pociones.some((x) => x.id === 'x1'));
  assert.throws(() => ok.g.act(ok.a.id, 'stealRoll', { targetId: ok.b.id, targetItemId: 'x1' }));
  const bad = mk(0.6); // 4
  assert.strictEqual(bad.g.availableMana(bad.a), 0);
  assert.ok(bad.b.hero.inv.pociones.some((x) => x.id === 'x1'));
  const nada = mk(0.95); // 6
  assert.strictEqual(nada.g.availableMana(nada.a), nada.a.hero.base.mana);
});


test('antes de la final: maleficio y robo solo al rival; sin comercio con él', () => {
  const g = new Game('T', { rng: () => 0.5 });
  const [a, b, c] = ['A', 'B', 'C'].map((n) => g.addPlayer(n));
  for (const p of [a, b, c]) g.act(p.id, 'setHero', { raza: 'humano', clase: 'mago' });
  for (const pl of g.players) pl.ready = true;
  g.act(a.id, 'start');
  g.round = 13;
  g.phase = 'prep';
  g.pendingFinal = [a.id, b.id];
  c.hero.inv.yelmo = { id: 'y', tipo: 'equipo', slot: 'yelmo', bonus: 2, nombre: 'Yelmo +2' };
  a.hero.inv.botas = { id: 'z', tipo: 'equipo', slot: 'botas', bonus: 2, nombre: 'Botas +2' };
  b.hero.inv.pociones.push({ id: 'q', tipo: 'pocion', efecto: 'curacion', valor: 2, nombre: 'Poción' });
  assert.throws(() => g.act(a.id, 'curse', { targetId: c.id, amount: 5 }), /solo puedes lanzar un maleficio a B/);
  assert.throws(() => g.act(a.id, 'stealRoll', { targetId: c.id, targetItemId: 'y' }), /solo puedes robar a B/);
  g.act(a.id, 'curse', { targetId: b.id, amount: 5 });
  g.act(a.id, 'offerTrade', { give: ['z'] });
  const t = g.trades[0];
  assert.throws(() => g.act(b.id, 'counterTrade', { tradeId: t.id, give: ['q'] }), /rival de la final/);
});

test('armas afines: +1 de Fuerza solo para su clase', () => {
  let n = 0;
  const arco = I.makeEquipment(() => 0.4, 5, () => 'x' + n++, null);
  const inv = I.emptyInventory();
  const it = { id: 'a', tipo: 'equipo', slot: 'dosManos', forma: 'arco', bonus: 3, stat: 'fuerza', afin: C.ARMA_AFIN.arco, nombre: 'Arco +3' };
  inv.manos.push(it);
  assert.strictEqual(I.equipmentFuerza(inv, 'explorador'), 4);
  assert.strictEqual(I.equipmentFuerza(inv, 'ladron'), 4);
  assert.strictEqual(I.equipmentFuerza(inv, 'mago'), 3);
  // Las armas se llaman sin adornos.
  if (arco.forma && C.ARMA_AFIN[arco.forma]) assert.match(arco.nombre, /^(Espada|Maza|Arco|Hacha|Báculo|Cayado|Escudo) \+\d+$/);
});


test('solo un escudo: el segundo compite con el primero', () => {
  const inv = I.emptyInventory();
  const e1 = { id: 'e1', tipo: 'equipo', slot: 'escudo', bonus: 1, nombre: 'Escudo +1' };
  const e2 = { id: 'e2', tipo: 'equipo', slot: 'escudo', bonus: 2, nombre: 'Escudo +2' };
  assert.strictEqual(I.tryPlace(inv, e1), null);
  assert.deepStrictEqual(I.tryPlace(inv, e2), [e1]);
  // Con un arma en la otra mano, el escudo nuevo sigue compitiendo solo con el escudo.
  const sw = { id: 's', tipo: 'equipo', slot: 'arma', bonus: 2, nombre: 'Espada +2' };
  assert.strictEqual(I.tryPlace(inv, sw), null);
  assert.deepStrictEqual(I.tryPlace(inv, e2), [e1]);
  I.resolveConflict(inv, e2, 'e1');
  assert.deepStrictEqual(inv.manos.map((x) => x.id).sort(), ['e2', 's']);
});

test('poción de Maná fuera del combate: se guarda para el próximo', () => {
  const g = new Game('T', { rng: () => 0.5 });
  const a = g.addPlayer('A');
  g.act(a.id, 'setHero', { raza: 'humano', clase: 'mago' });
  for (const pl of g.players) pl.ready = true;
  g.act(a.id, 'start');
  g.phase = 'prep';
  a.hero.inv.pociones.push({ id: 'pm', tipo: 'pocion', efecto: 'mana', valor: 4, nombre: 'Poción de Maná +4' });
  g.act(a.id, 'useItem', { itemId: 'pm' });
  assert.strictEqual(a.hero.manaNext, 4);
  const m0 = g.availableMana(a);
  g.newCombat(a, { kind: 'monstruo', combo: ['rojo'] });
  assert.strictEqual(g.combatMana(a), m0 + 4);
  assert.strictEqual(a.hero.manaNext, 0);
});

test('mismo dispositivo: needsAction indica a quién le toca', () => {
  const g = new Game('T', { rng: () => 0.5 });
  const a = g.addPlayer('A');
  const b = g.addPlayer('B');
  g.lobbyStage = 'heroes';
  assert.ok(g.needsAction(a.id) && g.needsAction(b.id));
  for (const p of [a, b]) g.act(p.id, 'setHero', { raza: 'humano', clase: 'mago' });
  g.act(a.id, 'lobbyReady', { value: true });
  assert.ok(!g.needsAction(a.id) && g.needsAction(b.id));
  g.act(b.id, 'lobbyReady', { value: true });
  assert.strictEqual(g.phase, 'prep');
  assert.ok(g.needsAction(a.id));
  g.act(a.id, 'ready');
  assert.ok(!g.needsAction(a.id) && g.needsAction(b.id));
});

function battleGame() {
  const g = new Game('T', { rng: Math.random });
  const ps = ['A', 'B', 'C'].map((n) => g.addPlayer(n));
  for (const p of ps) g.act(p.id, 'setHero', { raza: 'humano', clase: 'guerrero' });
  for (const pl of g.players) pl.ready = true;
  g.act(ps[0].id, 'start');
  g.round = 13;
  for (const p of ps) g.act(p.id, 'ready');
  return { g, ps };
}
const setFaces = (p, faces) => { p.combat.rolls = 1; p.combat.dice = faces.map((f) => ({ face: f, shape: 'circulo', held: false, fixed: false })); };

test('cinco monstruos por ronda, de pequeño a grande, y se derrota a cualquiera completado', () => {
  const g = new Game('T', { rng: Math.random });
  const a = g.addPlayer('A');
  g.act(a.id, 'setHero', { raza: 'humano', clase: 'mago' });
  for (const pl of g.players) pl.ready = true;
  g.act(a.id, 'start');
  g.act(a.id, 'ready');
  assert.strictEqual(g.phase, 'combat');
  assert.deepStrictEqual(a.offers.map((m) => m.combo.length), [4, 4, 5, 5, 5]);
  assert.deepStrictEqual(a.offers.map((m) => m.tier), [0, 1, 2, 3, 4]);
  assert.strictEqual(a.combat.dice.length, 5);
  assert.strictEqual(a.combat.maxRolls, 3);
  // Las esferas completan el primero: se puede derrotar ese, no otro.
  g.act(a.id, 'roll', {});
  const m0 = a.offers[0];
  const key = m0.tipo === 'forma' ? 'shape' : 'face';
  // La otra propiedad (forma o color) se reparte para no completar nada sin querer.
  const otherFaces = ['rojo', 'azul', 'verde', 'amarillo', 'rojo'];
  const otherShapes = ['circulo', 'cuadrado', 'rombo', 'triangulo', 'circulo'];
  const used = m0.combo.concat([m0.combo[0] === m0.combo[3] ? m0.combo[0] : m0.combo[3]]);
  a.combat.dice = used.map((v, i) => ({ face: key === 'face' ? v : otherFaces[i], shape: key === 'shape' ? v : otherShapes[i], held: false, fixed: false }));
  assert.throws(() => g.act(a.id, 'present', { index: 4 }), /no completan/);
  g.act(a.id, 'present', { index: 0 });
  assert.strictEqual(a.stage, 'recompensa');
});

test('la Fuerza da tiradas: 4 con Fuerza 18 o más', () => {
  assert.strictEqual(C.rollsForFuerza(17), 3);
  assert.strictEqual(C.rollsForFuerza(18), 4);
  assert.strictEqual(C.rollsForFuerza(28), 5);
  assert.deepStrictEqual([14, 19, 20, 29, 30].map(C.fuerzaDamageBonus), [0, 0, 1, 1, 2]);
});

test('batalla final: todos contra todos, daño por color y escudo con el propio', () => {
  const { g, ps } = battleGame();
  const [a, b, c] = ps;
  assert.strictEqual(g.tournament.stage, 'batalla');
  assert.ok(ps.every((p) => p.combat && p.combat.kind === 'batalla'));
  // A golpea a B con 4 esferas de su color (−2); B se cubre con 1 de su color.
  setFaces(a, [b.color, b.color, b.color, 'multicolor', a.color]);
  setFaces(b, [b.color, c.color, c.color, 'verde', 'verde'].map((f) => f));
  setFaces(c, [a.color, a.color, 'verde', 'verde', 'verde']);
  const vb = b.hero.vida;
  const va = a.hero.vida;
  g.act(a.id, 'strike', { targetId: b.id });
  assert.throws(() => g.act(a.id, 'strike', { targetId: c.id }), /Ya has atacado/);
  g.act(b.id, 'strike', { targetId: c.id });
  g.act(c.id, 'strike', { targetId: a.id });
  assert.strictEqual(b.hero.vida, vb - 1); // 2 de daño − 1 de escudo
  assert.strictEqual(a.hero.vida, va); // C solo saca 2 de su color: sin daño
  assert.strictEqual(g.tournament.round, 2);
});

test('batalla final: un maleficio por ronda y gana el último en pie', () => {
  const { g, ps } = battleGame();
  const [a, b, c] = ps;
  a.hero.base.mana = 10;
  g.act(a.id, 'duelCurse', { amount: 5, targetId: b.id });
  assert.strictEqual(b.combat.cursesLeft, 1);
  assert.throws(() => g.act(a.id, 'duelCurse', { amount: 5, targetId: c.id }), /esta ronda/);
  b.hero.vida = 1;
  c.hero.vida = 1;
  setFaces(a, [b.color, b.color, b.color, b.color, b.color]);
  setFaces(b, ['x', 'x', 'x', 'x', 'x']);
  setFaces(c, [b.color, b.color, b.color, 'x', 'x']);
  g.act(a.id, 'strike', { targetId: b.id });
  g.act(b.id, 'strike', { targetId: c.id });
  g.act(c.id, 'strike', { targetId: b.id });
  assert.ok(!g.tournament.alive.includes(b.id));
  c.hero.vida = 1;
  setFaces(a, [c.color, c.color, c.color, 'x', 'x']);
  setFaces(c, ['x', 'x', 'x', 'x', 'x']);
  g.act(a.id, 'strike', { targetId: c.id });
  g.act(c.id, 'strike', { targetId: a.id });
  assert.strictEqual(g.phase, 'fin');
  assert.strictEqual(g.winner, a.id);
});
