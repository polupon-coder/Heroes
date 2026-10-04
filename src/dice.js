'use strict';

const { FACES, SHAPES } = require('./config');

// Cada dado da a la vez un color y una forma.
function rollFace(rng) {
  return FACES[Math.floor(rng() * FACES.length)];
}
function rollShape(rng) {
  return SHAPES[Math.floor(rng() * SHAPES.length)];
}

// Comodín de cada tipo de desafío: multicolor para colores, espiral para formas.
const WILD = { color: 'multicolor', forma: 'espiral' };

function countNeeds(combo) {
  const needs = {};
  for (const c of combo) needs[c] = (needs[c] || 0) + 1;
  return needs;
}

// Asigna dados a la combinación: primero los exactos y después los comodines.
// Devuelve los índices usados y cuántos faltan.
function matchDice(faces, combo, wild = 'multicolor') {
  const needs = countNeeds(combo);
  const used = new Set();
  faces.forEach((f, i) => {
    if (f !== wild && needs[f] > 0) {
      needs[f]--;
      used.add(i);
    }
  });
  let missing = Object.values(needs).reduce((a, b) => a + b, 0);
  faces.forEach((f, i) => {
    if (missing > 0 && f === wild) {
      used.add(i);
      missing--;
    }
  });
  return { used, missing };
}

function isSatisfied(faces, combo, wild = 'multicolor') {
  return matchDice(faces, combo, wild).missing === 0;
}

// Dados recién tirados que aportan a la combinación (para los maleficios).
function successfulNewDice(faces, newIndices, combo, wild = 'multicolor') {
  const newSet = new Set(newIndices);
  const needs = countNeeds(combo);
  let oldWild = 0;
  faces.forEach((f, i) => {
    if (newSet.has(i)) return;
    if (f === wild) oldWild++;
    else if (needs[f] > 0) needs[f]--;
  });
  const ok = [];
  for (const i of newIndices) {
    const f = faces[i];
    if (f !== wild && needs[f] > 0) {
      needs[f]--;
      ok.push(i);
    }
  }
  let left = Object.values(needs).reduce((a, b) => a + b, 0) - oldWild;
  for (const i of newIndices) {
    if (left <= 0) break;
    if (faces[i] === wild) {
      ok.push(i);
      left--;
    }
  }
  return ok;
}

// Lo que aún falta para completar la combinación.
function missingColors(faces, combo, wild = 'multicolor') {
  const needs = countNeeds(combo);
  let w = 0;
  for (const f of faces) {
    if (f === wild) w++;
    else if (needs[f] > 0) needs[f]--;
  }
  const rest = [];
  for (const [c, n] of Object.entries(needs)) for (let k = 0; k < n; k++) rest.push(c);
  return rest.slice(0, Math.max(0, rest.length - w));
}

// Valores de los dados según el tipo de desafío.
function valuesOf(dice, tipo) {
  return dice.map((d) => (tipo === 'forma' ? d.shape : d.face));
}

module.exports = { rollFace, rollShape, WILD, matchDice, isSatisfied, successfulNewDice, missingColors, countNeeds, valuesOf };
