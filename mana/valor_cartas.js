'use strict';
// Fuerza real de cada Elemental: un jugador empieza la partida con 2 copias de la carta en lugar
// de sus 2 Motas de Maná, y se mide cuánto sube su porcentaje de victorias. Todas las cartas se
// prueban con las mismas partidas (mismas semillas) para que la comparación sea justa.
// Uso: node mana/valor_cartas.js [partidas] [jugadores]
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');
const os = require('node:os');
const { Partida } = require('./motor');
const { UMBRAL } = require('./cartas');

function victorias(carta, N, J, opciones = {}) {
  let v = 0;
  for (let s = 1; s <= N; s++) {
    const jugador = s % J;
    const p = new Partida(J, { ...opciones, seed: s * 104729 + 17, injertar: carta ? { jugador, carta, copias: 2 } : null }).jugar();
    if (p.ganadores.includes(jugador)) v += 1 / p.ganadores.length;
  }
  return v / N;
}

// Prueba en paralelo una lista de cartas (null = sin cambio). Devuelve los porcentajes en el mismo orden.
function medir(cartas, N, J, opciones = {}) {
  const hilos = Math.min(os.cpus().length, cartas.length);
  const trozos = Array.from({ length: hilos }, () => []);
  cartas.forEach((c, k) => trozos[k % hilos].push(k));
  return Promise.all(
    trozos.map(
      (idx) =>
        new Promise((ok, mal) => {
          const w = new Worker(__filename, { workerData: { idx, cartas, N, J, opciones } });
          w.on('message', ok);
          w.on('error', mal);
        }),
    ),
  ).then((partes) => {
    const res = [];
    partes.forEach((p) => p.forEach(([k, v]) => (res[k] = v)));
    return res;
  });
}

if (!isMainThread) {
  const { idx, cartas, N, J, opciones } = workerData;
  parentPort.postMessage(idx.map((k) => [k, victorias(cartas[k], N, J, opciones)]));
} else if (require.main === module) {
  const N = Number(process.argv[2]) || 600;
  const J = Number(process.argv[3]) || 2;
  medir([null, ...UMBRAL], N, J).then(([base, ...vs]) => {
    console.log(`Sin cambio: ${(base * 100).toFixed(1)} % de victorias (${N} partidas, ${J} jugadores)\n`);
    console.log('| Carta | Coste | Victorias con 2 copias | Diferencia |');
    console.log('| --- | ---: | ---: | ---: |');
    UMBRAL.map((c, k) => ({ c, v: vs[k] }))
      .sort((a, b) => b.v - a.v)
      .forEach(({ c, v }) => console.log(`| ${c.nombre} | ${c.coste} | ${(v * 100).toFixed(1)} % | ${v >= base ? '+' : ''}${((v - base) * 100).toFixed(1)} |`));
  });
}

module.exports = { victorias, medir };
