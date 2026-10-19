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
const META = 25; // Prestigio para ganar: quien llega termina la ronda y se acaba la partida
const RONDAS = 15; // tope de rondas por si nadie llega a la meta
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
    nombre: 'Robo', en: "Steal", textoEn: "Steal 1 ingredient from the active player.", tipo: 'hechizo', req: { umbra: 2, raiz: 1, eter: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'Robas 1 ingrediente al jugador activo.',
  },
  cambio: {
    nombre: 'Cambio', en: "Change", textoEn: "Place 2 ingredients on your recipe. One can be a wildcard.", tipo: 'hechizo', req: { raiz: 2, eter: 1 }, puntos: 3, coste: { eter: 1 },
    texto: 'Colocas 2 ingredientes en tu receta. Uno puede ser comodín.',
  },
  idea: {
    nombre: 'Idea', en: "Idea", textoEn: "This turn you place 3 ingredients instead of 2.", tipo: 'hechizo', req: { eter: 2, lumen: 1, raiz: 1 }, puntos: 4, coste: { lumen: 1 },
    texto: 'Este turno colocas 3 ingredientes en vez de 2.',
  },
  lio: {
    nombre: 'Lío', en: "Mix-up", textoEn: "Swap one of the active player's ingredients for one from the Clearing.", tipo: 'hechizo', req: { umbra: 1, lumen: 1, raiz: 1, eter: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'Cambias un ingrediente del jugador activo por otro de El Claro.',
  },
  memoria: {
    nombre: 'Memoria', en: "Memory", textoEn: "Place 2 more ingredients on your recipe.", tipo: 'pocion', req: { eter: 1, lumen: 1, raiz: 1 }, puntos: 3, coste: { lumen: 1 },
    texto: 'Colocas 2 ingredientes más en tu receta.',
  },
  sueno: {
    nombre: 'Sueño', en: "Sleep", textoEn: "The active player places only 1 ingredient this turn.", tipo: 'pocion', req: { umbra: 2, raiz: 1, lumen: 1 }, puntos: 4, coste: { umbra: 1 }, ataque: true,
    texto: 'El jugador activo solo coloca 1 ingrediente este turno.',
  },
  suerte: {
    nombre: 'Suerte', en: "Luck", textoEn: "Take 3 more ingredients from the Clearing.", tipo: 'pocion', req: { eter: 2, lumen: 1 }, puntos: 3, coste: { raiz: 1 },
    texto: 'Coges 3 ingredientes más de El Claro.',
  },
  pensar: {
    nombre: 'Pensar', en: "Think", textoEn: "Place an ingredient from the Clearing on your recipe.", tipo: 'pocion', req: { eter: 2, raiz: 1, umbra: 1 }, puntos: 4, coste: { eter: 1 },
    texto: 'Colocas en tu receta un ingrediente de El Claro.',
  },
};

const INICIALES = {
  chispa: {
    nombre: 'Chispa', en: "Spark", textoEn: "Free: swap one of your ingredients for one from the Clearing.", tipo: 'hechizo', puntos: 0, coste: {},
    texto: 'Gratis: cambias un ingrediente tuyo por uno de El Claro.',
  },
  burbuja: {
    nombre: 'Burbuja', en: "Bubble", textoEn: "Pay 2 Lumen to stop an attack.", tipo: 'hechizo', puntos: 0, coste: BURBUJA_COSTE,
    texto: 'Paga 2 Lumen y paras un ataque.',
  },
};

const MASCOTAS = {
  lechuza: {
    nombre: 'Lechuza', don: 'Sabiduría', usos: 1, corto: '+1 ingrediente al estudiar', cortoEn: '+1 ingredient when studying', en: "Owl", donEn: "Wisdom", textoEn: "Once: after your study, place 1 more ingredient.",
    texto: '1 vez: al acabar tu estudio, colocas 1 ingrediente más.',
  },
  zorro: {
    nombre: 'Zorro', don: 'Astucia', usos: 2, corto: 'Recoge 5 en vez de 3', cortoEn: 'Take 5 instead of 3', en: "Fox", donEn: "Cunning", textoEn: "Twice: take 5 ingredients instead of 3.",
    texto: '2 veces: recoges 5 ingredientes en vez de 3.',
  },
  liebre: {
    nombre: 'Liebre', don: 'Transformación', usos: 2, corto: 'Un ingrediente cuenta como otro', cortoEn: 'One ingredient counts as another', en: "Hare", donEn: "Transformation", textoEn: "Twice: when studying, one ingredient counts as another.",
    texto: '2 veces: al estudiar, un ingrediente cuenta como otro.',
  },
  cervatillo: {
    nombre: 'Cervatillo', don: 'Energía natural', usos: 1, corto: '+1 ingrediente tras usar magia', cortoEn: '+1 ingredient after using magic', en: "Fawn", donEn: "Natural energy", textoEn: "Once: after using magic, place 1 more ingredient.",
    texto: '1 vez: tras usar magia, colocas 1 ingrediente más.',
  },
};

const DRUIDAS = {
  mostaza: { nombre: 'El niño pelirrojo', en: 'The red-haired boy', ropa: 'mostaza', hex: '#c9962c' },
  azul: { nombre: 'La niña rubia', en: 'The blonde girl', ropa: 'azul', hex: '#3b63b5' },
  verde: { nombre: 'La niña morena', en: 'The dark-haired girl', ropa: 'verde', hex: '#4f9a44' },
  lila: { nombre: 'La niña de trenzas', en: 'The girl with braids', ropa: 'lila', hex: '#9a6cc7' },
};

// Segundos que tienen los rivales para decidir si atacan (y el atacado si se defiende).
const VENTANA_MS = Number(process.env.VENTANA_MS || 12000);

module.exports = {
  ING, ING_INFO, POR_TIPO, CLARO, RECOGER, RECOGER_ZORRO, META, RONDAS, LIMITE_RESERVA, MAX_POCIONES, COPIAS,
  ESTUDIO_NORMAL, ESTUDIO_IDEA, ESTUDIO_SUENO, BURBUJA_COSTE, CARTAS, INICIALES, MASCOTAS, DRUIDAS, VENTANA_MS,
};
