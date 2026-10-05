'use strict';

const C = require('./config');


const SLOT_LABEL = {
  arma: 'Arma',
  dosManos: 'Arma a dos manos',
  escudo: 'Escudo',
  yelmo: 'Yelmo',
  armadura: 'Armadura',
  tunica: 'Túnica',
  botas: 'Botas',
};

const HAND_SLOTS = ['arma', 'dosManos', 'escudo'];

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

// Tiende a ofrecer equipo de los huecos que el héroe aún tiene vacíos.
function pickSlot(rng, inv) {
  const slots = ['arma', 'arma', 'dosManos', 'escudo', 'yelmo', 'armadura', 'tunica', 'botas'];
  if (!inv) return pick(rng, slots);
  const handsFree = inv.manos.length === 0 ? 2 : inv.manos[0].slot === 'dosManos' ? 0 : 2 - inv.manos.length;
  const weights = slots.map((s) => {
    if (['arma', 'dosManos', 'escudo'].includes(s)) return handsFree >= (s === 'dosManos' ? 2 : 1) ? 3 : 1;
    return inv[s] ? 1 : 3;
  });
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < slots.length; i++) {
    r -= weights[i];
    if (r < 0) return slots[i];
  }
  return slots[slots.length - 1];
}

function makeEquipment(rng, level, nextId, inv) {
  const slot = pickSlot(rng, inv);
  let bonus = C.equipmentBonus(level);
  // Grado I, II o III según la calidad (para su ilustración).
  const grado = bonus <= 2 ? 1 : bonus <= 3 ? 2 : 3;
  if (slot === 'dosManos') bonus += C.TWO_HANDED_EXTRA;
  // Las armas de una mano pueden ser espadas o mazas; las de dos manos,
  // arcos, hachas, báculos o cayados.
  const forma =
    slot === 'arma' ? pick(rng, ['espada', 'maza'])
      : slot === 'dosManos' ? pick(rng, ['arco', 'hacha', 'baculo', 'cayado'])
        : slot === 'armadura' ? 'cota'
          : slot === 'tunica' ? 'tunica'
          : undefined;
  const names = {
    arma: {
      espada: [['Espada de hierro', 'Espada corta'], ['Espada de acero', 'Espada larga'], ['Espada rúnica', 'Espada élfica']],
      maza: [['Maza de hierro', 'Maza de peregrino'], ['Maza bendita', 'Maza del templo'], ['Maza solar', 'Maza del sumo sacerdote']],
    }[forma]?.[grado - 1],
    dosManos: {
      arco: [['Arco de caza', 'Arco corto'], ['Arco largo', 'Arco de tejo'], ['Arco élfico', 'Arco del bosque']],
      hacha: [['Hacha de guerra', 'Hacha de leñador'], ['Gran hacha', 'Hacha doble'], ['Hacha rúnica', 'Hacha de los reyes']],
      baculo: [['Báculo de aprendiz', 'Vara de cristal'], ['Báculo arcano', 'Báculo de zafiro'], ['Báculo astral', 'Báculo del archimago']],
      cayado: [['Cayado de rama', 'Vara de espino'], ['Cayado de hiedra', 'Cayado del bosque'], ['Cayado del roble ancestral', 'Cayado de la arboleda']],
    }[forma]?.[grado - 1],
    escudo: [['Escudo de tablas', 'Escudo de roble'], ['Escudo del bosque', 'Escudo de hierro'], ['Escudo del guardián', 'Escudo de hojas de oro']][grado - 1],
    yelmo: [['Yelmo nasal', 'Casco de cuero y hierro'], ['Yelmo de acero', 'Yelmo de caballero'], ['Yelmo alado', 'Yelmo real']][grado - 1],
    armadura: [['Jubón de cuero', 'Armadura de explorador'], ['Cota de malla del bosque', 'Brigantina'], ['Coraza de hojas de oro', 'Armadura del guardián']][grado - 1],
    tunica: [['Túnica de lana', 'Hábito con capucha'], ['Túnica del bosque', 'Manto de hojas'], ['Túnica del gran druida', 'Manto de la arboleda']][grado - 1],
    botas: [['Botas de viaje', 'Botas de cuero'], ['Botas de explorador', 'Botas con hebillas'], ['Botas élficas', 'Botas del bosque']][grado - 1],
  }[slot];
  // Las túnicas no dan Fuerza sino Maná (el doble de puntos).
  if (slot === 'tunica') bonus *= 2;
  return {
    id: nextId(),
    tipo: 'equipo',
    slot,
    forma,
    bonus,
    grado,
    stat: slot === 'tunica' ? 'mana' : 'fuerza',
    nombre: `${pick(rng, names)} +${bonus}`,
  };
}

