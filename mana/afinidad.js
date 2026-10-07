'use strict';
// Guardianes de color: cada jugador es de un elemento y tiende hacia su Santuario.
// Compara varias formas de afinidad. Uso: node mana/afinidad.js [partidas]
const { Partida } = require('./motor');
const { ELEMENTOS } = require('./cartas');

const N = Number(process.argv[2]) || 400;
const VARIANTES = [
  ['Sin color (Guardianes neutros, v0.1)', null],
  ['Solo color (los bots prefieren su elemento)', []],
  ['Mazo: 1 Menor de tu color en lugar de 1 Mota', ['mazo']],
  ['Empate: ganas los empates en tu Santuario', ['empate']],
  ['Descuento: tu elemento cuesta 1 menos', ['descuento']],
  ['Presencia: empiezas cada Era con 1 en tu Santuario', ['presencia']],
  ['Mazo + Empate', ['mazo', 'empate']],
];

for (const n of [2, 3, 4]) {
  console.log(`\n## ${n} jugadores (${N} partidas)\n`);
  console.log('| Afinidad | Ganas tu Santuario | Victorias por color (🔥 💧 🌿 💨) | Victoria compartida | Empates en cabeza |');
  console.log('| --- | ---: | --- | ---: | ---: |');
  for (const [nombre, af] of VARIANTES) {
    let propio = 0, comp = 0, emp = 0, punt = 0;
    const porColor = Object.fromEntries(ELEMENTOS.map((e) => [e, [0, 0]]));
    for (let s = 1; s <= N; s++) {
      const p = new Partida(n, { seed: s * 37 + n, afinidad: af }).jugar();
      propio += p.st.propio || 0;
      emp += p.st.empates;
      punt += p.st.puntuaciones;
      if (p.ganadores.length > 1) comp++;
      for (const j of p.jug) {
        if (!j.color) continue;
        porColor[j.color][1]++;
        if (p.ganadores.includes(j.i)) porColor[j.color][0] += 1 / p.ganadores.length;
      }
    }
    const justo = 1 / n;
    const colores = af ? ELEMENTOS.map((e) => `${Math.round((100 * porColor[e][0]) / porColor[e][1])}`).join(' / ') : '—';
    console.log(`| ${nombre} | ${af ? Math.round((100 * propio) / (N * n * 3)) + ' %' : '—'} | ${colores} % (justo: ${Math.round(100 * justo)}) | ${Math.round((100 * comp) / N)} % | ${Math.round((100 * emp) / punt)} % |`);
  }
}
