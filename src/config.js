'use strict';

// Todas las tablas del reglamento v0.2. Cambiar aquí para equilibrar el juego.

const COLORS = ['rojo', 'azul', 'verde', 'amarillo'];
const FACES = ['rojo', 'azul', 'verde', 'amarillo', 'multicolor'];
// Cada dado da también una forma: espiral = comodín.
const SHAPES = ['circulo', 'cuadrado', 'rombo', 'triangulo', 'espiral'];
// Probabilidad de que una esfera salga comodín (multicolor o espiral).
const COMODIN_PROB = 1 / 9;
const FORMAS = ['circulo', 'cuadrado', 'rombo', 'triangulo'];
// Cada monstruo puede pedir su combinación en colores o en formas (misma dificultad).
const COLOR_TO_SHAPE = { rojo: 'circulo', azul: 'cuadrado', verde: 'rombo', amarillo: 'triangulo' };

const BASE_STATS = { vida: 10, mana: 5, fuerza: 10 };

// Ningún héroe empieza con menos Fuerza que esto (después de Raza y Clase).
const MIN_FUERZA_INICIAL = 10;

// Razas y clases equilibradas con simulaciones de partidas entre bots (cada una
// gana entre el 21 % y el 30 % de las partidas de 4). Cada raza reparte 5 puntos. Sin valores negativos: la
// Fuerza y el Maná tienen mínimos. Todos empiezan con al menos 5 de Maná.
const RACES = {
  humano: { nombre: 'Humano', vida: 2, mana: 2, fuerza: 1 },
  elfo: { nombre: 'Elfo', vida: 2, mana: 2, fuerza: 1 },
  enano: { nombre: 'Enano', vida: 2, mana: 1, fuerza: 2 },
  gnomo: { nombre: 'Gnomo', vida: 2, mana: 2, fuerza: 1 },
  silvano: { nombre: 'Silvano', vida: 2, mana: 2, fuerza: 1 },
  durgan: { nombre: 'Durgan', vida: 3, mana: 1, fuerza: 1 },
  faunar: { nombre: 'Faunar', vida: 2, mana: 1, fuerza: 2 },
};

// Afinidad entre raza y clase: las combinaciones naturales reciben un pequeño
// extra y las raras una penalización (ver baseStats en game.js).
const AFINIDAD = {
  humano: { natural: ['guerrero', 'explorador'], rara: [] },
  elfo: { natural: ['mago', 'explorador'], rara: ['barbaro'] },
  enano: { natural: ['guerrero', 'clerigo'], rara: ['mago', 'druida'] },
  gnomo: { natural: ['mago', 'ladron'], rara: ['barbaro', 'guerrero'] },
  silvano: { natural: ['druida', 'explorador'], rara: ['barbaro', 'guerrero'] },
  durgan: { natural: ['barbaro', 'guerrero'], rara: ['clerigo', 'mago'] },
  faunar: { natural: ['druida', 'ladron'], rara: ['clerigo'] },
};
// Armas afines: la clase que las maneja mejor gana +1 de Fuerza extra.
const ARMA_AFIN = {
  arco: ['explorador', 'ladron'],
  baculo: ['mago'],
  cayado: ['druida'],
  maza: ['clerigo'],
  hacha: ['barbaro'],
  espada: ['guerrero'],
  escudo: ['guerrero'],
};
const ARMA_AFIN_BONUS = 1;

const AFINIDAD_EFECTO = {
  natural: { vida: 0, mana: 1, fuerza: 1 },
  rara: { vida: -1, mana: 0, fuerza: 0 },
};
function afinidad(raza, clase) {
  const a = AFINIDAD[raza];
  if (!a) return null;
  if (a.natural.includes(clase)) return 'natural';
  if (a.rara.includes(clase)) return 'rara';
  return null;
}

const CLASSES = {
  guerrero: { nombre: 'Guerrero', vida: 2, mana: 1, fuerza: 3 },
  mago: { nombre: 'Mago', vida: 2, mana: 3, fuerza: 2 },
  ladron: { nombre: 'Ladrón', vida: 2, mana: 2, fuerza: 2 },
  druida: { nombre: 'Druida', vida: 2, mana: 2, fuerza: 2 },
  explorador: { nombre: 'Explorador', vida: 2, mana: 2, fuerza: 2 },
  clerigo: { nombre: 'Clérigo', vida: 2, mana: 1, fuerza: 3 },
  barbaro: { nombre: 'Bárbaro', vida: 3, mana: 1, fuerza: 2 },
};

const MIN_MANA_INICIAL = 5;
// Nadie empieza con más de 2 comodines (14 de Maná como máximo).
const MAX_MANA_INICIAL = 14;

// Regla 10: Fuerza -> dados (mínimo 1 dado, máximo 5).
function diceForFuerza(fuerza) {
  if (fuerza >= 21) return 5;
  if (fuerza >= 16) return 4;
  if (fuerza >= 11) return 3;
  if (fuerza >= 6) return 2;
  return 1;
}

