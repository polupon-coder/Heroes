/* ESCUELA DE MAGIA — cliente web */
'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'druidas.session';

let S = null; // último estado recibido del servidor
let D = null; // tablas del reglamento e ilustraciones disponibles
let receivedAt = 0;
const ui = { key: '', sel: [], zorro: false, home: false, mode: null, chispaTipo: null, modal: null, logOpen: false, lastLog: -1 };

const PASO = { recoger: 'Recoger', ventana: 'Ataques', defensa: 'Defensa', estudiar: 'Estudiar', preparar: 'Preparar', descartar: 'Devolver' };
const PET_EMOJI = { lechuza: '🦉', zorro: '🦊', liebre: '🐇', cervatillo: '🦌' };

// Símbolos de los ingredientes (se usan si no hay ilustración).
function starPath(n, R, r) {
  let d = '';
  for (let i = 0; i < 2 * n; i += 1) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(12 + rad * Math.cos(a)).toFixed(2)} ${(12 + rad * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}
const SYMBOL = {
  eter: '<path d="M12 12a1.6 1.6 0 0 1 3.2 0a3.2 3.2 0 0 1-6.4 0a4.8 4.8 0 0 1 9.6 0a6.4 6.4 0 0 1-12.8 0"/>',
  umbra: `<path class="fill" d="${starPath(4, 9.5, 2.6)}"/>`,
  lumen: `<path class="fill" d="${starPath(12, 9.6, 5.4)}"/>`,
  raiz: '<path d="M7.5 19.5V11a4.5 4.5 0 0 1 9 0v8.5"/><path d="M12 19.5V8.5M12 13.5l-2.6-2.2M12 13.5l2.6-2.2"/>',
};

// ------------------------------------------------------------ utilidades

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
const ING = () => D.ing;
const N = (t) => D.ingInfo[t].nombre;
const card = (id) => D.cartas[id] || D.iniciales[id];
const sum = (o) => ING().reduce((s, t) => s + (o[t] || 0), 0);
const me = () => S && S.players.find((p) => p.id === S.me);
const pl = (id) => S.players.find((p) => p.id === id);
const isMyTurn = () => S && S.turn && S.turn.pid === S.me;

function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; }
}
function saveSession(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* sin almacenamiento */ }
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

function send(type, data, done) {
  socket.emit('act', { type, data }, (r) => {
    if (r && !r.ok) toast(r.error);
    else if (done) done();
  });
}

function tok(t, { cls = '', n = null, flat = false } = {}) {
  const img = flat ? null : D.img.ingredientes[t];
  const inner = img ? `<img src="${img}" alt="">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOL[t]}</svg>`;
  return `<span class="tok tok-${t} ${img ? 'has-img' : ''} ${cls}" title="${N(t)}">${inner}${n !== null ? `<b>${n}</b>` : ''}</span>`;
}
const emptyTok = (t, cls = '') => {
  const img = D.img.ingredientes[t];
  const inner = img ? `<img src="${img}" alt="">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOL[t]}</svg>`;
  return `<span class="tok slot-empty tok-${t} ${img ? 'has-img' : ''} ${cls}" title="Falta ${N(t)}">${inner}</span>`;
};

function costHtml(coste) {
  const out = [];
  for (const t of ING()) for (let k = 0; k < (coste[t] || 0); k += 1) out.push(tok(t, { cls: 'xs' }));
  return out.join('') || '<span class="free">gratis</span>';
}

// Retrato del druida: cuerpo entero en los formatos altos (xl, full); la cara en el resto.
function druidPortrait(id, cls = '') {
  const info = D.druidas[id];
  if (!info) return '';
  const tall = /\b(xl|full|hero)\b/.test(cls);
  // Siempre la cara (el retrato completo de la hoja de caras).
  const img = D.img.retratos[id] || D.img.druidas[id];
  if (img) return `<span class="portrait ${cls} ${tall ? 'body' : ''}" style="--c:${info.hex}"><img src="${img}" alt="${esc(info.nombre)}"></span>`;
  return `<span class="portrait ph ${cls}" style="--c:${info.hex}" title="${esc(info.nombre)}"><svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 4C12 4 8 11.5 8 19.5L5.5 38h29L32 19.5C32 11.5 28 4 20 4z"/><path class="face" d="M20 12.5c-4.6 0-6.8 4.4-6.8 8.2 0 3.8 3 5.8 6.8 5.8s6.8-2 6.8-5.8c0-3.8-2.2-8.2-6.8-8.2z"/></svg></span>`;
}

function petPortrait(id, cls = '') {
  const img = D.img.mascotas[id];
  if (img) return `<span class="pet-pic ${cls}"><img src="${img}" alt="${esc(D.mascotas[id].nombre)}"></span>`;
  return `<span class="pet-pic ph ${cls}">${PET_EMOJI[id]}</span>`;
}

// Carta de conocimiento. estudio = { placed, pend } para mostrar los espacios.
function cardHtml(id, { estudio = null, footer = '', cls = '', prepared = false } = {}) {
  const c = card(id);
  const img = D.img.cartas[id];
  let slots = '';
  if (c.req) {
    const out = [];
    for (const t of ING()) {
      const need = c.req[t] || 0;
      const have = estudio ? estudio.placed[t] : 0;
      for (let k = 0; k < need; k += 1) out.push(k < have ? tok(t, { cls: 'sm' }) : (estudio ? emptyTok(t) : tok(t, { cls: 'sm' })));
    }
    slots = `<div class="req">${out.join('')}</div>`;
  }
  const kind = c.tipo === 'pocion' ? 'Poción' : 'Hechizo';
  const use = c.tipo === 'pocion' ? 'Preparar' : 'Lanzar';
  return `<article class="kcard ${c.tipo} ${cls} ${c.ataque ? 'attack' : ''}">
    <header><span class="kname">${esc(c.nombre)}</span>${c.puntos ? `<span class="pts" title="Prestigio">${c.puntos}</span>` : ''}</header>
    ${img ? `<div class="art"><img src="${img}" alt=""></div>` : ''}
    <div class="kind">${kindIcon(c.tipo, 'sm')}${kind}${c.ataque ? ' · ataque' : ''}${prepared ? ' · <b class="ready">preparada</b>' : ''}</div>
    ${slots}
    <div class="use">${use}: ${costHtml(c.coste)}</div>
    <p class="ktext">${esc(c.texto)}</p>
    ${footer}
  </article>`;
}

function reserveHtml(p, { clickable = false } = {}) {
  const out = [];
  for (const t of ING()) {
    for (let k = 0; k < p.reserva[t]; k += 1) {
      out.push(clickable ? `<button class="tokbtn" data-a="res" data-v="${t}">${tok(t)}</button>` : tok(t, { cls: 'sm' }));
    }
  }
  return out.join('') || '<span class="muted small">vacía</span>';
}

// ------------------------------------------------------------ estado derivado

function magicMoment(p = me()) {
  if (!S || S.phase !== 'juego' || !p) return false;
  const t = S.turn;
  if (t.paso === 'defensa') return false;
  if (t.pid === p.id && t.paso === 'ventana') return false;
  return true;
}

