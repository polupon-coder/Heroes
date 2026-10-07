'use strict';
// MANA — tablas del reglamento provisional (secciones 12 y 27-30).
// Cada acción es una lista de efectos que interpreta motor.js.
//   add:      +N Presencia en un Santuario (prot: protegidas)
//   remove:   retira hasta N Presencias rivales de un Santuario (s: '*' = uno cualquiera, el mismo para todas)
//   draw:     roba N            discard: descarta N de la mano
//   topFromDiscard: pon 1 carta del descarte sobre el mazo
//   handToTop: pon 1 carta de la mano sobre el mazo
//   recover:  1 carta del descarte a la mano
//   protect:  protege hasta N Presencias propias (s: '*' = en cualquier Santuario; all: todas las de un Santuario)
//   ifAny:    solo si ya tienes Presencia en ese Santuario
//   ifBehind: +a si un rival tiene más que tú, si no +b
//   moveRival: mueve hasta N Presencias rivales DESDE el Santuario (s: '*' = desde cualquiera)
//   moveOwnTo: mueve 1 Presencia propia HACIA el Santuario
//   disrupt:  un rival descarta 1 y roba 1 (modo 'todos': cada rival descarta 1 que elige él, sin robar)
//   swap:     retira 1 Presencia rival de un Santuario y pon 1 tuya en ese Santuario
//   refresh:  cambia 1 carta del Umbral

const ELEMENTOS = ['fuego', 'agua', 'tierra', 'aire'];

const C = (nombre, el, coste, mana, accion, inicial = false) => ({ nombre, el, coste, mana, accion, inicial });

// Reglamento provisional v0.1 (se conserva para comparar).
const UMBRAL_V01 = [
  C('Chispa', 'fuego', 2, 1, [{ add: 1, s: 'fuego' }]),
  C('Llama', 'fuego', 3, 1, [{ add: 2, s: 'fuego' }]),
  C('Ascua', 'fuego', 2, 1, [{ draw: 1 }]),
  C('Quemadura', 'fuego', 3, 1, [{ remove: 1, s: 'fuego' }]),
  C('Embestida', 'fuego', 4, 2, [{ add: 1, s: 'fuego' }, { remove: 1, s: 'fuego' }]),
  C('Fuego voraz', 'fuego', 4, 2, [{ ifBehind: [2, 1], s: 'fuego' }]),
  C('Incendio', 'fuego', 5, 2, [{ remove: 2, s: 'fuego' }]),
  C('Llama de conquista', 'fuego', 6, 3, [{ add: 2, s: 'fuego' }, { remove: 1, s: 'fuego' }]),

  C('Gota', 'agua', 2, 1, [{ add: 1, s: 'agua' }]),
  C('Corriente', 'agua', 3, 1, [{ add: 2, s: 'agua' }]),
  C('Manantial', 'agua', 2, 1, [{ draw: 1 }]),
  C('Fluir', 'agua', 3, 1, [{ draw: 2 }, { discard: 1 }]),
  C('Retorno', 'agua', 3, 1, [{ topFromDiscard: 1 }]),
  C('Oleaje', 'agua', 4, 2, [{ draw: 2 }, { handToTop: 1 }]),
  C('Renacer', 'agua', 5, 2, [{ recover: 1 }]),
  C('Gran marea', 'agua', 6, 3, [{ add: 2, s: 'agua' }, { topFromDiscard: 1 }]),

  C('Semilla', 'tierra', 2, 1, [{ add: 1, s: 'tierra' }]),
  C('Raíz', 'tierra', 3, 1, [{ add: 2, s: 'tierra' }]),
  C('Brote', 'tierra', 2, 1, [{ draw: 1 }]),
  C('Fortificar', 'tierra', 3, 1, [{ protect: 1, s: 'tierra' }]),
  C('Raíces profundas', 'tierra', 4, 2, [{ add: 1, s: 'tierra', prot: true }]),
  C('Crecimiento', 'tierra', 4, 2, [{ ifAny: 2, s: 'tierra' }]),
  C('Bastión', 'tierra', 5, 2, [{ protect: 2, s: 'tierra' }]),
  C('Tierra ancestral', 'tierra', 6, 3, [{ add: 2, s: 'tierra', prot: true }]),

  C('Brisa', 'aire', 2, 1, [{ add: 1, s: 'aire' }]),
  C('Ráfaga', 'aire', 3, 1, [{ add: 2, s: 'aire' }]),
  C('Inspiración', 'aire', 2, 1, [{ draw: 1 }]),
  C('Desorden', 'aire', 3, 1, [{ disrupt: 1 }]),
  C('Cambio de viento', 'aire', 3, 1, [{ refresh: 1 }]),
  C('Desvío', 'aire', 4, 2, [{ moveRival: 1, s: 'aire' }]),
  C('Corriente ascendente', 'aire', 4, 2, [{ moveOwnTo: 'aire' }, { draw: 1 }]),
  C('Torbellino', 'aire', 6, 3, [{ moveRival: 2, s: 'aire' }, { add: 1, s: 'aire' }]),
];

// v0.2: el Fuego retira y el Aire mueve en cualquier Santuario, la Tierra protege en cualquiera,
// cartas de coste 5 mejoradas y las cuatro cartas que rendían menos que una Mota de Maná reforzadas.
const cambios = {
  Quemadura: [{ swap: 1, s: 'fuego' }],
  Embestida: [{ add: 1, s: 'fuego' }, { remove: 1, s: '*' }],
  Incendio: [{ remove: 2, s: '*' }, { add: 1, s: 'fuego' }],
  'Llama de conquista': [{ add: 2, s: 'fuego' }, { remove: 1, s: '*' }],
  Renacer: [{ recover: 1 }, { draw: 1 }],
  Retorno: [{ draw: 1 }, { topFromDiscard: 1 }],
  Fortificar: [{ protect: 2, s: '*' }, { draw: 1 }],
  Bastión: [{ protect: 1, all: true, s: '*' }, { add: 1, s: 'tierra', prot: true }],
  Desorden: [{ add: 1, s: 'aire' }, { disrupt: 1, modo: 'todos' }],
  'Cambio de viento': [{ draw: 1 }, { refresh: 1 }],
  Desvío: [{ moveRival: 1, s: '*' }],
  Torbellino: [{ moveRival: 2, s: '*' }, { add: 1, s: 'aire' }],
};
const UMBRAL = UMBRAL_V01.map((c) => (cambios[c.nombre] ? { ...c, accion: cambios[c.nombre] } : c));

const INICIAL = [
  ...ELEMENTOS.flatMap((el) => {
    const nombre = { fuego: 'Fuego', agua: 'Agua', tierra: 'Tierra', aire: 'Aire' }[el];
    const c = C(`Menor de ${nombre}`, el, 0, 1, [{ add: 1, s: el }], true);
    return [c, c];
  }),
  C('Mota de Maná', null, 0, 1, [], true),
  C('Mota de Maná', null, 0, 1, [], true),
];

module.exports = { ELEMENTOS, UMBRAL, UMBRAL_V01, INICIAL };