// Regla 11: Maná -> dados cuyo resultado se puede elegir.
function fixedDiceForMana(mana) {
  if (mana < 5) return 0;
  return Math.min(5, Math.floor(mana / 5));
}

const ROUNDS = Number(process.env.HEROES_RONDAS) || 12; // (la variable solo se usa en pruebas)
const MAX_ROLLS = 3;
// Siempre se lanzan 5 esferas. Empiezas con 3 tiradas y la Fuerza da más:
// 4 con Fuerza 22 y 5 con 30.
const DADOS = 5;
const TIRADAS_BASE = 3;
const TIRADAS_FUERZA = [22, 30];
function rollsForFuerza(f) {
  return TIRADAS_BASE + TIRADAS_FUERZA.filter((t) => f >= t).length;
}
// Combinaciones de los 5 monstruos (de pequeño a grande) según la ronda: al final
// hasta el monstruo pequeño pide más. Ver makeOffers en game.js.
const ESCALERAS = [
  { hasta: 4, combos: ['trio1', 'poker', 'full', 'poker1', 'pleno'] },
  { hasta: 8, combos: ['full', 'poker1', 'poker1', 'pleno', 'pleno'] },
  { hasta: 99, combos: ['poker1', 'poker1', 'pleno', 'pleno', 'pleno'] },
];
// Batalla final: tiradas fijas para todos (la Fuerza suma daño) y daño según
// cuántas esferas del color de la víctima (índice = esferas).
const BATALLA_TIRADAS = 3;
const BATALLA_DANO = [0, 0, 0, 2, 4, 6];
// Batalla final: +1 de daño con Fuerza 22, +2 con 30 y +3 con 38 (solo si el golpe ya hace daño).
const GOLPE_FUERZA = [22, 30, 38];
function fuerzaDamageBonus(f) {
  return GOLPE_FUERZA.filter((t) => f >= t).length;
}

// Regla 21.
function levelsForRound(round) {
  if (round === 11) return [11];
  if (round === 12) return [12];
  return [round, round + 1, round + 2];
}

// Máximo de esferas que puede pedir un monstruo según la ronda.
function maxComboForRound(round) {
  if (round <= 3) return 3;
  if (round <= 7) return 4;
  return 5;
}

// Reglas 24 y 25. Monstruos ordenados de menos a más poderosos según sus
// ilustraciones. Las combinaciones van ligadas al nivel (equilibradas para
// héroes con Fuerza inicial 10).
const MONSTERS = {
  1: { nombre: 'Diablillo', imagen: 'diablillo', combo: ['rojo', 'azul'] },
  2: { nombre: 'Goblin', imagen: 'goblin', combo: ['rojo', 'rojo'] },
  3: { nombre: 'Necrófago', imagen: 'necrofago', combo: ['azul', 'verde', 'verde'] },
  4: { nombre: 'Orco', imagen: 'orco', combo: ['rojo', 'rojo', 'rojo'] },
  5: { nombre: 'Súcubo', imagen: 'sucubo', combo: ['azul', 'azul', 'amarillo'] },
  6: { nombre: 'Espectro', imagen: 'espectro', combo: ['verde', 'verde', 'verde', 'amarillo'] },
  7: { nombre: 'Mago Oscuro', imagen: 'magooscuro', combo: ['rojo', 'rojo', 'verde', 'verde'] },
  8: { nombre: 'Minotauro', imagen: 'minotauro', combo: ['azul', 'azul', 'azul', 'amarillo'] },
  9: { nombre: 'Ogro', imagen: 'ogro', combo: ['verde', 'verde', 'amarillo', 'amarillo'] },
  10: { nombre: 'Trol', imagen: 'trol', combo: ['rojo', 'azul', 'verde', 'amarillo'] },
  11: { nombre: 'Basilisco', imagen: 'basilisco', combo: ['rojo', 'rojo', 'azul', 'verde', 'amarillo'] },
  12: { nombre: 'Dragón', imagen: 'dragon', combo: ['rojo', 'azul', 'verde', 'amarillo', 'amarillo'] },
};

// Cada monstruo aparece en 3 tamaños (las 3 figuras de su lámina). Cuanto más
// grande, más colores exige, más daño hace y mejores son sus recompensas
// (se generan como si el monstruo fuera `recompensa` niveles más alto).
const VARIANTS = {
  1: { nombre: 'Pequeño', peso: 0.05, endurecer: false, extraColores: 0, dano: 0, recompensa: 0 },
  2: { nombre: 'Mediano', peso: 0.3, endurecer: true, extraColores: 1, dano: 1, recompensa: 2 },
  3: { nombre: 'Grande', peso: 0.65, endurecer: true, extraColores: 2, dano: 2, recompensa: 4 },
};
const MAX_COMBO = 5;