function canCast(id) {
  const p = me();
  const t = S.turn;
  if (!magicMoment()) return false;
  if (id === 'chispa') return isMyTurn() && !t.chispa && sum(p.reserva) > 0;
  const c = D.cartas[id];
  if (!c || c.ataque || !p.magiaLibre) return false;
  if (c.tipo === 'pocion' ? !p.pociones.includes(id) : !p.aprendidas.includes(id)) return false;
  if (c.tipo === 'hechizo' && !ING().every((k) => p.reserva[k] >= (c.coste[k] || 0))) return false;
  if (id === 'idea') return isMyTurn() && t.paso === 'estudiar' && t.estudiadas === 0 && !t.idea && !t.lechuza;
  if (id === 'cambio' || id === 'memoria' || id === 'pensar') return !!p.estudio;
  return true;
}

function canPrepare(id) {
  const p = me();
  const t = S.turn;
  const c = D.cartas[id];
  return isMyTurn() && ['estudiar', 'preparar'].includes(t.paso) && !t.preparada && p.aprendidas.includes(id)
    && !p.pociones.includes(id) && p.pociones.length < 2 && ING().every((k) => p.reserva[k] >= (c.coste[k] || 0));
}

function recogerNeed() {
  const avail = S.claro.filter(Boolean).length;
  return Math.min(ui.zorro ? 5 : 3, avail);
}

// ------------------------------------------------------------ render

function render() {
  if (!S || !D || ui.home) return;
  $('home').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('logBtn').classList.toggle('hidden', S.phase === 'lobby');
  $('homeBtn').classList.remove('hidden');
  const key = S.turn ? `${S.round}|${S.turn.pid}|${S.turn.paso}` : S.phase;
  if (key !== ui.key) {
    ui.key = key;
    ui.sel = [];
    ui.zorro = false;
    ui.mode = null;
    ui.chispaTipo = null;
    if (ui.modal && ui.modal.kind !== 'rules') ui.modal = null;
    if (S.phase === 'fin') ui.modal = { kind: 'final' };
  }
  renderTop();
  if (S.phase === 'lobby') {
    $('lobby').classList.remove('hidden');
    $('table').classList.add('hidden');
    renderLobby();
  } else {
    $('lobby').classList.add('hidden');
    $('table').classList.remove('hidden');
    renderPrompt();
    renderCatalog();
    renderClaro();
    renderMesa();
    renderRivals();
    if (isMyTurn() && S.turn.paso === 'descartar' && (!ui.modal || ui.modal.kind !== 'descartar')) {
      ui.modal = { kind: 'descartar', ings: { eter: 0, umbra: 0, lumen: 0, raiz: 0 } };
    }
  }
  renderLog();
  renderModal();
}

function renderTop() {
  $('sub').innerHTML = `El bosque de los druidas · Sala <code>${esc(S.code)}</code>`;
  const pill = $('roundPill');
  pill.classList.toggle('hidden', S.phase === 'lobby');
  if (S.phase !== 'lobby') pill.innerHTML = `Ronda <span class="round-num">${Math.min(S.round, S.rondas)}</span><span class="round-of">/ ${S.rondas}</span>`;
  $('prompt').classList.toggle('hidden', S.phase === 'lobby');
}

function timerHtml() {
  return S.turn && S.turn.restante !== null ? ` <span class="timer" id="timer">${Math.ceil(remaining() / 1000)} s</span>` : '';
}
function remaining() {
  return Math.max(0, S.turn.restante - (Date.now() - receivedAt));
}

function renderLobby() {
  const p = me();
  const host = S.hostId === S.me;
  const link = `${location.origin}${location.pathname}?sala=${S.code}`;
  const taken = (field, v) => S.players.some((x) => x.id !== S.me && x[field] === v);
  const druids = Object.entries(D.druidas).map(([id, d]) => `
    <button class="choice ${p.druida === id ? 'on' : ''}" data-a="druida" data-v="${id}" ${taken('druida', id) ? 'disabled' : ''}>
      ${druidPortrait(id, 'full')}<span>${esc(d.nombre)}</span><small>ropa ${esc(d.ropa)}</small>
    </button>`).join('');
  const pets = Object.entries(D.mascotas).map(([id, m]) => `
    <button class="choice pet ${p.mascota === id ? 'on' : ''}" data-a="mascota" data-v="${id}" ${taken('mascota', id) ? 'disabled' : ''}>
      ${petPortrait(id, 'lg')}<span>${esc(m.nombre)} · ${esc(m.don)}</span><small>${esc(m.texto)} (${m.usos} ${m.usos > 1 ? 'usos' : 'uso'})</small>
    </button>`).join('');
  const list = S.players.map((x) => `
    <li>${druidPortrait(x.druida, 'sm')} ${petPortrait(x.mascota, 'sm')} <b>${esc(x.name)}</b>
      ${x.id === S.hostId ? '<span class="tag">anfitrión</span>' : ''}${x.connected || x.bot ? '' : '<span class="tag off">desconectado</span>'}
      ${host && x.id !== S.me ? `<button class="btn tiny ghost dark" data-a="kick" data-v="${x.id}">Quitar</button>` : ''}</li>`).join('');
  $('lobby').innerHTML = `
    <div class="lobby">
      <div class="panel lobby-side">
        <h2 class="ptitle">Sala <span class="code-big">${esc(S.code)}</span></h2>
        <p class="small">Comparte este enlace con tus amigos:</p>
        <div class="share"><input class="input" readonly value="${esc(link)}" id="shareLink"><button class="btn small" data-a="copy">Copiar</button></div>
        <h3 class="ptitle sm">Aprendices (${S.players.length}/4)</h3>
        <ul class="plist">${list}</ul>
        ${host ? `<div class="row">
            <button class="btn" data-a="bot" ${S.players.length >= 4 ? 'disabled' : ''}>+ Añadir bot</button>
            <button class="btn primary" data-a="start" ${S.players.length < 2 ? 'disabled' : ''}>Empezar</button>
          </div>${S.players.length < 2 ? '<p class="muted small">Hacen falta al menos 2 druidas.</p>' : ''}`
    : '<p class="muted">El anfitrión empezará la partida.</p>'}
      </div>
      <div class="panel lobby-main">
        <h3 class="ptitle sm">Tu druida</h3>
        <p class="muted small center">Todos funcionan igual: el aspecto no da ventajas.</p>
        <div class="choices">${druids}</div>
        <h3 class="ptitle sm">Tu animal del bosque</h3>
        <div class="choices">${pets}</div>
      </div>
    </div>`;
}

