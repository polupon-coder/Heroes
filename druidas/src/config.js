'use strict';

// ESCUELA DE MAGIA — El bosque de los druidas. Tablas del reglamento v1.11.
// Para equilibrar el juego, se cambia aquí.

const ING = ['eter', 'umbra', 'lumen', 'raiz'];

const ING_INFO = {
  eter: { nombre: 'Éter', en: 'Aether', color: 'Violeta', simbolo: 'Espiral', hex: '#8a5cc7' },
  umbra: { nombre: 'Umbra', en: 'Umbra', color: 'Azul', simbolo: 'Emblema arcano', hex: '#3b63b5' },
  lumen: { nombre: 'Lumen', en: 'Lumen', color: 'Amarillo', simbolo: 'Emblema luminoso', hex: '#e0b12e' },
  raiz: { nombre: 'Raíz', en: 'Root', color: 'Verde', simbolo: 'Emblema natural', hex: '#4f9a44' },
};

const POR_TIPO = 14; // 56 fichas en total
const CLARO = 6; // espacios de El Claro
const RECOGER = 3;
const RECOGER_ZORRO = 5;
const RONDAS = 10;
const LIMITE_RESERVA = 6;
const MAX_POCIONES = 2;
const COPIAS = 4; // copias de cada conocimiento aprendible
const ESTUDIO_NORMAL = 2;
const ESTUDIO_IDEA = 3;
const ESTUDIO_SUENO = 1;
const BURBUJA_COSTE = { lumen: 2 };

