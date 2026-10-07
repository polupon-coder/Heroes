'use strict';
// Genera cartas.html: lámina con todas las cartas de MANA, sus símbolos y qué hacen.
// Coste y Maná salen de mana/cartas.js; los símbolos y textos, de la tabla de abajo.
// Uso: node mana/maqueta/esquema.js
const fs = require('node:fs');
const path = require('node:path');
const { UMBRAL } = require('../cartas');

const ACCION = require('./acciones');


for (const c of UMBRAL) if (!ACCION[c.nombre]) throw new Error(`Falta la explicación de ${c.nombre}`);

const ELEMENTOS = [
  ['fuego', 'Fuego', 'Presión', '«Te saco de aquí.»'],
  ['agua', 'Agua', 'Ciclo', '«Mis mejores espíritus vuelven una y otra vez.»'],
  ['tierra', 'Tierra', 'Permanencia', '«Intenta moverme.»'],
  ['aire', 'Aire', 'Manipulación', '«Cambio tus planes.»'],
];

const color = (c) => (c === 'neutro' ? 'var(--neutro)' : `var(--${c})`);
const glifo = (s) => `<svg><use href="#${s}"/></svg>`;
const accion = (partes) => {
  if (!partes.length) return '';
  if (partes.length === 1) {
    const [s, t, c] = partes[0];
    return `<span class="esf a" style="background:${color(c)}">${t}${glifo(s)}</span>`;
  }
  const [[s1, t1, c1], [s2, t2, c2]] = partes;
  return `<span class="esf a doble" style="background:linear-gradient(90deg, ${color(c1)} 50%, ${color(c2)} 50%)">` +
    `<span>${glifo(s1)}${t1}</span><span>${glifo(s2)}${t2}</span></span>`;
};
const esferas = (coste, mana, partes) =>
  `<div class="esferas${coste ? '' : ' sin-coste'}">${coste ? `<span class="esf c">${coste}</span>` : ''}<span class="esf m">${mana}</span>${accion(partes)}</div>`;
const ilus = (el) => el
  ? `<div class="ilus" style="background:var(--t-${el})"><svg style="color:var(--${el})"><use href="#${el}"/></svg></div>`
  : '<div class="ilus" style="background:#ede9fe"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="var(--mana)"/></svg></div>';
const fila = (nombre, el, coste, mana, partes, texto) =>
  `<div class="fila">${ilus(el)}<div class="info"><div class="nombre">${nombre}</div>${esferas(coste, mana, partes)}</div><div class="texto">${texto}</div></div>`;

const columnas = ELEMENTOS.map(([el, nom, verbo, lema]) => {
  const cartas = UMBRAL.filter((c) => c.el === el).map((c) => fila(c.nombre, el, c.coste, c.mana, ...ACCION[c.nombre])).join('');
  return `<section class="col" style="--el:var(--${el})"><header>${glifo(el)}<div><b>${nom}</b> · ${verbo}<small>${lema}</small></div></header>${cartas}</section>`;
}).join('');

const iniciales = [
  ...ELEMENTOS.map(([el, nom]) => fila({ fuego: 'Chispa', agua: 'Rocío', tierra: 'Grano', aire: 'Aliento' }[el], el, 0, 1, [[el, '+1', el]], `Pon 1 Presencia en ${nom}.`)),
  fila('Mota', null, 0, 1, [], 'Solo da Maná.'),
].join('');