function renderPrompt() {
  const el = $('prompt');
  if (S.phase === 'fin') {
    const w = S.winners.map((id) => esc(pl(id).name)).join(' y ');
    el.className = 'prompt mine';
    el.innerHTML = `<div class="msg"><b>Fin del aprendizaje.</b> ${S.winners.length > 1 ? `Victoria compartida: ${w}.` : `¡Gana ${w}!`}</div>
      <div class="btns"><button class="btn primary" data-a="showFinal">Resultados</button></div>`;
    return;
  }
  const t = S.turn;
  const p = me();
  const a = pl(t.pid);
  let msg = '';
  let btns = '';
  if (isMyTurn()) {
    if (t.paso === 'recoger') {
      const need = recogerNeed();
      msg = `<b>Fase 1 · Recoger.</b> Elige ${need} ingredientes de El Claro (${ui.sel.length}/${need})${ui.zorro ? ' 🦊' : ''}.`;
      btns += `<button class="btn primary" data-a="recoger" ${ui.sel.length === need ? '' : 'disabled'}>Recoger</button>`;
    } else if (t.paso === 'ventana') {
      msg = `Tus rivales deciden si te atacan…${timerHtml()}`;
    } else if (t.paso === 'defensa') {
      msg = `<b>¡${esc(pl(t.ataque.from).name)} te ataca con ${esc(card(t.ataque.carta).nombre)}!</b> ${attackDesc(t.ataque)}${timerHtml()}`;
      btns = `<button class="btn primary" data-a="defender" ${p.magiaLibre && p.reserva.lumen >= 2 ? '' : 'disabled'}>🫧 Burbuja ${tok('lumen', { cls: 'xs' })}${tok('lumen', { cls: 'xs' })}</button>
        <button class="btn" data-a="noDefender">Aceptar el ataque</button>`;
    } else if (t.paso === 'estudiar') {
      if (!p.estudio && !t.completada) msg = '<b>Fase 2 · Estudiar.</b> Elige un conocimiento disponible para estudiarlo.';
      else if (!p.estudio) msg = '<b>Fase 2 · Estudiar.</b> ¡Aprendido! Elegirás nueva receta en tu próximo turno.';
      else if (t.lechuza || t.estudiadas >= t.limite) msg = '<b>Fase 2 · Estudiar.</b> Has terminado tu estudio normal.';
      else msg = `<b>Fase 2 · Estudiar.</b> Pulsa ingredientes de tu reserva para colocarlos (${t.estudiadas}/${t.limite}${t.limite === 1 ? ' 💤' : ''}).`;
      if (ui.mode === 'liebre') msg = '🐇 Pulsa el ingrediente de tu reserva que quieres transformar.';
      if (ui.mode === 'lechuza') msg = '🦉 Pulsa el ingrediente de tu reserva que la Lechuza colocará.';
      btns += '<button class="btn primary" data-a="finEstudio">Terminar estudio</button>';
    } else if (t.paso === 'preparar') {
      msg = t.preparada ? '<b>Fase 3 · Preparar.</b> Ya has preparado una poción.' : '<b>Fase 3 · Preparar.</b> Puedes preparar 1 poción que conozcas.';
      btns = '<button class="btn primary" data-a="finTurno">Terminar turno</button>';
    } else if (t.paso === 'descartar') {
      msg = `Tienes más de ${D.limiteReserva} ingredientes: devuelve los que sobran.`;
      btns = '<button class="btn primary" data-a="openDescartar">Elegir</button>';
    }
  } else {
    msg = `Turno de <b>${esc(a.name)}</b> · ${PASO[t.paso]}.`;
    if (t.paso === 'ventana') {
      if (S.ataques.length && !t.miRespuesta) {
        msg = `<b>${esc(a.name)} ha recogido.</b> ¿Le atacas?${timerHtml()}`;
        btns = S.ataques.map((id) => `<button class="btn attack" data-a="atacar" data-v="${id}">⚡ ${esc(card(id).nombre)}</button>`).join('')
          + '<button class="btn" data-a="pasar">No atacar</button>';
      } else {
        msg = `${esc(a.name)} ha recogido. Los rivales deciden si le atacan…${timerHtml()}`;
      }
    } else if (t.paso === 'defensa') {
      msg = `${esc(pl(t.ataque.from).name)} ataca a ${esc(a.name)} con ${esc(card(t.ataque.carta).nombre)}. ¿Se defenderá con Burbuja?${timerHtml()}`;
    }
  }
  if (ui.mode === 'chispa') msg = ui.chispaTipo ? `✧ Chispa: pulsa un ingrediente de El Claro para cambiarlo por ${N(ui.chispaTipo)}.` : '✧ Chispa: pulsa el ingrediente de tu reserva que quieres cambiar.';
  if (ui.mode === 'pensar') msg = '✦ Pensar: pulsa un ingrediente de El Claro que necesite tu receta.';
  if (ui.mode === 'cerv') msg = '🦌 Cervatillo: pulsa el ingrediente de tu reserva que quieres colocar.';
  if (ui.mode) btns += '<button class="btn ghost" data-a="cancelMode">Cancelar</button>';
  el.className = `prompt ${isMyTurn() || (t.paso === 'ventana' && S.ataques.length && !t.miRespuesta) ? 'mine' : ''}`;
  el.innerHTML = `<div class="msg">${msg}</div>${btns ? `<div class="btns">${btns}</div>` : ''}`;
}

function attackDesc(a) {
  if (a.carta === 'robo') return `Quiere robarte un ${N(a.tipo)}.`;
  if (a.carta === 'lio') return `Quiere cambiar tu ${N(a.tipo)} por ${N(S.claro[a.slot])} de El Claro.`;
  if (a.carta === 'sueno') return 'Solo podrás colocar 1 ingrediente en tu estudio.';
  return '';
}

// Icono grande de una carta: su ilustración o el ingrediente con que se usa.
// Símbolo del tipo de conocimiento: frasco (poción) o pergamino sellado (hechizo).
function kindIcon(tipo, cls = '') {
  const img = D.img.ui[tipo === 'pocion' ? 'pocion' : 'hechizo'];
  const label = tipo === 'pocion' ? 'Poción' : 'Hechizo';
  return img ? `<img class="kind-ico ${cls}" src="${img}" alt="${label}" title="${label}">` : '';
}

function cardIcon(id, cls = 'lg') {
  const img = D.img.cartas[id];
  if (img) return `<span class="card-icon ${cls}"><img src="${img}" alt=""></span>`;
  return tok(Object.keys(card(id).coste)[0] || 'lumen', { cls });
}

function canPickCard() {
  const t = S.turn;
  return isMyTurn() && t && t.paso === 'estudiar' && !me().estudio && !t.completada;
}

function renderCatalog() {
  const p = me();
  const pick = canPickCard();
  const cards = Object.keys(D.cartas).map((id) => {
    const c = D.cartas[id];
    const known = p.aprendidas.includes(id);
    const dots = ING().map((t) => tok(t, { cls: 'dot flat', flat: true }).repeat(c.req[t] || 0)).join('');
    return `<button class="kc ${c.tipo} ${c.ataque ? 'attack' : ''} ${known ? 'known' : ''} ${pick && !known && S.catalogo[id] > 0 ? 'pickable' : ''}"
        data-a="info" data-v="${id}" title="${esc(c.nombre)}: ${esc(c.texto)}">
      <span class="kc-top">
        <span class="kc-pts" title="Prestigio">${c.puntos}</span>
        <span class="kc-icon ${c.tipo === 'pocion' ? 'flask' : 'scroll'}" title="${c.tipo === 'pocion' ? 'Poción' : 'Hechizo'}">${cardIcon(id)}</span>
        <span class="kc-req" title="Para aprenderlo">${dots}</span>
      </span>
      <span class="kc-name">${esc(c.nombre)}</span>
      ${known ? '<span class="kc-done" title="Aprendido">✓</span>' : `<span class="kc-copies" title="Copias en el catálogo">×${S.catalogo[id] || 0}</span>`}
    </button>`;
  }).join('');
  $('catalog').innerHTML = `<div class="kcs">${cards}</div>`;
}