// Conocimientos aprendibles. req = ingredientes para aprenderlo; coste = lanzar el hechizo
// o preparar la poción. ataque = solo contra el jugador activo, tras su recogida.
const CARTAS = {
  robo: {
    nombre: 'Robo', en: "Steal", textoEn: "Steal an ingredient from the active player's reserve. If it fits your recipe, you may place it directly.", tipo: 'hechizo', req: { umbra: 2, raiz: 1, eter: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'Roba un ingrediente de la reserva del jugador activo. Si encaja en tu receta en estudio, puedes colocarlo directamente.',
  },
  cambio: {
    nombre: 'Cambio', en: "Change", textoEn: "Place up to 2 ingredients from your reserve on your recipe. One may be a wildcard. Does not use your normal study.", tipo: 'hechizo', req: { raiz: 2, eter: 1 }, puntos: 3, coste: { eter: 1 },
    texto: 'Coloca hasta 2 ingredientes de tu reserva en tu receta. Uno puede ser comodín. No consume tu estudio normal.',
  },
  idea: {
    nombre: 'Idea', en: "Idea", textoEn: "In your study phase, before placing anything, you may place up to 3 ingredients instead of 2.", tipo: 'hechizo', req: { eter: 2, lumen: 1, raiz: 1 }, puntos: 4, coste: { lumen: 1 },
    texto: 'En tu fase de estudio, antes de colocar nada, puedes colocar hasta 3 ingredientes en lugar de 2.',
  },
  lio: {
    nombre: 'Lío', en: "Mix-up", textoEn: "Swap an ingredient the active player needs for one from the Clearing that is useless to them. If not blocked, place one of yours as a wildcard.", tipo: 'hechizo', req: { umbra: 1, lumen: 1, raiz: 1, eter: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'Cambia un ingrediente que el jugador activo necesita por uno de El Claro que no le sirva. Si no te bloquean, colocas uno de tu reserva como comodín.',
  },
  memoria: {
    nombre: 'Memoria', en: "Memory", textoEn: "Place up to 2 valid ingredients from your reserve on your recipe. Does not use your normal study.", tipo: 'pocion', req: { eter: 1, lumen: 1, raiz: 1 }, puntos: 3, coste: { lumen: 1 },
    texto: 'Coloca hasta 2 ingredientes válidos de tu reserva en tu receta. No consume tu estudio normal.',
  },
  sueno: {
    nombre: 'Sueño', en: "Sleep", textoEn: "The active player may place only 1 ingredient in their normal study. If not blocked, place one valid ingredient of yours.", tipo: 'pocion', req: { umbra: 2, raiz: 1, lumen: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'El jugador activo solo podrá colocar 1 ingrediente en su estudio normal. Si no te bloquean, colocas uno válido de tu reserva.',
  },
  suerte: {
    nombre: 'Suerte', en: "Luck", textoEn: "Take 3 ingredients from the Clearing. Then you may place a valid one from your reserve on your recipe.", tipo: 'pocion', req: { eter: 2, lumen: 1 }, puntos: 3, coste: { raiz: 1 },
    texto: 'Recoge 3 ingredientes de El Claro. Después puedes colocar uno válido de tu reserva en tu receta.',
  },
  pensar: {
    nombre: 'Pensar', en: "Think", textoEn: "Place on your recipe an ingredient from the Clearing that it needs, without having it in your reserve.", tipo: 'pocion', req: { eter: 2, raiz: 1, umbra: 1 }, puntos: 4, coste: { eter: 1 },
    texto: 'Coloca en tu receta un ingrediente de El Claro que le sirva, sin tenerlo en tu reserva.',
  },
};

const INICIALES = {
  chispa: {
    nombre: 'Chispa', en: "Spark", textoEn: "Free, once on your turn: swap an ingredient from your reserve with one in the Clearing. Does not use your magic.", tipo: 'hechizo', puntos: 0, coste: {},
    texto: 'Gratis, una vez en tu turno: cambia un ingrediente de tu reserva por uno de El Claro. No gasta tu magia.',
  },
  burbuja: {
    nombre: 'Burbuja', en: "Bubble", textoEn: "Costs 2 Lumen: cancels a magic attack against you.", tipo: 'hechizo', puntos: 0, coste: BURBUJA_COSTE,
    texto: 'Cuesta 2 Lumen: anula un ataque mágico contra ti.',
  },
};

const MASCOTAS = {
  lechuza: {
    nombre: 'Lechuza', don: 'Sabiduría', usos: 1, en: "Owl", donEn: "Wisdom", textoEn: "Once per game, when you finish your normal study, place one more valid ingredient from your reserve.",
    texto: 'Una vez por partida, al terminar tu estudio normal, coloca un ingrediente válido más de tu reserva.',
  },
  zorro: {
    nombre: 'Zorro', don: 'Astucia', usos: 2, en: "Fox", donEn: "Cunning", textoEn: "Twice per game, take 5 ingredients from the Clearing instead of 3.",
    texto: 'Dos veces por partida, recoge 5 ingredientes de El Claro en lugar de 3.',
  },
  liebre: {
    nombre: 'Liebre', don: 'Transformación', usos: 2, en: "Hare", donEn: "Transformation", textoEn: "Twice per game, in your study, use an ingredient from your reserve as if it were another type.",
    texto: 'Dos veces por partida, en tu estudio, usa un ingrediente de tu reserva como si fuera de otro tipo.',
  },
  cervatillo: {
    nombre: 'Cervatillo', don: 'Energía natural', usos: 1, en: "Fawn", donEn: "Natural energy", textoEn: "Once per game, after using non-free magic, place one more valid ingredient from your reserve (also on rivals' turns).",
    texto: 'Una vez por partida, tras usar una magia que no sea gratis, coloca un ingrediente válido más de tu reserva (también en turnos rivales).',
  },
};

const DRUIDAS = {
  mostaza: { nombre: 'El niño pelirrojo', en: 'The red-haired boy', ropa: 'mostaza', hex: '#c9962c' },
  azul: { nombre: 'La niña rubia', en: 'The blonde girl', ropa: 'azul', hex: '#3b63b5' },
  verde: { nombre: 'La niña morena', en: 'The dark-haired girl', ropa: 'verde', hex: '#4f9a44' },
  lila: { nombre: 'La niña de trenzas', en: 'The girl with braids', ropa: 'lila', hex: '#9a6cc7' },
};

// Segundos que tienen los rivales para decidir si atacan (y el atacado si se defiende).
const VENTANA_MS = Number(process.env.VENTANA_MS || 25000);

module.exports = {
  ING, ING_INFO, POR_TIPO, CLARO, RECOGER, RECOGER_ZORRO, RONDAS, LIMITE_RESERVA, MAX_POCIONES, COPIAS,
  ESTUDIO_NORMAL, ESTUDIO_IDEA, ESTUDIO_SUENO, BURBUJA_COSTE, CARTAS, INICIALES, MASCOTAS, DRUIDAS, VENTANA_MS,
};
