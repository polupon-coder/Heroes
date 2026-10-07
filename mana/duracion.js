'use strict';
// Estimación de la duración de una partida a partir de lo que pasa en cada turno.
// Los segundos por gesto son supuestos (ajústalos tras cronometrar partidas reales).
// Uso: node mana/duracion.js [partidas]
const { Partida, V01 } = require('./motor');

const N = Number(process.argv[2]) || 200;
const SEG = {
  turno: 12, // robar 5, mirar la mano, descartar
  simple: 5, // Acción de poner Presencia (+N)
  robo: 8, // robar, recuperar o colocar cartas
  inter: 12, // retirar, mover, proteger, Desorden, Cambio de viento: elegir objetivo
  mana: 1, // cada carta usada como Maná
  vincular: 10, // mirar el Umbral, pagar, reponer
  liberar: 3,
  era: 90, // puntuar y preparar la siguiente Era
  preparar: 300, // montar la partida y explicar
};

function minutos(n, opciones) {
  let total = 0;
  let porTurno = 0;
  for (let s = 1; s <= N; s++) {
    const p = new Partida(n, { ...opciones, seed: s * 13 + n }).jugar();
    const st = p.st;
    const a = st.acc || { simple: 0, inter: 0, robo: 0 };
    const cartasMana = Object.values(st.usoMana).reduce((x, y) => x + y, 0);
    const turnos = st.turnos * SEG.turno + a.simple * SEG.simple + a.robo * SEG.robo + a.inter * SEG.inter + cartasMana * SEG.mana + st.compras * SEG.vincular + st.liberadas * SEG.liberar;
    total += turnos + 3 * SEG.era + SEG.preparar;
    porTurno += turnos / st.turnos;
  }
  return { min: total / N / 60, seg: porTurno / N };
}

const filas = [
  ['v0.1', V01],
  ['v0.2', {}],
  ['v0.2 con Eras de 4 rondas', { rondas: 4 }],
];
console.log('| Versión | 2 jugadores | 3 jugadores | 4 jugadores | Segundos por turno (4 j.) |');
console.log('| --- | ---: | ---: | ---: | ---: |');
for (const [nombre, op] of filas) {
  const r = [2, 3, 4].map((n) => minutos(n, op));
  console.log(`| ${nombre} | ${r.map((x) => `${Math.round(x.min)} min`).join(' | ')} | ${Math.round(r[2].seg)} s |`);
}