function petUsable() {
  const p = me();
  const t = S.turn;
  if (!t || p.usos <= 0) return false;
  if (p.mascota === 'zorro') return isMyTurn() && t.paso === 'recoger';
  if (p.mascota === 'liebre') return isMyTurn() && t.paso === 'estudiar' && !!p.estudio && !t.lechuza && t.estudiadas < t.limite;
  if (p.mascota === 'lechuza') return isMyTurn() && t.paso === 'estudiar' && !!p.estudio && !t.lechuza;
  if (p.mascota === 'cervatillo') return p.cervatillo && magicMoment();
  return false;
}

function resClickable() {
  const p = me();
  const t = S.turn;
  return !!t && (ui.mode === 'chispa' || ui.mode === 'liebre' || ui.mode === 'lechuza' || ui.mode === 'cerv'
    || (isMyTurn() && t.paso === 'estudiar' && !!p.estudio && !t.lechuza && t.estudiadas < t.limite));
}

const usosHtml = (p) => `${'●'.repeat(p.usos)}${'○'.repeat(Math.max(0, D.mascotas[p.mascota].usos - p.usos))}`;
const prestigeHtml = (n, cls = '') => `<span class="prestige-badge ${cls}" title="Prestigio">${tok('lumen', { cls: 'sm' })}<b>${n}</b></span>`;

// Los 6 espacios de El Claro, en corro; cada ingrediente sobre su propio círculo de piedras.
const CLARO_ANG = [-90, -30, 30, 90, 150, 210];

function renderClaro() {
  const t = S.turn;
  const pick = isMyTurn() && t && t.paso === 'recoger' && !ui.mode;
  const clickable = pick || ui.mode === 'pensar' || (ui.mode === 'chispa' && ui.chispaTipo);
  const pend = me().estudio ? me().estudio.pend : {};
  const claro = S.claro.length ? S.claro : new Array(6).fill(null);
  const slots = claro.map((c, i) => {
    const a = (CLARO_ANG[i] * Math.PI) / 180;
    const pos = `style="left:${50 + 33 * Math.cos(a)}%;top:${50 + 34 * Math.sin(a)}%"`;
    const inner = c ? tok(c, { cls: 'xxl' }) : '';
    if (!c) return `<span class="cslot empty" ${pos}></span>`;
    const on = ui.sel.includes(i);
    const hint = ui.mode === 'pensar' && !(pend[c] > 0) ? 'dim' : '';
    return clickable ? `<button class="cslot live ${on ? 'on' : ''} ${hint}" data-a="claro" data-v="${i}" ${pos} title="${N(c)}">${inner}</button>`
      : `<span class="cslot" ${pos} title="${N(c)}">${inner}</span>`;
  }).join('');
  $('claro').innerHTML = `<div class="ring">${slots}<span class="bag-pill" title="Ingredientes en la bolsa">👜 ${sum(S.bolsa)}</span></div>`;
}

function studyHtml(p, t) {
  if (!p.estudio) {
    return `<div class="study-mini empty">${canPickCard() ? '← Elige un conocimiento' : 'Sin receta'}</div>`;
  }
  const c = D.cartas[p.estudio.card];
  const slots = [];
  for (const k of ING()) {
    for (let j = 0; j < (c.req[k] || 0); j += 1) slots.push(j < p.estudio.placed[k] ? tok(k) : emptyTok(k));
  }
  const canAbandon = isMyTurn() && t.paso === 'estudiar' && !t.tocado && t.estudiadas === 0;
  return `<div class="study-mini ${c.tipo}" title="${esc(c.texto)}">
      ${cardIcon(p.estudio.card, 'md')}
      <div class="study-body">
        <div class="study-name">${kindIcon(c.tipo, 'xs')}<b>${esc(c.nombre)}</b>${prestigeHtml(c.puntos, 'sm')}</div>
        <div class="recipe-slots">${slots.join('')}</div>
      </div>
      ${canAbandon ? '<button class="btn tiny ghost dark" data-a="abandonar" title="Abandonar receta">✕</button>' : ''}
    </div>`;
}

function renderMesa() {
  const p = me();
  const t = S.turn;
  const pet = D.mascotas[p.mascota];
  const click = resClickable();
  const petOn = ui.mode === 'liebre' || ui.mode === 'lechuza' || ui.mode === 'cerv' || ui.zorro;
  const ings = ING().map((k) => {
    const tk = tok(k, { cls: 'xl', n: p.reserva[k] });
    return `<span class="ing-col ${p.reserva[k] ? '' : 'none'}" title="${N(k)}">${click && p.reserva[k] ? `<button class="tokbtn" data-a="res" data-v="${k}">${tk}</button>` : tk}</span>`;
  }).join('');
  // Todos los hechizos y pociones: lo que aún no tienes, en gris y tenue.
  const ids = (tipo) => Object.keys(D.cartas).filter((id) => D.cartas[id].tipo === tipo);
  const spells = ['chispa', 'burbuja', ...ids('hechizo')].map((id) => {
    const c = card(id);
    const known = !D.cartas[id] || p.aprendidas.includes(id);
    const live = known && id !== 'burbuja' && !c.ataque && canCast(id);
    return `<button class="spell-ico ${c.ataque ? 'attack' : ''} ${live ? 'live' : ''} ${known ? '' : 'locked'}" ${live ? `data-a="cast" data-v="${id}"` : 'disabled'}
      title="${esc(c.nombre)}${known ? '' : ' (sin aprender)'}: ${esc(c.texto)}">${cardIcon(id, 'md')}</button>`;
  }).join('');
  const potions = ids('pocion').map((id) => {
    const c = D.cartas[id];
    const ready = p.pociones.includes(id);
    const known = p.aprendidas.includes(id);
    const live = ready && !c.ataque && canCast(id);
    const prep = !ready && canPrepare(id);
    const state = ready ? '' : known ? 'unready' : 'locked';
    const what = ready ? 'preparada' : known ? 'sin preparar' : 'sin aprender';
    return `<button class="spell-ico potion ${c.ataque ? 'attack' : ''} ${live || prep ? 'live' : ''} ${state}" ${live ? `data-a="cast" data-v="${id}"` : prep ? `data-a="prep" data-v="${id}"` : 'disabled'}
      title="${esc(c.nombre)} (${what}${prep ? ': pulsa para prepararla' : ''}): ${esc(c.texto)}">${cardIcon(id, 'md')}${prep ? `<span class="prep-cost">${costHtml(c.coste)}</span>` : ''}</button>`;
  }).join('');
  $('mesa').innerHTML = `
    <div class="m-hero">
      ${druidPortrait(p.druida, 'hero')}
      <div class="m-pet-pic" title="${esc(pet.nombre)}: ${esc(pet.texto)}">${petPortrait(p.mascota, 'free')}</div>
      <div class="m-name-row"><b class="m-name">${esc(p.name)}</b>${prestigeHtml(p.puntos)}</div>
    </div>
    <div class="m-row">
      <button class="skill ${petOn ? 'on' : ''} ${petUsable() ? 'live' : ''}" data-a="habilidad" ${petUsable() ? '' : 'disabled'} title="${esc(pet.nombre)}: ${esc(pet.texto)}">
        ${esc(pet.don)} <span class="usos">${usosHtml(p)}</span></button>
      <span class="magic ${p.magiaLibre ? 'on' : ''}" title="${p.magiaLibre ? 'Te queda la magia de este turno' : 'Ya has usado tu magia en este turno'}">✦ ${p.magiaLibre ? 'magia' : 'usada'}</span>${p.dormido ? ' 💤' : ''}
    </div>
    <section><h4 title="Al final de tu turno, como máximo ${D.limiteReserva}">Reserva ${sum(p.reserva)}/${D.limiteReserva}</h4><div class="ing-row">${ings}</div></section>
    <section><h4>En estudio</h4>${studyHtml(p, t)}</section>
    <section class="m-magic"><div class="spell-row">${spells}</div><div class="spell-row">${potions}</div></section>`;
}