const LEYENDA = [
  ['<span class="esf c">3</span>', 'Coste', 'Maná que pagas para vincularlo desde el Umbral. Las cartas iniciales no tienen.'],
  ['<span class="esf m">1</span>', 'Maná', 'Maná que da si la usas como Maná en lugar de por su Acción.'],
  [`<span class="esf a" style="background:var(--fuego)">+2${glifo('fuego')}</span>`, 'Presencia', 'Pon Presencias tuyas en el Santuario de ese color.'],
  [`<span class="esf a" style="background:var(--neutro)">−1${glifo('retira')}</span>`, 'Retira', 'Quita Presencias rivales. En gris: de cualquier Santuario; en color: de ese.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('mueve')}</span>`, 'Mueve', 'Lleva Presencias de un Santuario a otro. En color: hacia ese Santuario.'],
  [`<span class="esf a" style="background:var(--neutro)">2${glifo('escudo')}</span>`, 'Protege', 'Esas Presencias no se pueden retirar ni mover hasta el final de la Era. ∞: todas las de un Santuario.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('roba')}</span>`, 'Roba', 'Roba cartas de tu mazo. Puedes jugarlas este mismo turno.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('descarta')}</span>`, 'Descarta', 'Una carta de la mano va al descarte.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('recupera')}</span>`, 'Recupera', 'Coge una carta de tu descarte y llévala a tu mano.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('encima')}</span>`, 'Encima del mazo', 'Coloca una carta encima de tu mazo: la robarás en tu próximo turno.'],
  [`<span class="esf a" style="background:var(--neutro)">1${glifo('cambia')}</span>`, 'Cambia', 'Descarta un Elemental del Umbral y revela otro en su lugar.'],
  [`<span class="esf a doble" style="background:linear-gradient(90deg, var(--fuego) 50%, var(--neutro) 50%)"><span>${glifo('fuego')}+1</span><span>${glifo('retira')}−1</span></span>`, 'Dos efectos', 'La esfera se parte: se aplican los dos, de izquierda a derecha.'],
  ['<span class="marca">+1/2 · +2*</span>', 'Condición', '/: +1, o +2 si vas por detrás. *: solo si ya tienes Presencia allí.'],
];
const leyenda = LEYENDA.map(([icono, t, x]) => `<div class="ley"><div class="icono">${icono}</div><div><b>${t}</b>${x}</div></div>`).join('');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>MANA — cartas</title>
<style>
  :root {
    --fondo: #f6f5f1; --tinta: #1d1d1f; --suave: #7d7d83; --linea: #e4e2dc;
    --coste: #a3a3a8; --mana: #a78bfa; --neutro: #4b5563;
    --fuego: #e5533d; --agua: #3b82f6; --tierra: #3fa66b; --aire: #e3b21c;
    --t-fuego: #fbe3df; --t-agua: #dfeafd; --t-tierra: #dcf0e3; --t-aire: #faf0d0;
  }
  * { box-sizing: border-box; margin: 0; }
  html { zoom: 1.5; background: var(--fondo); } /* diseño a 1280 px de ancho, se muestra a 1920 */
  body { width: 1280px; padding: 30px 40px 36px; background: var(--fondo); color: var(--tinta);
    font: 12px/1.35 "Helvetica Neue", Helvetica, Arial, sans-serif; }
  h1 { text-align: center; font-size: 15px; letter-spacing: .4em; padding-left: .4em; }
  .sub { text-align: center; color: var(--suave); margin: 4px 0 22px; }
  h2 { font-size: 10.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--suave); font-weight: 600; margin: 0 0 10px; text-align: center; }

  .leyenda { background: #fff; border-radius: 16px; padding: 18px 22px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px 20px; margin-bottom: 14px; }
  .ley { display: grid; grid-template-columns: 76px 1fr; gap: 10px; align-items: center; font-size: 10.5px; color: var(--suave); }
  .ley b { display: block; color: var(--tinta); font-size: 11.5px; }
  .ley .icono { display: flex; justify-content: center; }
  .regla { text-align: center; color: var(--suave); font-size: 11px; margin: 0 0 26px; }
  .regla b { color: var(--tinta); }

  .columnas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; }
  .col { background: #fff; border-radius: 16px; overflow: hidden; }
  .col header { background: color-mix(in srgb, var(--el) 14%, #fff); color: var(--el); padding: 12px 14px; display: flex; gap: 10px; align-items: center; }
  .col header > svg { width: 22px; height: 22px; flex: none; }
  .col header b { font-size: 13px; letter-spacing: .04em; }
  .col header div { color: var(--tinta); font-size: 12px; }
  .col header small { display: block; color: var(--suave); font-size: 10px; font-style: italic; }

  .fila { display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto; column-gap: 10px; row-gap: 5px;
    padding: 10px 14px; border-top: 1px solid var(--linea); align-items: center; }
  .col header + .fila { border-top: 0; }
  .fila .ilus { grid-row: span 2; width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; align-self: start; }
  .fila .ilus svg { width: 22px; height: 22px; }
  .info { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .nombre { font-weight: 600; font-size: 12px; }
  .texto { font-size: 10.5px; color: var(--suave); }

  .esferas { display: grid; grid-template-columns: 26px 26px 38px; gap: 3px; justify-items: center; align-items: center; }
  .esf { width: 26px; height: 26px; border-radius: 50%; color: #fff; font-weight: 700; font-size: 11px;
    display: inline-flex; align-items: center; justify-content: center; gap: 1px; }
  .esf svg { width: 10px; height: 10px; }
  .esf.c { background: var(--coste); } .esf.m { background: var(--mana); }
  .esf.a { width: 38px; height: 38px; font-size: 11px; }
  .esf.a svg { width: 11px; height: 11px; }
  .esf.doble { gap: 0; }
  .esf.doble > span { width: 50%; display: flex; flex-direction: column; align-items: center; font-size: 9.5px; line-height: 1; gap: 1px; }
  .esf.doble svg { width: 9px; height: 9px; }
  .esferas.sin-coste { grid-template-columns: 26px 38px; }
  .iniciales .nombre { white-space: nowrap; }
  .marca { font-weight: 700; font-size: 11px; color: var(--tinta); white-space: nowrap; }

  .iniciales { margin-top: 26px; background: #fff; border-radius: 16px; padding: 14px 14px 6px; }
  .iniciales .grid { display: grid; grid-template-columns: repeat(5, 1fr); }
  .iniciales .fila { border-top: 0; }
  .iniciales p { text-align: center; color: var(--suave); font-size: 10.5px; margin: 2px 0 8px; }
</style>
</head>
<body>
<svg width="0" height="0" style="position:absolute">
  <defs>
    <symbol id="fuego" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2.5 1.3-4 2.5-5.2.2 1.7 1 2.7 2 3.2C11 8 11 5 12 2z"/></symbol>
    <symbol id="agua" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2.5c3.5 4.6 6 8 6 11.2a6 6 0 0 1-12 0C6 10.5 8.5 7.1 12 2.5z"/></symbol>
    <symbol id="tierra" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2c4 3 7 6.5 7 10.5A7 7 0 0 1 13 19.4V22h-2v-2.6a7 7 0 0 1-6-6.9C5 8.5 8 5 12 2z"/></symbol>
    <symbol id="aire" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="M4 8h16M2 12h20M4 16h16"/></symbol>
    <symbol id="roba" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 8v7m-3-3 3 3 3-3" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
    <symbol id="descarta" viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="m9.5 8.5 5 5m0-5-5 5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></symbol>
    <symbol id="recupera" viewBox="0 0 24 24"><path d="M19 12a7 7 0 1 1-2-4.9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19 3.5V8h-4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="encima" viewBox="0 0 24 24"><path d="M12 15V4m-4 4 4-4 4 4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 19h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
    <symbol id="cambia" viewBox="0 0 24 24"><path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></symbol>
    <symbol id="escudo" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></symbol>
    <symbol id="mueve" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></symbol>
    <symbol id="retira" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M8.5 12h7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></symbol>
  </defs>
</svg>

<h1>MANA</h1>
<div class="sub">Los Elementales: 32 tipos, 3 copias de cada uno, más las cartas iniciales</div>

<h2>Símbolos</h2>
<div class="leyenda">${leyenda}</div>
<p class="regla">Cada carta se juega <b>como Acción</b> (su esfera de color) <b>o como Maná</b> (su esfera lila), nunca las dos. El <b>color</b> de la esfera de Acción dice a qué Santuario afecta; el <b>gris oscuro</b>, que afecta a cualquiera o a tus cartas.</p>

<div class="columnas">${columnas}</div>

<div class="iniciales">
  <h2>Cartas iniciales</h2>
  <p>Cada Guardián empieza con 2 Menores de cada elemento, 1 Menor más de su color y 1 Mota (10 cartas).</p>
  <div class="grid">${iniciales}</div>
</div>
</body>
</html>
`;
fs.writeFileSync(path.join(__dirname, 'cartas.html'), html);
console.log('cartas.html generado');
