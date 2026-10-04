'use strict';

// Todas las tablas del reglamento v0.2. Cambiar aquí para equilibrar el juego.

const COLORS = ['rojo', 'azul', 'verde', 'amarillo'];
const FACES = ['rojo', 'azul', 'verde', 'amarillo', 'multicolor'];
// Cada dado da también una forma: espiral = comodín.
const SHAPES = ['circulo', 'cuadrado', 'rombo', 'triangulo', 'espiral'];
const FORMAS = ['circulo', 'cuadrado', 'rombo', 'triangulo'];
// Cada monstruo puede pedir su combinación en colores o en formas (misma dificultad).
const COLOR_TO_SHAPE = { rojo: 'circulo', azul: 'cuadrado', verde: 'rombo', amarillo: 'triangulo' };

const BASE_STATS = { vida: 10, mana: 5, fuerza: 10 };

// Ningún héroe empieza con menos Fuerza que esto (después de Raza y Clase).
const MIN_FUERZA_INICIAL = 10;

// Razas y clases equilibradas: cada raza reparte 3 puntos y cada clase 5, sin
// valores negativos (la Fuerza y el Maná tienen mínimos, así que un negativo
// sería un punto perdido). Todos empiezan con al menos 5 de Maná.
const RACES = {
  humano: { nombre: 'Humano', vida: 1, mana: 2, fuerza: 0 },
  elfo: { nombre: 'Elfo', vida: 0, mana: 3, fuerza: 0 },
  enano: { nombre: 'Enano', vida: 1, mana: 1, fuerza: 1 },
  gnomo: { nombre: 'Gnomo', vida: 1, mana: 2, fuerza: 0 },
  silvano: { nombre: 'Silvano', vida: 2, mana: 1, fuerza: 0 },
  durgan: { nombre: 'Durgan', vida: 2, mana: 0, fuerza: 1 },
  faunar: { nombre: 'Faunar', vida: 1, mana: 0, fuerza: 2 },
};

const CLASSES = {
  guerrero: { nombre: 'Guerrero', vida: 2, mana: 0, fuerza: 3 },
  mago: { nombre: 'Mago', vida: 1, mana: 4, fuerza: 0 },
  ladron: { nombre: 'Ladrón', vida: 1, mana: 2, fuerza: 2 },
  druida: { nombre: 'Druida', vida: 2, mana: 3, fuerza: 0 },
  explorador: { nombre: 'Explorador', vida: 2, mana: 1, fuerza: 2 },
  clerigo: { nombre: 'Clérigo', vida: 3, mana: 2, fuerza: 0 },
  barbaro: { nombre: 'Bárbaro', vida: 3, mana: 1, fuerza: 1 },
};

const MIN_MANA_INICIAL = 5;

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

const ROUNDS = 12;
const MAX_ROLLS = 3;

// Regla 21.
function levelsForRound(round) {
  if (round === 11) return [11];
  if (round === 12) return [12];
  return [round, round + 1, round + 2];
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
  if (level <= 3) return 3;
  if (level <= 6) return 4;
  if (level <= 9) return 5;
  return 6;
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
  COLORS,
  FACES,
  SHAPES,
  FORMAS,
  COLOR_TO_SHAPE,
  BASE_STATS,
  MIN_FUERZA_INICIAL,
  MIN_MANA_INICIAL,
  RACES,
  CLASSES,
  diceForFuerza,
  fixedDiceForMana,
  ROUNDS,
  MAX_ROLLS,
  levelsForRound,
  MONSTERS,
  VARIANTS,
  variantCombo,
  monsterDamage,
  equipmentBonus,
  TWO_HANDED_EXTRA,
  consumablePower,
  REWARD_WEIGHTS,
  MAX_POTIONS,
  MAX_SCROLLS,
  MANA_PER_CURSE,
  PVP_DAMAGE,
  pvpDamage,
  pvpMinResults,
  DEFAULT_PVP_HITS,
};