function renderRivals() {
  const rivals = S.players.filter((p) => p.id !== S.me);
  $('rivals').innerHTML = '<h2 class="ptitle">Rivales</h2>' + rivals.map((p) => {
    const active = S.turn && S.turn.pid === p.id;
    const learned = p.aprendidas.map((id) => `<span class="learned ${D.cartas[id].ataque ? 'attack' : ''}" title="${esc(D.cartas[id].nombre)}${p.pociones.includes(id) ? ' (preparada)' : ''}: ${esc(D.cartas[id].texto)}">
      ${cardIcon(id, 'sm')}${p.pociones.includes(id) ? kindIcon('pocion', 'badge') : ''}</span>`).join('');
    const study = p.estudio
      ? `<span class="r-study" title="Estudiando ${esc(D.cartas[p.estudio.card].nombre)}">${cardIcon(p.estudio.card, 'xs')}${cardSlots(p.estudio)}</span>`
      : '';
    const status = `${p.magiaLibre ? '✦' : '<span class="muted">✦</span>'}${p.connected || p.bot ? '' : ' · desconectado'}${S.startId === p.id ? ' · 1º' : ''}`;
    return `<div class="rival ${active ? 'active' : ''}">
      <div class="r-head">
        ${druidPortrait(p.druida, 'rsm')}
        <span class="r-pet" title="${esc(D.mascotas[p.mascota].nombre)}: ${esc(D.mascotas[p.mascota].texto)}">${petPortrait(p.mascota, 'free')}</span>
        <div class="r-who"><b>${esc(p.name)}</b>
          <span class="r-sub"><span class="usos">${usosHtml(p)}</span> <span title="Magia de este turno">${status}</span></span></div>
        ${prestigeHtml(p.puntos)}
      </div>
      <div class="reserve sm" title="Reserva">${reserveHtml(p)}</div>
      ${study}
      ${learned ? `<div class="r-learned">${learned}</div>` : ''}
    </div>`;
  }).join('');
}

function cardSlots(st) {
  const c = D.cartas[st.card];
  const out = [];
  for (const t of ING()) for (let k = 0; k < (c.req[t] || 0); k += 1) out.push(k < st.placed[t] ? tok(t, { cls: 'xs' }) : emptyTok(t, 'xs'));
  return out.join('');
}

function renderLog() {
  const j = $('journal');
  j.classList.toggle('hidden', !ui.logOpen);
  if (!S) return;
  const last = S.log.length ? S.log[S.log.length - 1].n : -1;
  if (last !== ui.lastLog) {
    $('log').innerHTML = S.log.map((l) => `<p class="${l.text.startsWith('—') ? 'turn' : ''}">${esc(l.text)}</p>`).join('');
    $('log').scrollTop = $('log').scrollHeight;
    // Avisos de lo que hacen los demás.
    if (ui.lastLog >= 0) {
      const fresh = S.log.filter((l) => l.n > ui.lastLog && /^[⚡🫧✦💤]/u.test(l.text));
      if (fresh.length) toast(fresh[fresh.length - 1].text);
    }
    ui.lastLog = last;
  }
}

// ------------------------------------------------------------ ventanas

function picker(field, values, current, { multi = false } = {}) {
  return values.map((v, i) => {
    const on = multi ? false : current === v.value;
    return `<button class="pick ${on ? 'on' : ''}" data-a="${multi ? 'mAdd' : 'm'}" data-f="${field}" data-v="${esc(v.value)}" data-i="${i}">${v.html}</button>`;
  }).join('') || '<span class="muted small">nada disponible</span>';
}

// Ingredientes de mi reserva disponibles (descontando lo ya elegido y un coste).
function freeRes(minus = []) {
  const r = { ...me().reserva };
  for (const t of minus) if (t) r[t] -= 1;
  return r;
}
const resValues = (r, filter = () => true) => ING().filter((t) => r[t] > 0 && filter(t)).map((t) => ({ value: t, html: tok(t, { n: r[t] }) }));

