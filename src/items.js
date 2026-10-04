'use strict';

const C = require('./config');

const SHIELD_NAMES = ['Rodela', 'Escudo', 'Pavés'];
const HELMET_NAMES = ['Yelmo', 'Casco', 'Capucha reforzada'];
const ARMOR_NAMES = ['Cota de malla', 'Armadura de cuero', 'Coraza'];
const BOOTS_NAMES = ['Botas', 'Grebas', 'Botas de viaje'];

const SLOT_LABEL = {
  arma: 'Arma',
  dosManos: 'Arma a dos manos',
  escudo: 'Escudo',
  yelmo: 'Yelmo',
  armadura: 'Armadura',
  botas: 'Botas',
};

const HAND_SLOTS = ['arma', 'dosManos', 'escudo'];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

function makeEquipment(rng, level, nextId) {
  const slot = pick(rng, ['arma', 'arma', 'dosManos', 'escudo', 'yelmo', 'armadura', 'botas']);
  let bonus = C.equipmentBonus(level);
  // Grado I, II o III según la calidad (para su ilustración).
  const grado = bonus <= 2 ? 1 : bonus <= 3 ? 2 : 3;
  if (slot === 'dosManos') bonus += C.TWO_HANDED_EXTRA;
  // Las armas a dos manos pueden ser arcos, hachas o báculos.
  const forma = slot === 'dosManos' ? pick(rng, ['arco', 'hacha', 'baculo']) : undefined;
  const names = {
    arma: [['Espada de hierro', 'Espada corta'], ['Espada de acero', 'Espada larga'], ['Espada rúnica', 'Espada élfica']][grado - 1],
    dosManos: {
      arco: [['Arco de caza', 'Arco corto'], ['Arco largo', 'Arco de tejo'], ['Arco élfico', 'Arco del bosque']],
      hacha: [['Hacha de guerra', 'Hacha de leñador'], ['Gran hacha', 'Hacha doble'], ['Hacha rúnica', 'Hacha de los reyes']],
      baculo: [['Báculo de aprendiz', 'Vara de cristal'], ['Báculo arcano', 'Báculo de zafiro'], ['Báculo astral', 'Báculo del archimago']],
    }[forma]?.[grado - 1],
    escudo: SHIELD_NAMES,
    yelmo: HELMET_NAMES,
    armadura: ARMOR_NAMES,
    botas: BOOTS_NAMES,
  }[slot];
  return {
    id: nextId(),
    tipo: 'equipo',
    slot,
    forma,
    bonus,
    grado,
    nombre: `${pick(rng, names)} +${bonus}`,
  };
}

function makeConsumable(rng, level, tipo, nextId) {
  const valor = C.consumablePower(level);
  const efectos = tipo === 'pocion' ? ['mana', 'curacion'] : ['mana', 'curacion', 'robo'];
  const efecto = pick(rng, efectos);
  const base = tipo === 'pocion' ? 'Poción' : 'Pergamino';
  let nombre;
  if (efecto === 'mana') nombre = `${base} de Maná +${valor}`;
  else if (efecto === 'curacion') nombre = `${base} de Curación +${valor}`;
  else nombre = `${base} de Robo`;
  // Grado I, II o III según el nivel del que sale (para su ilustración).
  const grado = level <= 4 ? 1 : level <= 8 ? 2 : 3;
  return { id: nextId(), tipo, efecto, grado, valor: efecto === 'robo' ? 0 : valor, nombre };
}

function makeReward(rng, level, nextId) {
  const r = rng();
  const w = C.REWARD_WEIGHTS;
  if (r < w.equipo) return makeEquipment(rng, level, nextId);
  if (r < w.equipo + w.pocion) return makeConsumable(rng, level, 'pocion', nextId);
  return makeConsumable(rng, level, 'pergamino', nextId);
}

// --- Inventario del héroe ---------------------------------------------------

function emptyInventory() {
  return { yelmo: null, armadura: null, botas: null, manos: [], pociones: [], pergaminos: [] };
}

function equippedItems(inv) {
  return [inv.yelmo, inv.armadura, inv.botas, ...inv.manos].filter(Boolean);
}

function allItems(inv) {
  return [...equippedItems(inv), ...inv.pociones, ...inv.pergaminos];
}

function equipmentFuerza(inv) {
  return equippedItems(inv).reduce((s, it) => s + it.bonus, 0);
}

function findItem(inv, id) {
  return allItems(inv).find((it) => it.id === id) || null;
}

function removeItem(inv, id) {
  for (const k of ['yelmo', 'armadura', 'botas']) {
    if (inv[k] && inv[k].id === id) {
      const it = inv[k];
      inv[k] = null;
      return it;
    }
  }
  for (const k of ['manos', 'pociones', 'pergaminos']) {
    const i = inv[k].findIndex((it) => it.id === id);
    if (i >= 0) return inv[k].splice(i, 1)[0];
  }
  return null;
}

// Intenta colocar un objeto. Si cabe, lo coloca y devuelve null. Si no,
// devuelve la lista de objetos con los que entra en conflicto (el jugador
// tendrá que elegir cuál conservar).
function tryPlace(inv, item) {
  if (item.tipo === 'pocion' || item.tipo === 'pergamino') {
    const list = item.tipo === 'pocion' ? inv.pociones : inv.pergaminos;
    const max = item.tipo === 'pocion' ? C.MAX_POTIONS : C.MAX_SCROLLS;
    if (list.length < max) {
      list.push(item);
      return null;
    }
    return [...list];
  }
  if (!HAND_SLOTS.includes(item.slot)) {
    if (!inv[item.slot]) {
      inv[item.slot] = item;
      return null;
    }
    return [inv[item.slot]];
  }
  const twoHanded = inv.manos.find((it) => it.slot === 'dosManos');
  if (item.slot === 'dosManos') {
    if (inv.manos.length === 0) {
      inv.manos.push(item);
      return null;
    }
    return [...inv.manos];
  }
  if (twoHanded) return [twoHanded];
  if (inv.manos.length < 2) {
    inv.manos.push(item);
    return null;
  }
  return [...inv.manos];
}

// Opciones para resolver un conflicto de espacio.
function conflictOptions(inv, item, conflicts) {
  const opts = [{ id: 'descartar', label: `Descartar ${item.nombre}` }];
  if (item.slot === 'dosManos') {
    opts.push({ id: 'todas', label: `Descartar ${conflicts.map((c) => c.nombre).join(' y ')}` });
  } else {
    for (const c of conflicts) opts.push({ id: c.id, label: `Descartar ${c.nombre}` });
  }
  return opts;
}

function resolveConflict(inv, item, choice) {
  if (choice === 'descartar') return { discarded: [item] };
  const discarded = [];
  if (choice === 'todas' && item.slot === 'dosManos') {
    discarded.push(...inv.manos);
    inv.manos = [];
  } else {
    const removed = removeItem(inv, choice);
    if (!removed) throw new Error('Opción no válida');
    discarded.push(removed);
  }
  const conflicts = tryPlace(inv, item);
  if (conflicts) throw new Error('El objeto sigue sin caber');
  return { discarded };
}

module.exports = {
  SLOT_LABEL,
  makeReward,
  makeEquipment,
  makeConsumable,
  emptyInventory,
  equippedItems,
  allItems,
  equipmentFuerza,
  findItem,
  removeItem,
  tryPlace,
  conflictOptions,
  resolveConflict,
};
