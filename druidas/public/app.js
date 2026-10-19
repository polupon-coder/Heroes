/* ESCUELA DE MAGIA — cliente web */
'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'druidas.session';

let S = null; // último estado recibido del servidor
let D = null; // tablas del reglamento e ilustraciones disponibles
let receivedAt = 0;
const ui = { key: '', sel: [], zorro: false, mode: null, chispaTipo: null, modal: null, logOpen: false, lastLog: -1 };

const PASO = { recoger: 'Recoger', ventana: 'Ataques', defensa: 'Defensa', estudiar: 'Estudiar', preparar: 'Preparar', descartar: 'Devolver' };
const PET_EMOJI = { lechuza: '🦉', zorro: '🦊', liebre: '🐇', cervatillo: '🦌' };

// Símbolos de los ingredientes (se usan si no hay ilustración).
const SYMBOL = {
  eter: '<path d="M12 12a1.6 1.6 0 0 1 3.2 0a3.2 3.2 0 0 1-6.4 0a4.8 4.8 0 0 1 9.6 0a6.4 6.4 0 0 1-12.8 0"/>',
  umbra: '<path d="M14.5 4.5a7.5 7.5 0 1 0 5 11.5a6 6 0 1 1-5-11.5z"/><path d="M17 7.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  lumen: '<circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6"/>',
  raiz: '<path d="M6 18.5C6 10.5 11 6 18.5 5.5c-.3 7.6-5 12.6-12.5 13z"/><path d="M6 18.5l7.5-7.5"/>',
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

function tok(t, { cls = '', n = null } = {}) {
  const img = D.img.ingredientes[t];
  const inner = img ? `<img src="${img}" alt="">` : `<svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOL[t]}</svg>`;
  return `<span class="tok tok-${t} ${img ? 'has-img' : ''} ${cls}" title="${N(t)}">${inner}${n !== null ? `<b>${n}</b>` : ''}</span>`;
}
const emptyTok = (t) => `<span class="tok slot-empty tok-${t}" title="Falta ${N(t)}"><svg viewBox="0 0 24 24" aria-hidden="true">${SYMBOL[t]}</svg></span>`;

function costHtml(coste) {
  const out = [];
  for (const t of ING()) for (let k = 0; k < (coste[t] || 0); k += 1) out.push(tok(t, { cls: 'xs' }));
  return out.join('') || '<span class="free">gratis</span>';
}

function druidPortrait(id, cls = '') {
  const info = D.druidas[id];
  if (!info) return '';
  const img = D.img.druidas[id];
  if (img) return `<span class="portrait ${cls}"><img src="${img}" alt="${esc(info.nombre)}"></span>`;
  return `<span class="portrait ph ${cls}" style="--c:${info.hex}" title="${esc(info.nombre)}"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="15" r="8"/><path d="M6 38c1-9 7-14 14-14s13 5 14 14z"/></svg></span>`;
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
    <div class="kind">${kind}${c.ataque ? ' · ataque' : ''}${prepared ? ' · <b class="ready">preparada</b>' : ''}</div>
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
  if (!S || !D) return;
  $('home').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('roomInfo').innerHTML = `Sala <code>${esc(S.code)}</code>`;
  $('logBtn').classList.toggle('hidden', S.phase === 'lobby');
  const key = S.turn ? `${S.round}|${S.turn.pid}|${S.turn.paso}` : S.phase;
  if (key !== ui.key) {
    ui.key = key;
    ui.sel = [];
    ui.zorro = false;
    ui.mode = null;
    ui.chispaTipo = null;
    if (ui.modal && !['rules'].includes(ui.modal.kind)) ui.modal = null;
  }
  if (S.phase === 'lobby') {
    $('lobby').classList.remove('hidden');
    $('table').classList.add('hidden');
    renderLobby();
  } else {
    $('lobby').classList.add('hidden');
    $('table').classList.remove('hidden');
    renderStatus();
    renderPrompt();
    renderClaro();
    renderCatalog();
    renderMine();
    renderRivals();
    if (isMyTurn() && S.turn.paso === 'descartar' && (!ui.modal || ui.modal.kind !== 'descartar')) {
      ui.modal = { kind: 'descartar', ings: { eter: 0, umbra: 0, lumen: 0, raiz: 0 } };
    }
  }
  renderLog();
  renderModal();
}

function renderStatus() {
  if (S.phase === 'fin') {
    $('status').textContent = 'Fin del aprendizaje';
    return;
  }
  const a = pl(S.turn.pid);
  $('status').innerHTML = `Ronda <b>${S.round}</b>/${S.rondas} · Turno de <b>${esc(a.name)}</b> · ${PASO[S.turn.paso]}`;
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
      ${druidPortrait(id, 'lg')}<span>${esc(d.nombre)}</span><small>ropa ${esc(d.ropa)}</small>
    </button>`).join('');
  const pets = Object.entries(D.mascotas).map(([id, m]) => `
    <button class="choice pet ${p.mascota === id ? 'on' : ''}" data-a="mascota" data-v="${id}" ${taken('mascota', id) ? 'disabled' : ''}>
      ${petPortrait(id, 'lg')}<span>${esc(m.nombre)} · ${esc(m.don)}</span><small>${esc(m.texto)} (${m.usos} ${m.usos > 1 ? 'usos' : 'uso'})</small>
    </button>`).join('');
  const list = S.players.map((x) => `
    <li>${druidPortrait(x.druida, 'sm')} ${petPortrait(x.mascota, 'sm')} <b>${esc(x.name)}</b>
      ${x.id === S.hostId ? '<span class="tag">anfitrión</span>' : ''}${x.connected || x.bot ? '' : '<span class="tag off">desconectado</span>'}
      ${host && x.id !== S.me ? `<button class="btn tiny ghost" data-a="kick" data-v="${x.id}">Quitar</button>` : ''}</li>`).join('');
  $('lobby').innerHTML = `
    <div class="lobby">
      <div class="panel lobby-side">
        <h2>Sala <span class="code-big">${esc(S.code)}</span></h2>
        <p class="small">Comparte este enlace con tus amigos:</p>
        <div class="share"><input class="input" readonly value="${esc(link)}" id="shareLink"><button class="btn small" data-a="copy">Copiar</button></div>
        <h3>Aprendices (${S.players.length}/4)</h3>
        <ul class="plist">${list}</ul>
        ${host ? `<div class="row">
            <button class="btn" data-a="bot" ${S.players.length >= 4 ? 'disabled' : ''}>+ Añadir bot</button>
            <button class="btn primary" data-a="start" ${S.players.length < 2 ? 'disabled' : ''}>Empezar</button>
          </div>${S.players.length < 2 ? '<p class="muted small">Hacen falta al menos 2 druidas.</p>' : ''}`
    : '<p class="muted">El anfitrión empezará la partida.</p>'}
      </div>
      <div class="panel lobby-main">
        <h3>Tu druida</h3>
        <p class="muted small">Todos funcionan igual: el aspecto no da ventajas.</p>
        <div class="choices">${druids}</div>
        <h3>Tu animal del bosque</h3>
        <div class="choices">${pets}</div>
      </div>
    </div>`;
}

function renderPrompt() {
  const el = $('prompt');
  if (S.phase === 'fin') {
    const rank = [...S.players].sort((a, b) => b.puntos - a.puntos);
    el.innerHTML = `<div class="final">
      <h2>${S.winners.length > 1 ? 'Victoria compartida' : `¡${esc(pl(S.winners[0]).name)} gana!`}</h2>
      <ol>${rank.map((p) => `<li>${druidPortrait(p.druida, 'sm')} <b>${esc(p.name)}</b> — ${p.puntos} de Prestigio
        <span class="muted small">(${p.aprendidas.map((id) => esc(card(id).nombre)).join(', ') || 'nada aprendido'})</span></li>`).join('')}</ol>
      <button class="btn primary" data-a="leave">Nueva partida</button></div>`;
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
      msg = `<b>Fase 1 · Recoger.</b> Elige ${need} ingredientes de El Claro (${ui.sel.length}/${need}).`;
      if (p.mascota === 'zorro' && p.usos > 0) btns += `<button class="btn ${ui.zorro ? 'on' : ''}" data-a="zorro">🦊 Zorro: recoger 5 (${p.usos})</button>`;
      btns += `<button class="btn primary" data-a="recoger" ${ui.sel.length === need ? '' : 'disabled'}>Recoger</button>`;
    } else if (t.paso === 'ventana') {
      msg = `Tus rivales deciden si te atacan…${timerHtml()}`;
    } else if (t.paso === 'defensa') {
      msg = `<b>¡${esc(pl(t.ataque.from).name)} te ataca con ${esc(card(t.ataque.carta).nombre)}!</b> ${attackDesc(t.ataque)}${timerHtml()}`;
      btns = `<button class="btn primary" data-a="defender" ${p.magiaLibre && p.reserva.lumen >= 2 ? '' : 'disabled'}>🫧 Burbuja (${tok('lumen', { cls: 'xs' })}${tok('lumen', { cls: 'xs' })})</button>
        <button class="btn" data-a="noDefender">Aceptar el ataque</button>`;
    } else if (t.paso === 'estudiar') {
      if (!p.estudio && !t.completada) msg = '<b>Fase 2 · Estudiar.</b> Elige un conocimiento del catálogo para estudiarlo.';
      else if (!p.estudio) msg = '<b>Fase 2 · Estudiar.</b> ¡Aprendido! Elegirás nueva receta en tu próximo turno.';
      else if (t.lechuza || t.estudiadas >= t.limite) msg = '<b>Fase 2 · Estudiar.</b> Has terminado tu estudio normal.';
      else msg = `<b>Fase 2 · Estudiar.</b> Pulsa ingredientes de tu reserva para colocarlos (${t.estudiadas}/${t.limite}${S.turn.limite === 1 ? ' 💤' : ''}).`;
      if (ui.mode === 'liebre') msg = '🐇 Pulsa el ingrediente de tu reserva que quieres transformar.';
      if (ui.mode === 'lechuza') msg = '🦉 Pulsa el ingrediente de tu reserva que la Lechuza colocará.';
      if (p.estudio && !t.tocado && t.estudiadas === 0) btns += '<button class="btn ghost" data-a="abandonar">Abandonar receta</button>';
      if (p.estudio && p.mascota === 'liebre' && p.usos > 0 && !t.lechuza && t.estudiadas < t.limite) btns += `<button class="btn ${ui.mode === 'liebre' ? 'on' : ''}" data-a="mode" data-v="liebre">🐇 Liebre (${p.usos})</button>`;
      if (p.estudio && p.mascota === 'lechuza' && p.usos > 0 && !t.lechuza) btns += `<button class="btn ${ui.mode === 'lechuza' ? 'on' : ''}" data-a="mode" data-v="lechuza">🦉 Lechuza (${p.usos})</button>`;
      btns += '<button class="btn primary" data-a="finEstudio">Terminar estudio</button>';
    } else if (t.paso === 'preparar') {
      msg = t.preparada ? '<b>Fase 3 · Preparar.</b> Ya has preparado una poción.' : '<b>Fase 3 · Preparar.</b> Puedes preparar 1 poción que conozcas (en tu mesa).';
      btns = '<button class="btn primary" data-a="finTurno">Terminar turno</button>';
    } else if (t.paso === 'descartar') {
      msg = `Tienes más de ${D.limiteReserva} ingredientes: devuelve los que sobran.`;
      btns = '<button class="btn primary" data-a="openDescartar">Elegir</button>';
    }
  } else {
    msg = `Turno de <b>${esc(a.name)}</b> — ${PASO[t.paso]}.`;
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
  if (ui.mode === 'chispa') msg = ui.chispaTipo ? `✧ Chispa: ahora pulsa un ingrediente de El Claro para cambiarlo por ${N(ui.chispaTipo)}.` : '✧ Chispa: pulsa el ingrediente de tu reserva que quieres cambiar.';
  if (ui.mode === 'pensar') msg = '✦ Pensar: pulsa un ingrediente de El Claro que necesite tu receta.';
  if (ui.mode === 'cerv') msg = '🦌 Cervatillo: pulsa el ingrediente de tu reserva que quieres colocar.';
  if (ui.mode) btns += '<button class="btn ghost" data-a="cancelMode">Cancelar</button>';
  if (p.cervatillo && ui.mode !== 'cerv' && magicMoment()) btns += `<button class="btn" data-a="mode" data-v="cerv">🦌 Cervatillo: colocar 1 más</button>`;
  el.className = `prompt ${isMyTurn() || (S.turn.paso === 'ventana' && S.ataques.length && !t.miRespuesta) ? 'mine' : ''}`;
  el.innerHTML = `<div class="msg">${msg}</div><div class="btns">${btns}</div>`;
}

function attackDesc(a) {
  if (a.carta === 'robo') return `Quiere robarte un ${N(a.tipo)}.`;
  if (a.carta === 'lio') return `Quiere cambiar tu ${N(a.tipo)} por ${N(S.claro[a.slot])} de El Claro.`;
  if (a.carta === 'sueno') return 'Solo podrás colocar 1 ingrediente en tu estudio.';
  return '';
}

function renderClaro() {
  const t = S.turn;
  const pick = isMyTurn() && t && t.paso === 'recoger' && !ui.mode;
  const clickable = pick || ui.mode === 'pensar' || (ui.mode === 'chispa' && ui.chispaTipo);
  const pend = me().estudio ? me().estudio.pend : {};
  const slots = (S.claro.length ? S.claro : new Array(6).fill(null)).map((c, i) => {
    if (!c) return '<span class="cslot empty"></span>';
    const on = ui.sel.includes(i);
    const hint = ui.mode === 'pensar' && !(pend[c] > 0) ? 'dim' : '';
    return clickable ? `<button class="cslot ${on ? 'on' : ''} ${hint}" data-a="claro" data-v="${i}">${tok(c, { cls: 'lg' })}</button>`
      : `<span class="cslot">${tok(c, { cls: 'lg' })}</span>`;
  }).join('');
  const bag = ING().map((k) => `${tok(k, { cls: 'xs' })}<span class="small">${S.bolsa[k]}</span>`).join(' ');
  const bg = D.img.ui.claro ? ` style="background-image:url(${D.img.ui.claro})"` : '';
  $('claro').innerHTML = `<h3>El Claro</h3><div class="claro"${bg}>${slots}</div>
    <div class="bag" title="Ingredientes en la bolsa">👜 Bolsa: ${sum(S.bolsa)} &nbsp; ${bag}</div>`;
}

function renderCatalog() {
  const p = me();
  const t = S.turn;
  const canPick = isMyTurn() && t && t.paso === 'estudiar' && !p.estudio && !t.completada;
  const cards = Object.keys(D.cartas).map((id) => {
    const known = p.aprendidas.includes(id);
    const copies = S.catalogo[id] || 0;
    const footer = `<div class="kfoot"><span class="muted small">${copies} en el catálogo</span>
      ${canPick && !known && copies > 0 ? `<button class="btn small primary" data-a="elegir" data-v="${id}">Estudiar</button>` : ''}
      ${known ? '<span class="tag ok">aprendido</span>' : ''}</div>`;
    return cardHtml(id, { footer, cls: `${known ? 'known' : ''} ${canPick && !known ? 'pickable' : ''}` });
  }).join('');
  $('catalog').innerHTML = `<h3>Catálogo de conocimientos</h3><div class="cards">${cards}</div>`;
}

function renderMine() {
  const p = me();
  const t = S.turn;
  const pet = D.mascotas[p.mascota];
  const resClick = !!S.turn && (ui.mode === 'chispa' || ui.mode === 'liebre' || ui.mode === 'lechuza' || ui.mode === 'cerv'
    || (isMyTurn() && t.paso === 'estudiar' && p.estudio && !t.lechuza && t.estudiadas < t.limite));
  const study = p.estudio
    ? cardHtml(p.estudio.card, { estudio: p.estudio, cls: 'studying' })
    : '<div class="empty-study">Sin receta en estudio</div>';
  const spells = ['chispa', 'burbuja', ...p.aprendidas.filter((id) => D.cartas[id].tipo === 'hechizo')].map((id) => {
    const c = card(id);
    const castable = id !== 'burbuja' && !c.ataque && canCast(id);
    return `<div class="spell ${c.ataque ? 'attack' : ''}" title="${esc(c.texto)}">
      <span class="sname">${esc(c.nombre)}</span><span class="scost">${costHtml(c.coste)}</span>
      ${castable ? `<button class="btn tiny primary" data-a="cast" data-v="${id}">Lanzar</button>` : ''}
      <p class="stext">${esc(c.texto)}</p></div>`;
  }).join('');
  const potions = p.aprendidas.filter((id) => D.cartas[id].tipo === 'pocion').map((id) => {
    const c = card(id);
    const ready = p.pociones.includes(id);
    let btn = '';
    if (ready && !c.ataque && canCast(id)) btn = `<button class="btn tiny primary" data-a="cast" data-v="${id}">Beber</button>`;
    if (!ready && canPrepare(id)) btn = `<button class="btn tiny" data-a="prep" data-v="${id}">Preparar</button>`;
    return `<div class="spell potion ${ready ? 'ready' : ''} ${c.ataque ? 'attack' : ''}">
      <span class="sname">${ready ? '⚗️ ' : ''}${esc(c.nombre)}</span><span class="scost">prep. ${costHtml(c.coste)}</span>${btn}
      <p class="stext">${esc(c.texto)}</p></div>`;
  }).join('') || '<p class="muted small">Aún no conoces ninguna receta de poción.</p>';
  $('mine').innerHTML = `
    <div class="mine-head">
      ${druidPortrait(p.druida, 'md')}
      <div><h2>${esc(p.name)}</h2>
        <div class="stats"><span class="pts big" title="Prestigio">${p.puntos}</span> Prestigio
        · ${p.magiaLibre ? '<span class="magic on">✦ magia libre</span>' : '<span class="magic">✦ magia usada</span>'}
        ${p.dormido ? ' · 💤' : ''}</div></div>
      <div class="petbox" title="${esc(pet.texto)}">${petPortrait(p.mascota, 'md')}
        <div><b>${esc(pet.nombre)}</b> · ${esc(pet.don)}<br><span class="small">${'●'.repeat(p.usos)}${'○'.repeat(Math.max(0, pet.usos - p.usos))} usos</span></div></div>
    </div>
    <div class="mine-grid">
      <div><h4>Reserva (${sum(p.reserva)}/${D.limiteReserva})</h4><div class="reserve">${reserveHtml(p, { clickable: resClick })}</div>
        <h4>En estudio</h4>${study}</div>
      <div><h4>Hechizos</h4><div class="spells">${spells}</div>
        <h4>Pociones (${p.pociones.length}/2 preparadas)</h4><div class="spells">${potions}</div></div>
    </div>`;
}

function renderRivals() {
  const rivals = S.players.filter((p) => p.id !== S.me);
  $('rivals').innerHTML = rivals.map((p) => {
    const active = S.turn && S.turn.pid === p.id;
    const pet = D.mascotas[p.mascota];
    const study = p.estudio ? `<div class="mini-study"><b>${esc(card(p.estudio.card).nombre)}</b> ${cardSlots(p.estudio)}</div>` : '<div class="muted small">sin receta en estudio</div>';
    const learned = p.aprendidas.map((id) => `<span class="chip ${D.cartas[id].tipo} ${D.cartas[id].ataque ? 'attack' : ''}" title="${esc(D.cartas[id].texto)}">${esc(D.cartas[id].nombre)}${p.pociones.includes(id) ? ' ⚗️' : ''}</span>`).join('');
    return `<div class="panel rival ${active ? 'active' : ''}">
      <div class="rival-head">${druidPortrait(p.druida, 'sm')}<b>${esc(p.name)}</b>
        <span class="pts">${p.puntos}</span></div>
      <div class="small muted">${petPortrait(p.mascota, 'xs')} ${esc(pet.nombre)} ${'●'.repeat(p.usos)}${'○'.repeat(Math.max(0, pet.usos - p.usos))}
        · ${p.magiaLibre ? '✦ libre' : '✦ usada'}${p.connected || p.bot ? '' : ' · desconectado'}${S.startId === p.id ? ' · inicial' : ''}</div>
      <div class="reserve sm">${reserveHtml(p)}</div>
      ${study}
      <div class="chips">${learned}</div>
    </div>`;
  }).join('');
}

function cardSlots(st) {
  const c = D.cartas[st.card];
  const out = [];
  for (const t of ING()) for (let k = 0; k < (c.req[t] || 0); k += 1) out.push(k < st.placed[t] ? tok(t, { cls: 'xs' }) : emptyTok(t).replace('tok ', 'tok xs '));
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
  el.innerHTML = `<div class="modal-card ${m.kind === 'rules' ? 'wide' : ''}">
    ${closable ? '<button class="modal-close" data-a="closeModal" aria-label="Cerrar">×</button>' : ''}
    ${body}
    ${ok ? `<div class="row end"><button class="btn primary" data-a="mOk">${ok}</button></div>` : ''}
  </div>`;
}

function modalOk() {
  const m = ui.modal;
  const close = () => { ui.modal = null; renderModal(); };
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
  const spells = ['chispa', 'burbuja', ...Object.keys(D.cartas)].map((id) => {
    const c = card(id);
    const req = c.req ? ING().map((t) => tok(t, { cls: 'xs' }).repeat(c.req[t] || 0)).join('') : 'inicial';
    return `<tr><td><b>${esc(c.nombre)}</b><br><span class="small muted">${c.tipo === 'pocion' ? 'poción' : 'hechizo'}${c.ataque ? ' · ataque' : ''}</span></td>
      <td>${req}</td><td>${costHtml(c.coste)}</td><td>${c.puntos}</td><td class="small">${esc(c.texto)}</td></tr>`;
  }).join('');
  const pets = Object.values(D.mascotas).map((m) => `<li><b>${esc(m.nombre)}</b> (${m.usos} ${m.usos > 1 ? 'usos' : 'uso'}): ${esc(m.texto)}</li>`).join('');
  return `<h2>Cómo se juega</h2>
    <p>Gana quien tenga más <b>Prestigio</b> al terminar la ronda ${D.rondas}. Solo se consigue aprendiendo conocimientos (3 o 4 puntos).</p>
    <h3>Tu turno</h3>
    <ol><li><b>Recoger:</b> 3 ingredientes de El Claro (se rellena desde la bolsa).</li>
      <li><b>Ataques:</b> los rivales pueden lanzarte <i>un</i> ataque. Te defiendes con Burbuja (2 Lumen).</li>
      <li><b>Estudiar:</b> una sola receta a la vez; coloca hasta 2 ingredientes que encajen. Al completarla la aprendes y los ingredientes vuelven a la bolsa. Una poción recién aprendida viene preparada gratis.</li>
      <li><b>Preparar:</b> 1 poción conocida pagando su coste (máx. 2 preparadas, distintas).</li>
      <li>Al final del turno conservas como máximo ${D.limiteReserva} ingredientes.</li></ol>
    <h3>Magia</h3>
    <p>Un efecto mágico por jugador <b>en el turno de cada jugador</b>, también en el tuyo. Chispa es gratis, una vez en tu turno, y no gasta tu magia. Los hechizos se aprenden para siempre; cada poción preparada sirve una vez.</p>
    <h3>Conocimientos</h3>
    <div class="table-wrap"><table class="rules-table"><tr><th>Nombre</th><th>Aprender</th><th>Uso</th><th>Pts</th><th>Efecto</th></tr>${spells}</table></div>
    <h3>Mascotas</h3><ul>${pets}</ul>`;
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
  zorro: () => {
    ui.zorro = !ui.zorro;
    ui.sel = ui.sel.slice(0, recogerNeed());
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
  const code = new URLSearchParams(location.search).get('sala');
  if (code) $('codeInput').value = code.toUpperCase();
  try { $('nameInput').value = localStorage.getItem('druidas.name') || ''; } catch { /* sin almacenamiento */ }
}

function enter(r) {
  if (!r || !r.ok) {
    $('homeError').textContent = (r && r.error) || 'No se pudo conectar';
    return false;
  }
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
  render();
});