function renderModal() {
  const m = ui.modal;
  const el = $('modal');
  if (!m) {
    el.classList.add('hidden');
    el.innerHTML = '';
    return;
  }
  el.classList.remove('hidden');
  let body = '';
  let ok = '';
  const p = me();
  const pend = p && p.estudio ? p.estudio.pend : {};
  if (m.kind === 'rules') {
    body = rulesHtml();
  } else if (m.kind === 'info') {
    const known = p.aprendidas.includes(m.id);
    const can = canPickCard() && !known && S.catalogo[m.id] > 0;
    body = cardHtml(m.id, { cls: 'big', footer: `<div class="kfoot"><span class="muted small">${S.catalogo[m.id] || 0} copias en el catálogo</span>${known ? '<span class="tag ok">aprendido</span>' : ''}</div>` });
    ok = can ? 'Estudiar este conocimiento' : '';
  } else if (m.kind === 'final') {
    const rank = [...S.players].sort((a, b) => b.puntos - a.puntos);
    body = `<h2 class="ptitle">${S.winners.length > 1 ? 'Victoria compartida' : `¡${esc(pl(S.winners[0]).name)} gana!`}</h2>
      <ol class="final">${rank.map((x) => `<li>${druidPortrait(x.druida, 'sm')} <b>${esc(x.name)}</b> — ${x.puntos} de Prestigio
        <div class="small muted">${x.aprendidas.map((id) => esc(card(id).nombre)).join(', ') || 'nada aprendido'}</div></li>`).join('')}</ol>`;
    ok = 'Nueva partida';
  } else if (m.kind === 'memoria') {
    const r = freeRes(m.list);
    const left = { ...pend };
    for (const t of m.list) left[t] -= 1;
    body = `<h3>Memoria</h3><p>Coloca hasta 2 ingredientes de tu reserva que encajen en tu receta.</p>
      <div class="picked">${m.list.map((t, i) => `<button class="pick on" data-a="mDel" data-f="list" data-i="${i}">${tok(t)}</button>`).join('') || '<span class="muted">—</span>'}</div>
      ${m.list.length < 2 ? `<div class="picks">${picker('list', resValues(r, (t) => left[t] > 0), null, { multi: true })}</div>` : ''}`;
    ok = m.list.length ? 'Beber Memoria' : '';
  } else if (m.kind === 'cambio') {
    const left = { ...pend };
    if (m.wComo) left[m.wComo] -= 1;
    if (m.match) left[m.match] -= 1;
    const pendValues = ING().filter((t) => pend[t] > 0 && (t === m.wComo || left[t] > 0)).map((t) => ({ value: t, html: emptyTok(t) }));
    body = `<h3>Cambio <span class="small">(paga ${tok('eter', { cls: 'xs' })})</span></h3>
      <p>Coloca hasta 2 ingredientes en tu receta. Uno puede ser comodín.</p>
      <h4>Comodín (opcional): este ingrediente…</h4><div class="picks">${picker('wTipo', resValues(freeRes(['eter', m.match]), (t) => true), m.wTipo)}</div>
      <h4>…ocupa este espacio</h4><div class="picks">${picker('wComo', pendValues, m.wComo)}</div>
      <h4>Ingrediente que coincide (opcional)</h4><div class="picks">${picker('match', resValues(freeRes(['eter', m.wTipo]), (t) => (pend[t] || 0) - (m.wComo === t ? 1 : 0) > 0), m.match)}</div>`;
    ok = (m.wTipo && m.wComo) || m.match ? 'Lanzar Cambio' : '';
  } else if (m.kind === 'suerte') {
    const need = Math.min(3, S.claro.filter(Boolean).length);
    const slots = S.claro.map((c, i) => (c ? `<button class="pick ${m.slots.includes(i) ? 'on' : ''}" data-a="mSlot" data-v="${i}">${tok(c)}</button>` : '')).join('');
    const after = { ...p.reserva };
    for (const i of m.slots) after[S.claro[i]] += 1;
    body = `<h3>Suerte</h3><p>Recoge ${need} ingredientes de El Claro (${m.slots.length}/${need}).</p>
      <div class="picks">${slots}</div>
      ${p.estudio ? `<h4>Después, coloca uno en tu receta (opcional)</h4><div class="picks">${picker('colocar', resValues(after, (t) => pend[t] > 0), m.colocar)}</div>` : ''}`;
    ok = m.slots.length === need ? 'Beber Suerte' : '';
  } else if (m.kind === 'robo') {
    const target = pl(S.turn.pid);
    body = `<h3>Robo <span class="small">(paga ${tok('umbra', { cls: 'xs' })})</span></h3><p>Elige qué ingrediente robas a ${esc(target.name)}.</p>
      <div class="picks">${picker('tipo', resValues(target.reserva), m.tipo)}</div>
      ${m.tipo && pend[m.tipo] > 0 ? `<label class="check"><input type="checkbox" data-a="mCheck" data-f="colocar" ${m.colocar ? 'checked' : ''}> Colocarlo directamente en mi receta</label>` : ''}`;
    ok = m.tipo ? 'Lanzar Robo' : '';
  } else if (m.kind === 'lio') {
    const target = pl(S.turn.pid);
    const swaps = S.lio.map((s, i) => ({ value: String(i), html: `<span class="swap">${tok(s.tipo, { cls: 'sm' })} ⇄ ${tok(S.claro[s.slot], { cls: 'sm' })}</span>` }));
    const r = freeRes(['umbra']);
    body = `<h3>Lío <span class="small">(paga ${tok('umbra', { cls: 'xs' })})</span></h3>
      <p>Cambia un ingrediente que ${esc(target.name)} necesita (izquierda) por uno de El Claro que no le sirve (derecha).</p>
      <div class="picks">${picker('swap', swaps, m.swap)}</div>
      ${p.estudio ? `<h4>Si no te bloquean: coloca uno de tu reserva como comodín (opcional)</h4>
        <div class="picks">${picker('bTipo', resValues(r), m.bTipo)}</div>
        ${m.bTipo ? `<h4>…en este espacio</h4><div class="picks">${picker('bComo', ING().filter((t) => pend[t] > 0).map((t) => ({ value: t, html: emptyTok(t) })), m.bComo)}</div>` : ''}` : ''}`;
    ok = m.swap !== null && (!m.bTipo || m.bComo) ? 'Lanzar Lío' : '';
  } else if (m.kind === 'sueno') {
    body = `<h3>Sueño</h3><p>${esc(pl(S.turn.pid).name)} solo podrá colocar 1 ingrediente en su estudio.</p>
      ${p.estudio ? `<h4>Si no te bloquean: coloca un ingrediente válido de tu reserva (opcional)</h4>
      <div class="picks">${picker('bTipo', resValues(p.reserva, (t) => pend[t] > 0), m.bTipo)}</div>` : ''}`;
    ok = 'Beber Sueño';
  } else if (m.kind === 'liebre') {
    body = `<h3>🐇 Liebre</h3><p>Tu ${N(m.tipo)} contará como…</p>
      <div class="picks">${picker('como', ING().filter((t) => t !== m.tipo && pend[t] > 0).map((t) => ({ value: t, html: emptyTok(t) })), m.como)}</div>`;
    ok = m.como ? 'Transformar y colocar' : '';
  } else if (m.kind === 'descartar') {
    const extra = sum(p.reserva) - D.limiteReserva;
    const rows = ING().filter((t) => p.reserva[t] > 0).map((t) => `<div class="drow">${tok(t, { n: p.reserva[t] })}
      <button class="btn tiny" data-a="dMinus" data-v="${t}">−</button><b>${m.ings[t]}</b><button class="btn tiny" data-a="dPlus" data-v="${t}">+</button></div>`).join('');
    body = `<h3>Devolver a la bolsa</h3><p>Al final del turno solo puedes conservar ${D.limiteReserva}. Devuelve ${extra} (${sum(m.ings)}/${extra}).</p>${rows}`;
    ok = sum(m.ings) === extra ? 'Devolver' : '';
  }
  const closable = m.kind !== 'descartar';
  el.innerHTML = `<div class="modal-card ${{ rules: 'book-card', info: 'framed', final: 'scroll-card' }[m.kind] || ''}">
    ${closable ? '<button class="modal-close" data-a="closeModal" aria-label="Cerrar">×</button>' : ''}
    ${body}
    ${ok ? `<div class="row end"><button class="btn primary" data-a="mOk">${ok}</button></div>` : ''}
  </div>`;
}