// Combinación de un tamaño. "Endurecer" convierte el color menos repetido en el
// más repetido (más difícil sin exigir más dados); "extraColores" añade copias
// del color más repetido (máximo 5 colores).
function variantCombo(combo, variante) {
  const v = VARIANTS[variante];
  let out = [...combo];
  const counts = {};
  for (const c of out) counts[c] = (counts[c] || 0) + 1;
  const byFreq = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  const top = byFreq[0];
  const low = byFreq[byFreq.length - 1];
  if (v.endurecer && byFreq.length > 1) out[out.indexOf(low)] = top;
  for (let k = 0; k < v.extraColores && out.length < MAX_COMBO; k++) out.push(top);
  const order = ['rojo', 'azul', 'verde', 'amarillo', 'circulo', 'cuadrado', 'rombo', 'triangulo'];
  return out.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

// Regla 23.
function monsterDamage(level) {
  if (level <= 3) return 4;
  if (level <= 6) return 5;
  if (level <= 9) return 6;
  return 7;
}

// Regla 27.
function equipmentBonus(level) {
  if (level <= 2) return 1;
  if (level <= 5) return 2;
  if (level <= 8) return 3;
  if (level <= 10) return 4;
  return 5;
}

// Provisional: un arma a dos manos ocupa ambas manos, así que da algo más.
const TWO_HANDED_EXTRA = 2;

// Provisional: potencia de los consumibles según el nivel del monstruo.
function consumablePower(level) {
  return equipmentBonus(level) + 1; // 2..6
}

// Probabilidades de cada tipo de recompensa (suman 1).
const REWARD_WEIGHTS = { equipo: 0.6, pocion: 0.2, pergamino: 0.2 };

// Monedas: cada monstruo vencido da monedas según su nivel y tamaño, y menos
// cuantas más tiradas hayas necesitado (no se sabe hasta después de elegir la recompensa).
const MONEDAS_INICIALES = 3;
const MONEDAS_POR_TIRADAS = [1, 0.7, 0.45];
function coinsFor(level, variante, rolls) {
  const base = 2 + level + 2 * ((variante || 1) - 1);
  return Math.max(1, Math.round(base * MONEDAS_POR_TIRADAS[Math.min(3, Math.max(1, rolls)) - 1]));
}
// Precio en la tienda.
function itemPrice(it) {
  if (it.tipo === 'equipo') return it.slot === 'tunica' ? 3 * it.bonus + 3 : 6 * it.bonus + 4;
  if (it.efecto === 'robo') return 30;
  return 3 * (it.valor || 1) + 3;
}
const TIENDA_OBJETOS = 4;
// Premio por ganar un duelo del torneo (además de las monedas del vencido).
const PREMIO_SEMIFINAL = 8;
const PREMIO_FINAL = 15;

const MAX_POTIONS = 3;
const MAX_SCROLLS = 3;

// Regla 29.
const MANA_PER_CURSE = 5;

// Reglas 34 y 36, con golpe graduado: el daño depende de cuántos resultados
// del color del rival se consiguen. Con 5 exigidos: 3 → 1, 4 → 2, 5 → 3 daño.
const PVP_DAMAGE = 3;
const DEFAULT_PVP_HITS = 5;

function pvpDamage(results, hits) {
  const n = Math.min(results, hits);
  return Math.max(0, PVP_DAMAGE - (hits - n));
}

// Resultados mínimos para hacer al menos 1 de daño.
function pvpMinResults(hits) {
  return hits - PVP_DAMAGE + 1;
}

// Seguridad del torneo: si ninguno de los dos tiene dados suficientes para hacer
// daño, el duelo no podría terminar. En ese caso gana quien tenga más Vida
// (luego Fuerza+Maná).

module.exports = {
  ESCALERAS,
  BATALLA_TIRADAS,
  BATALLA_DANO,
  COMODIN_PROB,
  COLORS,
  FACES,
  SHAPES,
  FORMAS,
  COLOR_TO_SHAPE,
  BASE_STATS,
  MIN_FUERZA_INICIAL,
  MIN_MANA_INICIAL,
  MAX_MANA_INICIAL,
  RACES,
  CLASSES,
  AFINIDAD,
  AFINIDAD_EFECTO,
  ARMA_AFIN,
  ARMA_AFIN_BONUS,
  afinidad,
  diceForFuerza,
  fixedDiceForMana,
  ROUNDS,
  MAX_ROLLS,
  DADOS,
  rollsForFuerza,
  TIRADAS_BASE,
  TIRADAS_FUERZA,
  GOLPE_FUERZA,
  fuerzaDamageBonus,
  levelsForRound,
  maxComboForRound,
  MONSTERS,
  VARIANTS,
  variantCombo,
  monsterDamage,
  equipmentBonus,
  TWO_HANDED_EXTRA,
  consumablePower,
  REWARD_WEIGHTS,
  MAX_POTIONS,
  MONEDAS_INICIALES,
  coinsFor,
  itemPrice,
  TIENDA_OBJETOS,
  PREMIO_SEMIFINAL,
  PREMIO_FINAL,
  MAX_SCROLLS,
  MANA_PER_CURSE,
  PVP_DAMAGE,
  pvpDamage,
  pvpMinResults,
  DEFAULT_PVP_HITS,
};