// opts.efecto fuerza el efecto; opts.robo permite (rara vez) un Pergamino de Robo.
function makeConsumable(rng, level, tipo, nextId, opts = {}) {
  const valor = C.consumablePower(level);
  let efecto = opts.efecto;
  if (!efecto) {
    if (tipo === 'pergamino' && opts.robo && rng() < 0.12) efecto = 'robo';
    else efecto = pick(rng, ['mana', 'curacion']);
  }
  const base = tipo === 'pocion' ? 'Poción' : 'Pergamino';
  let nombre;
  if (efecto === 'mana') nombre = `${base} de Maná +${valor}`;
  else if (efecto === 'curacion') nombre = `${base} de Curación +${valor}`;
  else nombre = `${base} de Robo`;
  // Grado I, II o III según el nivel del que sale (para su ilustración).
  const grado = level <= 4 ? 1 : level <= 8 ? 2 : 3;
  return { id: nextId(), tipo, efecto, grado, valor: efecto === 'robo' ? 0 : valor, nombre };
}

function makeReward(rng, level, nextId, inv, opts = {}) {
  const r = rng();
  const w = C.REWARD_WEIGHTS;
  if (r < w.equipo) return makeEquipment(rng, level, nextId, inv);
  if (r < w.equipo + w.pocion) return makeConsumable(rng, level, 'pocion', nextId, opts);
  return makeConsumable(rng, level, 'pergamino', nextId, opts);
}

// --- Inventario del héroe ---------------------------------------------------

function emptyInventory() {
  return { yelmo: null, armadura: null, tunica: null, botas: null, manos: [], pociones: [], pergaminos: [] };
}

function equippedItems(inv) {
  return [inv.yelmo, inv.armadura, inv.tunica, inv.botas, ...inv.manos].filter(Boolean);
}

function allItems(inv) {
  return [...equippedItems(inv), ...inv.pociones, ...inv.pergaminos];
}

function equipmentFuerza(inv) {
  return equippedItems(inv).filter((it) => it.stat !== 'mana' && it.slot !== 'tunica').reduce((s, it) => s + it.bonus, 0);
}

function equipmentMana(inv) {
  return equippedItems(inv).filter((it) => it.stat === 'mana' || it.slot === 'tunica').reduce((s, it) => s + it.bonus, 0);
}

function findItem(inv, id) {
  return allItems(inv).find((it) => it.id === id) || null;
}

function removeItem(inv, id) {
  for (const k of ['yelmo', 'armadura', 'tunica', 'botas']) {
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
  // «Poco lógico»: tirar algo mejor de lo que te quedas (para marcarlo más suave).
  const val = (it) => (it.tipo === 'equipo' ? it.bonus : it.valor || 0);
  const minOld = Math.min(...conflicts.map(val));
  const opts = [{ id: 'descartar', label: `Descartar ${item.nombre}`, torpe: val(item) > minOld }];
  if (item.slot === 'dosManos') {
    const sum = conflicts.reduce((s, c) => s + val(c), 0);
    opts.push({ id: 'todas', label: `Descartar ${conflicts.map((c) => c.nombre).join(' y ')}`, torpe: sum >= val(item) });
  } else {
    for (const c of conflicts) opts.push({ id: c.id, label: `Descartar ${c.nombre}`, torpe: val(c) > val(item) || val(c) > minOld });
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
  equipmentMana,
  findItem,
  removeItem,
  tryPlace,
  conflictOptions,
  resolveConflict,
};
