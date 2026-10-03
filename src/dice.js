'use strict';

const { FACES } = require('./config');

function rollFace(rng) {
  return FACES[Math.floor(rng() * FACES.length)];
}

function countNeeds(combo) {
  const needs = {};
  for (const c of combo) needs[c] = (needs[c] || 0) + 1;
  return needs;
}

// Asigna dados a la combinación: primero los de color exacto, después los
// blancos como comodín. Devuelve los índices usados y cuántos faltan.
function matchDice(faces, combo) {
  const needs = countNeeds(combo);
  const used = new Set();
  faces.forEach((f, i) => {
    if (f !== 'blanco' && needs[f] > 0) {
      needs[f]--;
      used.add(i);
    }
  });
  let missing = Object.values(needs).reduce((a, b) => a + b, 0);
  faces.forEach((f, i) => {
    if (missing > 0 && f === 'blanco') {
      used.add(i);
      missing--;
    }
  });
  return { used, missing };
}

function isSatisfied(faces, combo) {
  return matchDice(faces, combo).missing === 0;
}

// Dados recién tirados que resultan "exitosos" (aportan a la combinación
// una vez contados los dados que ya se tenían). Se usa para la maldición
// de la regla 29. Los blancos que ya se tenían siguen siendo flexibles.
function successfulNewDice(faces, newIndices, combo) {
  const newSet = new Set(newIndices);
  const needs = countNeeds(combo);
  let oldWhites = 0;
  faces.forEach((f, i) => {
    if (newSet.has(i)) return;
    if (f === 'blanco') oldWhites++;
    else if (needs[f] > 0) needs[f]--;
  });
  const ok = [];
  for (const i of newIndices) {
    const f = faces[i];
    if (f !== 'blanco' && needs[f] > 0) {
      needs[f]--;
      ok.push(i);
    }
  }
  let left = Object.values(needs).reduce((a, b) => a + b, 0) - oldWhites;
  for (const i of newIndices) {
    if (left <= 0) break;
    if (faces[i] === 'blanco') {
      ok.push(i);
      left--;
    }
  }
  return ok;
}

// Colores que aún faltan para completar la combinación.
function missingColors(faces, combo) {
  const needs = countNeeds(combo);
  let whites = 0;
  for (const f of faces) {
    if (f === 'blanco') whites++;
    else if (needs[f] > 0) needs[f]--;
  }
  const rest = [];
  for (const [c, n] of Object.entries(needs)) for (let k = 0; k < n; k++) rest.push(c);
  return rest.slice(0, Math.max(0, rest.length - whites));
}

module.exports = { rollFace, matchDice, isSatisfied, successfulNewDice, missingColors, countNeeds };