function modalOk() {
  const m = ui.modal;
  const close = () => { ui.modal = null; renderModal(); };
  if (m.kind === 'info') return send('elegir', { carta: m.id }, close);
  if (m.kind === 'final') return H.leave();
  if (m.kind === 'memoria') return send('magia', { carta: 'memoria', colocar: m.list.map((t) => ({ tipo: t })) }, close);
  if (m.kind === 'cambio') {
    const list = [];
    if (m.wTipo && m.wComo) list.push({ tipo: m.wTipo, como: m.wComo });
    if (m.match) list.push({ tipo: m.match });
    return send('magia', { carta: 'cambio', colocar: list }, close);
  }
  if (m.kind === 'suerte') return send('magia', { carta: 'suerte', slots: m.slots, colocar: m.colocar }, close);
  if (m.kind === 'robo') return send('atacar', { carta: 'robo', tipo: m.tipo, colocar: !!m.colocar }, close);
  if (m.kind === 'lio') {
    const s = S.lio[Number(m.swap)];
    return send('atacar', { carta: 'lio', tipo: s.tipo, slot: s.slot, bonus: m.bTipo ? { tipo: m.bTipo, como: m.bComo } : null }, close);
  }
  if (m.kind === 'sueno') return send('atacar', { carta: 'sueno', bonus: m.bTipo ? { tipo: m.bTipo } : null }, close);
  if (m.kind === 'liebre') return send('colocar', { tipo: m.tipo, como: m.como }, () => { ui.mode = null; close(); });
  if (m.kind === 'descartar') return send('descartar', { ings: m.ings }, close);
  return close();
}

function rulesHtml() {
  const knowledge = ['chispa', 'burbuja', ...Object.keys(D.cartas)].map((id) => {
    const c = card(id);
    const req = c.req ? ING().map((t) => tok(t, { cls: 'xs' }).repeat(c.req[t] || 0)).join('') : '<i>inicial</i>';
    return `<div class="rule-card ${c.ataque ? 'attack' : ''}">${cardIcon(id, 'md')}
      <div><b>${esc(c.nombre)}</b> <span class="small muted">${c.tipo === 'pocion' ? 'poción' : 'hechizo'}${c.ataque ? ' · ataque' : ''}${c.puntos ? ` · ${c.puntos} pts` : ''}</span>
        <div class="small">Aprender: ${req} · ${c.tipo === 'pocion' ? 'Preparar' : 'Usar'}: ${costHtml(c.coste)}</div>
        <div class="small">${esc(c.texto)}</div></div></div>`;
  }).join('');
  const pets = Object.values(D.mascotas).map((m) => `<li><b>${esc(m.nombre)}</b> (${m.usos} ${m.usos > 1 ? 'usos' : 'uso'}): ${esc(m.texto)}</li>`).join('');
  return `<div class="book">
    <section class="page left">
      <h2 class="ptitle">Cómo se juega</h2>
      <p>Gana quien tenga más <b>Prestigio</b> al terminar la ronda ${D.rondas}. Solo se consigue aprendiendo conocimientos (3 o 4 puntos).</p>
      <h3>Tu turno</h3>
      <ol><li><b>Recoger:</b> 3 ingredientes de El Claro (se rellena desde la bolsa).</li>
        <li><b>Ataques:</b> los rivales pueden lanzarte <i>un</i> ataque. Te defiendes con Burbuja (2 Lumen).</li>
        <li><b>Estudiar:</b> una sola receta a la vez; coloca hasta 2 ingredientes que encajen. Al completarla la aprendes y los ingredientes vuelven a la bolsa. Una poción recién aprendida viene preparada gratis.</li>
        <li><b>Preparar:</b> 1 poción conocida pagando su coste (máx. 2 preparadas, distintas).</li>
        <li>Al final del turno conservas como máximo ${D.limiteReserva} ingredientes.</li></ol>
      <h3>Magia</h3>
      <p>Un efecto mágico por jugador <b>en el turno de cada jugador</b>, también en el tuyo. Chispa es gratis, una vez en tu turno, y no gasta tu magia. Los hechizos se aprenden para siempre; cada poción preparada sirve una vez.</p>
      <h3>Mascotas</h3><ul>${pets}</ul>
    </section>
    <section class="page right">
      <h2 class="ptitle">Conocimientos</h2>
      ${knowledge}
    </section>
  </div>`;
}

// ------------------------------------------------------------ eventos

