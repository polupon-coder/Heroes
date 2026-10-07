'use strict';
// Uso: node mana/simular.js [partidas]
// Compara el reglamento provisional con variantes, con partidas completas entre bots.
const { Partida } = require('./motor');
const { UMBRAL } = require('./cartas');

const N_PARTIDAS = Number(process.argv[2]) || 300;

function correr(nombre, n, opciones) {
  const agg = { victorias: Array(n).fill(0), empatesFinal: 0, frag: 0, fragEra: [0, 0, 0], margen: 0, eraIIIdecide: 0, presEra: 0, ultimoGana: 0, ultimoTotal: 0, st: null };
  const usoA = {};
  const usoM = {};
  const vinc = {};
  let st0 = { manaGen: 0, manaGastado: 0, turnos: 0, compras: 0, empates: 0, puntuaciones: 0, vacios: 0, retiradas: 0, movidas: 0, sinObjetivo: 0, puestas: 0, desperdicio: [0, 0, 0], turnosEra: [0, 0, 0], accionesTurno: 0, mazo: 0 };
  for (let s = 1; s <= N_PARTIDAS; s++) {
    const p = new Partida(n, { ...opciones, seed: s * 7919 + n }).jugar();
    const st = p.st;
    for (const k of ['manaGen', 'manaGastado', 'turnos', 'compras', 'empates', 'puntuaciones', 'vacios', 'retiradas', 'movidas', 'sinObjetivo', 'puestas', 'accionesTurno']) st0[k] += st[k] || 0;
    for (let e = 0; e < 3; e++) {
      st0.desperdicio[e] += st.desperdicio[e];
      st0.turnosEra[e] += st.turnosEra[e];
    }
    for (const [k, v] of Object.entries(st.usoAccion)) usoA[k] = (usoA[k] || 0) + v;
    for (const [k, v] of Object.entries(st.usoMana)) usoM[k] = (usoM[k] || 0) + v;
    for (const [k, v] of Object.entries(st.vinculadas)) vinc[k] = (vinc[k] || 0) + v;
    if (p.ganadores.length > 1) agg.empatesFinal++;
    else agg.victorias[p.ganadores[0]]++;
    const fr = p.jug.map((j) => j.frag).sort((a, b) => b - a);
    agg.frag += fr.reduce((a, b) => a + b, 0) / n;
    agg.margen += fr[0] - fr[1];
    p.jug.forEach((j) => j.fragEra.forEach((f, e) => (agg.fragEra[e] += f / n)));
    // ¿El líder tras la Era II acaba ganando?
    const tras2 = p.jug.map((j) => j.fragEra[0] + j.fragEra[1]);
    const m2 = Math.max(...tras2);
    const lideres = tras2.map((x, k) => (x === m2 ? k : -1)).filter((k) => k >= 0);
    if (!(lideres.length === 1 && p.ganadores.length === 1 && p.ganadores[0] === lideres[0])) agg.eraIIIdecide++;
    // Ventaja de jugar el último turno de la Era
    st.ultimoEra.forEach((u, e) => {
      const fe = p.jug.map((j) => j.fragEra[e]);
      agg.ultimoGana += fe[u] - fe.reduce((a, b) => a + b, 0) / n;
      agg.ultimoTotal++;
    });
    st0.mazo += p.jug.reduce((a, j) => a + j.mazo.length + j.desc.length + j.mano.length, 0) / n;
  }
  const P = N_PARTIDAS;
  const r = {
    nombre,
    n,
    'empate en cabeza (nadie puntúa)': pct(st0.empates / st0.puntuaciones),
    'Santuarios vacíos': pct(st0.vacios / st0.puntuaciones),
    'Presencia puesta por jugador y Era': (st0.puestas / P / n / 3).toFixed(1),
    'Acciones por turno': (st0.accionesTurno / st0.turnos).toFixed(2),
    'Maná sobrante por turno (Era I/II/III)': st0.desperdicio.map((d, e) => (d / st0.turnosEra[e]).toFixed(1)).join(' / '),
    'Turnos con vinculación': pct(st0.compras / st0.turnos),
    'Cartas en el mazo al final': (st0.mazo / P).toFixed(1),
    'Fragmentos medios por jugador': (agg.frag / P).toFixed(1),
    'Fragmentos por Era (I/II/III)': agg.fragEra.map((f) => (f / P).toFixed(1)).join(' / '),
    'Diferencia 1º-2º': (agg.margen / P).toFixed(1),
    'Empate final (victoria compartida)': pct(agg.empatesFinal / P),
    'Victorias por asiento': agg.victorias.map((v) => pct(v / P)).join(' / '),
    'Fragmentos extra del último en jugar la Era': (agg.ultimoGana / agg.ultimoTotal).toFixed(2),
    'La Era III cambia el ganador': pct(agg.eraIIIdecide / P),
    'Retiradas / movimientos por partida': `${(st0.retiradas / P).toFixed(1)} / ${(st0.movidas / P).toFixed(1)}`,
  };
  return { r, usoA, usoM, vinc };
}

function pct(x) {
  return `${Math.round(x * 100)} %`;
}

const VARIANTES = [
  ['Reglamento provisional', {}],
  ['Acciones ilimitadas', { acciones: Infinity }],
  ['Propuesta (v0.2)', { acciones: Infinity, proteccion: 'era', rotacion: 'era' }],
];

const filas = [];
let detalle = null;
let detalleB = null;
for (const n of [2, 3, 4]) {
  for (const [nombre, op] of VARIANTES) {
    const res = correr(nombre, n, op);
    filas.push(res.r);
    if (n === 4 && nombre === 'Reglamento provisional') detalle = res;
    if (n === 4 && nombre === 'Acciones ilimitadas') detalleB = res;
  }
}

const claves = Object.keys(filas[0]).filter((k) => k !== 'nombre' && k !== 'n');
for (const n of [2, 3, 4]) {
  const fs = filas.filter((f) => f.n === n);
  console.log(`\n## ${n} jugadores (${N_PARTIDAS} partidas por variante)\n`);
  console.log(`| Medida | ${fs.map((f) => f.nombre).join(' | ')} |`);
  console.log(`| --- | ${fs.map(() => '---:').join(' | ')} |`);
  for (const k of claves) console.log(`| ${k} | ${fs.map((f) => f[k]).join(' | ')} |`);
}

const pctA = (d, nombre) => {
  const a = d.usoA[nombre] || 0;
  const m = d.usoM[nombre] || 0;
  return a + m ? `${Math.round((100 * a) / (a + m))} %` : '—';
};
console.log('\n## Veces que cada carta se juega como Acción (4 jugadores)\n');
console.log('| Carta | Coste | Reglamento provisional | Acciones ilimitadas |');
console.log('| --- | ---: | ---: | ---: |');
for (const c of UMBRAL) console.log(`| ${c.nombre} | ${c.coste} | ${pctA(detalle, c.nombre)} | ${pctA(detalleB, c.nombre)} |`);