const H = {
  druida: (v) => send('configurar', { druida: v }),
  mascota: (v) => send('configurar', { mascota: v }),
  bot: () => send('bot'),
  start: () => send('empezar'),
  kick: (v) => send('expulsar', { id: v }),
  copy: () => {
    const i = $('shareLink');
    i.select();
    navigator.clipboard?.writeText(i.value).then(() => toast('Enlace copiado'), () => {});
  },
  leave: () => {
    saveSession(null);
    location.href = location.pathname;
  },
  info: (v) => { ui.modal = { kind: 'info', id: v }; renderModal(); },
  showFinal: () => { ui.modal = { kind: 'final' }; renderModal(); },
  habilidad: () => {
    const p = me();
    if (p.mascota === 'zorro') {
      ui.zorro = !ui.zorro;
      ui.sel = ui.sel.slice(0, recogerNeed());
      return render();
    }
    H.mode({ liebre: 'liebre', lechuza: 'lechuza', cervatillo: 'cerv' }[p.mascota]);
  },
  home: () => {
    ui.home = true;
    showHome();
  },
  back: () => {
    ui.home = false;
    render();
  },
  claro: (v) => {
    const i = Number(v);
    if (ui.mode === 'chispa' && ui.chispaTipo) {
      return send('magia', { carta: 'chispa', tipo: ui.chispaTipo, slot: i }, () => { ui.mode = null; ui.chispaTipo = null; render(); });
    }
    if (ui.mode === 'pensar') return send('magia', { carta: 'pensar', slot: i }, () => { ui.mode = null; render(); });
    if (ui.sel.includes(i)) ui.sel = ui.sel.filter((x) => x !== i);
    else if (ui.sel.length < recogerNeed()) ui.sel.push(i);
    render();
  },
  recoger: () => send('recoger', { slots: ui.sel, zorro: ui.zorro }),
  res: (v) => {
    if (ui.mode === 'chispa') { ui.chispaTipo = v; return render(); }
    if (ui.mode === 'liebre') { ui.modal = { kind: 'liebre', tipo: v, como: null }; return render(); }
    if (ui.mode === 'lechuza') return send('lechuza', { tipo: v }, () => { ui.mode = null; render(); });
    if (ui.mode === 'cerv') return send('cervatillo', { tipo: v }, () => { ui.mode = null; render(); });
    send('colocar', { tipo: v });
  },
  mode: (v) => {
    ui.mode = ui.mode === v ? null : v;
    ui.chispaTipo = null;
    render();
  },
  cancelMode: () => { ui.mode = null; ui.chispaTipo = null; render(); },
  elegir: (v) => send('elegir', { carta: v }),
  abandonar: () => { if (confirm('¿Abandonar la receta? Los ingredientes colocados vuelven a la bolsa.')) send('abandonar'); },
  finEstudio: () => send('fin_estudio'),
  finTurno: () => send('fin_turno'),
  openDescartar: () => { ui.modal = { kind: 'descartar', ings: { eter: 0, umbra: 0, lumen: 0, raiz: 0 } }; render(); },
  prep: (v) => send('preparar', { carta: v }),
  cast: (v) => {
    if (v === 'chispa') { ui.mode = 'chispa'; ui.chispaTipo = null; return render(); }
    if (v === 'pensar') { ui.mode = 'pensar'; return render(); }
    if (v === 'idea') return send('magia', { carta: 'idea' });
    if (v === 'memoria') ui.modal = { kind: 'memoria', list: [] };
    if (v === 'cambio') ui.modal = { kind: 'cambio', wTipo: null, wComo: null, match: null };
    if (v === 'suerte') ui.modal = { kind: 'suerte', slots: [], colocar: null };
    render();
  },
  atacar: (v) => {
    if (v === 'robo') ui.modal = { kind: 'robo', tipo: null, colocar: true };
    if (v === 'lio') ui.modal = { kind: 'lio', swap: S.lio.length === 1 ? '0' : null, bTipo: null, bComo: null };
    if (v === 'sueno') ui.modal = { kind: 'sueno', bTipo: null };
    render();
  },
  pasar: () => send('pasar'),
  defender: () => send('defender'),
  noDefender: () => send('no_defender'),
  closeModal: () => { ui.modal = null; renderModal(); },
  closeLog: () => { ui.logOpen = false; renderLog(); },
  m: (v, el) => {
    const f = el.dataset.f;
    ui.modal[f] = ui.modal[f] === v ? null : v;
    if (f === 'bTipo' && !ui.modal.bTipo) ui.modal.bComo = null;
    if (f === 'bTipo' && ui.modal.bTipo && me().estudio && me().estudio.pend[v] > 0) ui.modal.bComo = v;
    renderModal();
  },
  mAdd: (v, el) => { ui.modal[el.dataset.f].push(v); renderModal(); },
  mDel: (v, el) => { ui.modal[el.dataset.f].splice(Number(el.dataset.i), 1); renderModal(); },
  mSlot: (v) => {
    const m = ui.modal;
    const i = Number(v);
    const need = Math.min(3, S.claro.filter(Boolean).length);
    if (m.slots.includes(i)) m.slots = m.slots.filter((x) => x !== i);
    else if (m.slots.length < need) m.slots.push(i);
    m.colocar = null;
    renderModal();
  },
  mOk: () => modalOk(),
  dPlus: (v) => {
    const m = ui.modal;
    const extra = sum(me().reserva) - D.limiteReserva;
    if (m.ings[v] < me().reserva[v] && sum(m.ings) < extra) m.ings[v] += 1;
    renderModal();
  },
  dMinus: (v) => { if (ui.modal.ings[v] > 0) ui.modal.ings[v] -= 1; renderModal(); },
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const fn = H[el.dataset.a];
  if (fn) {
    e.preventDefault();
    fn(el.dataset.v, el);
  }
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-a="mCheck"]');
  if (el && ui.modal) ui.modal[el.dataset.f] = el.checked;
});
$('modal').addEventListener('click', (e) => {
  if (e.target === $('modal') && ui.modal && ui.modal.kind !== 'descartar') { ui.modal = null; renderModal(); }
});

function closeMenu() {
  $('menu').classList.add('hidden');
  $('menuBtn').setAttribute('aria-expanded', 'false');
}
$('menuBtn').onclick = (e) => {
  e.stopPropagation();
  const open = $('menu').classList.toggle('hidden');
  $('menuBtn').setAttribute('aria-expanded', String(!open));
};
document.addEventListener('click', (e) => { if (!e.target.closest('#menuBtn')) closeMenu(); }, true);

$('rulesBtn').onclick = () => {
  if (!D) return;
  ui.modal = { kind: 'rules' };
  renderModal();
};
$('logBtn').onclick = () => { ui.logOpen = !ui.logOpen; renderLog(); };
$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const text = $('chatInput').value.trim();
  if (text) socket.emit('chat', { text });
  $('chatInput').value = '';
};
socket.on('chat', (m) => {
  const p = document.createElement('p');
  p.className = 'chat';
  p.innerHTML = `<b>${esc(m.from)}:</b> ${esc(m.text)}`;
  $('log').appendChild(p);
  $('log').scrollTop = $('log').scrollHeight;
  if (!ui.logOpen) toast(`${m.from}: ${m.text}`);
});

// ------------------------------------------------------------ portada y conexión

function showHome() {
  $('app').classList.add('hidden');
  $('home').classList.remove('hidden');
  $('homeBtn').classList.add('hidden');
  $('roundPill').classList.add('hidden');
  $('prompt').classList.add('hidden');
  $('logBtn').classList.add('hidden');
  $('sub').textContent = 'El bosque de los druidas';
  const sess = S && loadSession();
  $('backRow').innerHTML = sess ? `<button class="btn green" data-a="back">Volver a la partida ${esc(sess.code)}</button>` : '';
  const code = new URLSearchParams(location.search).get('sala');
  if (code) $('codeInput').value = code.toUpperCase();
  try { $('nameInput').value = localStorage.getItem('druidas.name') || ''; } catch { /* sin almacenamiento */ }
}

function enter(r) {
  if (!r || !r.ok) {
    $('homeError').textContent = (r && r.error) || 'No se pudo conectar';
    return false;
  }
  ui.home = false;
  saveSession({ code: r.code, token: r.token });
  history.replaceState(null, '', `?sala=${r.code}`);
  return true;
}

function myName() {
  const n = $('nameInput').value.trim();
  try { localStorage.setItem('druidas.name', n); } catch { /* sin almacenamiento */ }
  return n;
}

$('createBtn').onclick = () => socket.emit('create', { name: myName() }, enter);
$('joinBtn').onclick = () => {
  const code = $('codeInput').value.trim().toUpperCase();
  if (code.length !== 4) return void ($('homeError').textContent = 'Escribe el código de 4 letras');
  socket.emit('join', { code, name: myName() }, enter);
};
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });

socket.on('state', (st) => {
  S = st;
  receivedAt = Date.now();
  render();
});
socket.on('kicked', () => {
  saveSession(null);
  S = null;
  toast('Te han quitado de la sala');
  showHome();
});
socket.on('connect', () => {
  const sess = loadSession();
  const code = new URLSearchParams(location.search).get('sala');
  if (sess && (!code || code.toUpperCase() === sess.code)) {
    socket.emit('join', { code: sess.code, token: sess.token }, (r) => {
      if (!r.ok) {
        saveSession(null);
        showHome();
      }
    });
  } else if (!S) {
    showHome();
  }
});

setInterval(() => {
  const el = $('timer');
  if (el && S && S.turn && S.turn.restante !== null) el.textContent = `${Math.ceil(remaining() / 1000)} s`;
}, 250);

fetch('/api/datos').then((r) => r.json()).then((d) => {
  D = d;
  document.body.classList.toggle('has-table-art', !!D.img.ui.mesa);
  for (const el of [$('mesa'), $('rivals')]) el.classList.toggle('vertical', !!D.img.ui['mesa-vertical']);
  render();
});
