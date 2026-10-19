/* ESCUELA DE MAGIA — cliente web */
'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'druidas.session';

let S = null; // último estado recibido del servidor
let D = null; // tablas del reglamento e ilustraciones disponibles
let receivedAt = 0;
const ui = { key: '', sel: [], zorro: false, home: false, mode: null, chispaTipo: null, modal: null, logOpen: false, lastLog: -1 };

// Idioma: español o inglés (se recuerda en el navegador; por defecto, el del navegador).
let LANG = (() => { try { return localStorage.getItem('druidas.lang'); } catch { return null; } })()
  || (/^es\b/i.test(navigator.language || '') ? 'es' : 'en');
const L = (es, en) => (LANG === 'en' ? en : es);
function setLang(l) {
  LANG = l;
  try { localStorage.setItem('druidas.lang', l); } catch { /* sin almacenamiento */ }
  applyStaticTexts();
  ui.lastLog = -1;
  if (S && !ui.home) render();
}
// Textos fijos de la página (index.html) en el idioma elegido.
function applyStaticTexts() {
  document.documentElement.lang = LANG;
  const set = (id, es, en) => { const el = $(id); if (el) el.textContent = L(es, en); };
  const logo = D && ((LANG === 'en' && D.img.ui['titulo-en']) || D.img.ui.titulo);
  for (const id of ['homeH1', 'brand']) {
    const el = $(id);
    if (logo) el.innerHTML = `<img class="title-art" src="${logo}" alt="${L('Escuela de Magia', 'School of Magic')}">`;
    else el.textContent = L('Escuela de Magia', 'School of Magic');
  }
  if (D && (D.img.ui['hechizo-color'] || D.img.ui.hechizo)) {
    $('homeSeal').src = D.img.ui['hechizo-color'] || D.img.ui.hechizo;
    $('homeSeal').classList.remove('hidden');
  }
  document.title = L('Escuela de Magia', 'School of Magic');
  $('nameInput').placeholder = L('Tu nombre', 'Your name');
  $('codeInput').placeholder = L('CÓDIGO', 'CODE');
  set('createBtn', 'Crear partida', 'Create game');
  set('joinBtn', 'Entrar', 'Join');
  set('rulesBtn', '📖 Reglas', '📖 Rules');
  set('logBtn', '📜 Crónica y chat', '📜 Chronicle and chat');
  set('homeBtn', '🏠 Pantalla principal', '🏠 Main screen');
  set('journalTitle', 'Crónica', 'Chronicle');
  set('chatSend', 'Enviar', 'Send');
  $('chatInput').placeholder = L('Escribe al grupo…', 'Write to the group…');
  $('rulesTopBtn').title = L('Reglas', 'Rules');
  $('rulesTopBtn').setAttribute('aria-label', $('rulesTopBtn').title);
  $('menuBtn').title = L('Menú', 'Menu');
  $('menuBtn').setAttribute('aria-label', $('menuBtn').title);
  // El botón muestra el idioma al que se cambia.
  $('langBtn').textContent = L('EN', 'ES');
  $('langBtn').title = L('English', 'Español');
  $('langBtn').setAttribute('aria-label', $('langBtn').title);
  if (ui.modal && ui.modal.kind === 'rules' && D) renderModal();
  const sess = loadSession();
  const back = $('backRow').querySelector('button');
  if (back && sess) back.textContent = `${L('Volver a la partida', 'Back to game')} ${sess.code}`;
}

const PASO_ES = { recoger: 'Recoger', ventana: 'Ataques', defensa: 'Defensa', estudiar: 'Estudiar', preparar: 'Preparar', descartar: 'Devolver' };
const PASO_EN = { recoger: 'Gather', ventana: 'Attacks', defensa: 'Defence', estudiar: 'Study', preparar: 'Brew', descartar: 'Return' };
const PASO = new Proxy({}, { get: (_, k) => (LANG === 'en' ? PASO_EN : PASO_ES)[k] });
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
const N = (t) => L(D.ingInfo[t].nombre, D.ingInfo[t].en);
const card = (id) => D.cartas[id] || D.iniciales[id];
const cname = (c) => L(c.nombre, c.en || c.nombre);
const ctext = (c) => L(c.texto, c.textoEn || c.texto);
const petName = (m) => L(m.nombre, m.en || m.nombre);
const petDon = (m) => L(m.don, m.donEn || m.don);
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
    if (r && !r.ok) toast(L(r.error, r.errorEn || r.error));
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
  return `<span class="tok slot-empty tok-${t} ${img ? 'has-img' : ''} ${cls}" title="${L('Falta', 'Missing')} ${N(t)}">${inner}</span>`;
};

function costHtml(coste) {
  const out = [];
  for (const t of ING()) for (let k = 0; k < (coste[t] || 0); k += 1) out.push(tok(t, { cls: 'xs' }));
  return out.join('') || `<span class="free">${L('gratis', 'free')}</span>`;
}

// Retrato del druida: cuerpo entero en los formatos altos (xl, full); la cara en el resto.
function druidPortrait(id, cls = '') {
  const info = D.druidas[id];
  if (!info) return '';
  const tall = /\b(xl|full|hero)\b/.test(cls);
  // Siempre la cara (el retrato completo de la hoja de caras).
  const img = (D.img.sinfondo && D.img.sinfondo[id]) || D.img.retratos[id] || D.img.druidas[id];
  if (img) return `<span class="portrait ${cls} ${tall ? 'body' : ''}" style="--c:${info.hex}"><img src="${img}" alt="${esc(info.nombre)}"></span>`;
  return `<span class="portrait ph ${cls}" style="--c:${info.hex}" title="${esc(info.nombre)}"><svg viewBox="0 0 40 40" aria-hidden="true">
    <path d="M20 4C12 4 8 11.5 8 19.5L5.5 38h29L32 19.5C32 11.5 28 4 20 4z"/><path class="face" d="M20 12.5c-4.6 0-6.8 4.4-6.8 8.2 0 3.8 3 5.8 6.8 5.8s6.8-2 6.8-5.8c0-3.8-2.2-8.2-6.8-8.2z"/></svg></span>`;
}

function petPortrait(id, cls = '') {
  const img = D.img.mascotas[id];
  if (img) return `<span class="pet-pic ${cls}"><img src="${img}" alt="${esc(petName(D.mascotas[id]))}"></span>`;
  return `<span class="pet-pic ph ${cls}">${PET_EMOJI[id]}</span>`;
}

// Carta de conocimiento. estudio = { placed, pend } para mostrar los espacios.
function cardHtml(id, { estudio = null, footer = '', cls = '', prepared = false } = {}) {
  const c = card(id);
  // la ilustración en color (pergamino o frasco con su símbolo); si no hay, el icono sepia
  const img = (D.img.ilustradas && D.img.ilustradas[id]) || D.img.cartas[id];
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
  const use = c.tipo === 'pocion' ? L('Preparar', 'Brew') : L('Lanzar', 'Cast');
  return `<article class="kcard ${c.tipo} ${cls} ${c.ataque ? 'attack' : ''}">
    <header><span class="kname">${esc(cname(c))}</span></header>
    ${img ? `<div class="art"><img src="${img}" alt=""></div>` : ''}
    ${prepared ? `<div class="kind"><b class="ready">${L('preparada', 'brewed')}</b></div>` : ''}
    ${slots}
    <div class="use">${use}: ${costHtml(c.coste)}</div>
    <p class="ktext">${esc(ctext(c))}</p>
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
  return out.join('') || `<span class="muted small">${L('vacía', 'empty')}</span>`;
}

// ------------------------------------------------------------ estado derivado

function magicMoment(p = me()) {
  if (!S || S.phase !== 'juego' || !p) return false;
  const t = S.turn;
  if (t.paso === 'defensa') return false;
  if (t.pid === p.id && t.paso === 'ventana') return false;
  return true;
}

// ¿Te queda alguna magia que puedas usar ahora (sin contar Burbuja ni ataques)?
// (Chispa solo cuenta si sirve para algo: durante el estudio, para traer un ingrediente que encaje.)
function anyMagic(conChispa = true) {
  const p = me();
  return [...(conChispa ? ['chispa'] : []), ...p.aprendidas].some((id) => id !== 'burbuja' && !card(id).ataque
    && (D.cartas[id] && D.cartas[id].tipo === 'pocion' ? p.pociones.includes(id) : true) && canCast(id));
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

// Ingredientes que acaban de entrar en tu reserva: brillan un momento y se anuncian.
function markFresh() {
  const p = S.phase !== 'lobby' && me();
  if (!p) return;
  const now = ING().reduce((o, k) => ({ ...o, [k]: p.reserva[k] }), {});
  const prev = ui.prevRes;
  ui.prevRes = now;
  // Conocimiento recién aprendido: ventana para celebrarlo.
  const prevL = ui.prevLearned;
  ui.prevLearned = [...p.aprendidas];
  const nuevo = prevL && p.aprendidas.find((id) => !prevL.includes(id));
  if (nuevo) ui.modal = { kind: 'learned', id: nuevo };
  if (!prev) return;
  const gained = ING().flatMap((k) => Array(Math.max(0, now[k] - prev[k])).fill(k));
  if (!gained.length) return;
  ui.fresh = { add: gained.reduce((o, k) => ({ ...o, [k]: (o[k] || 0) + 1 }), {}) };
  toastHtml(`${L('Recoges', 'You take')} ${gained.map((k) => tok(k, { cls: 'sm' })).join('')}`);
  setTimeout(() => { ui.fresh = null; if (S) renderMesa(); }, 2700);
}

function toastHtml(html) {
  const t = $('toast');
  t.innerHTML = html;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
}

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
    if (ui.modal && !['rules', 'learned'].includes(ui.modal.kind)) ui.modal = null;
    if (S.phase === 'fin') ui.modal = { kind: 'final' };
  }
  markFresh();
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
  $('sub').innerHTML = `${L('Sala', 'Room')} <code>${esc(S.code)}</code>`;
  $('roundPill').before($('sub'));
  const pill = $('roundPill');
  pill.classList.toggle('hidden', S.phase === 'lobby');
  if (S.phase !== 'lobby') pill.textContent = S.ultima ? L(`Ronda ${S.round} · ¡última!`, `Round ${S.round} · last one!`) : `${L('Ronda', 'Round')} ${S.round}`;
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
    <button class="choice ${p.druida === id ? 'on' : ''}" data-a="druida" data-v="${id}" ${taken('druida', id) ? 'disabled' : ''} title="${esc(L(d.nombre, d.en || d.nombre))}" aria-label="${esc(L(d.nombre, d.en || d.nombre))}">
      ${D.img.recortes[id] ? `<img class="choice-body" src="${D.img.recortes[id]}" alt="">` : druidPortrait(id, 'full')}
    </button>`).join('');
  const pets = Object.entries(D.mascotas).map(([id, m]) => `
    <button class="choice pet ${p.mascota === id ? 'on' : ''}" data-a="mascota" data-v="${id}" ${taken('mascota', id) ? 'disabled' : ''} title="${esc(petName(m))} · ${esc(petDon(m))}: ${esc(L(m.texto, m.textoEn))}">
      ${petPortrait(id, 'lg')}<span>${esc(petName(m))}</span><small>${esc(L(m.corto, m.cortoEn))} · ${m.usos > 1 ? L(`${m.usos} veces`, `${m.usos} times`) : L('1 vez', 'once')}</small>
    </button>`).join('');
  const list = S.players.map((x) => `
    <li>${druidPortrait(x.druida, 'sm')} ${petPortrait(x.mascota, 'sm')} <b>${esc(x.name)}</b>
      ${x.id === S.hostId ? `<span class="tag">${L('anfitrión', 'host')}</span>` : ''}${x.connected || x.bot ? '' : `<span class="tag off">${L('desconectado', 'offline')}</span>`}
      ${host && x.id !== S.me ? `<button class="btn tiny ghost dark kick" data-a="kick" data-v="${x.id}" title="${L('Quitar', 'Remove')}" aria-label="${L('Quitar', 'Remove')}">✕</button>` : ''}</li>`).join('');
  $('lobby').innerHTML = `
    <div class="lobby">
      <div class="panel lobby-side">
        <h2 class="ptitle">${L('Sala', 'Room')} <span class="code-big">${esc(S.code)}</span></h2>
        <p class="small">${L('Comparte este enlace con tus amigos:', 'Share this link with your friends:')}</p>
        <div class="share"><input class="input" readonly value="${esc(link)}" id="shareLink"><button class="btn small" data-a="copy">${L('Copiar', 'Copy')}</button></div>
        <h3 class="ptitle sm">${L('Aprendices', 'Apprentices')} (${S.players.length}/4)</h3>
        <ul class="plist">${list}</ul>
        ${host ? `<div class="row">
            <button class="btn" data-a="bot" ${S.players.length >= 4 ? 'disabled' : ''}>${L('+ Añadir bot', '+ Add bot')}</button>
            <button class="btn primary" data-a="start" ${S.players.length < 2 ? 'disabled' : ''}>${L('Empezar', 'Start')}</button>
          </div>${S.players.length < 2 ? `<p class="muted small">${L('Hacen falta al menos 2 druidas.', 'At least 2 druids are needed.')}</p>` : ''}`
    : `<p class="muted">${L('El anfitrión empezará la partida.', 'The host will start the game.')}</p>`}
      </div>
      <div class="panel lobby-main">
        <h3 class="ptitle sm">${L('Tu aspecto', 'Your look')}</h3>
        <div class="choices">${druids}</div>
        <h3 class="ptitle sm">${L('Tu animal del bosque', 'Your forest animal')}</h3>
        <div class="choices">${pets}</div>
      </div>
    </div>`;
}

function renderPrompt() {
  const el = $('prompt');
  if (S.phase === 'fin') {
    const w = S.winners.map((id) => esc(pl(id).name)).join(L(' y ', ' and '));
    el.className = 'prompt';
    el.innerHTML = `<div class="msg">${L('Fin del aprendizaje', 'End of the learning')} · ${S.winners.length > 1 ? `${L('Victoria compartida', 'Shared victory')}: ${w}` : `${L('Gana', 'Winner:')} ${w}`}</div>`;
    ui.floatHtml = `<div class="float-act"><div class="float-msg"><b>${S.winners.length > 1 ? L('Victoria compartida', 'Shared victory') : L(`¡Gana ${w}!`, `${w} wins!`)}</b></div><div class="btns"><button class="btn primary" data-a="showFinal">${L('Resultados', 'Results')}</button></div></div>`;
    return;
  }
  const t = S.turn;
  const p = me();
  const a = pl(t.pid);
  let msg = '';
  let btns = '';
  let stuck = '';
  if (isMyTurn()) {
    if (t.paso === 'recoger') {
      const need = recogerNeed();
      msg = L(`<b class="ph">Fase 1 · Recoger.</b> Elige ${need} ingredientes de El Claro`, `<b class="ph">Phase 1 · Gather.</b> Choose ${need} ingredients from the Clearing`) + ` (${ui.sel.length}/${need})${ui.zorro ? ' 🦊' : ''}.`;
    } else if (t.paso === 'ventana') {
      msg = `${L('Tus rivales deciden si te atacan…', 'Your rivals decide whether to attack you…')}${timerHtml()}`;
    } else if (t.paso === 'defensa') {
      msg = `<b>${L(`¡${esc(pl(t.ataque.from).name)} te ataca con ${esc(cname(card(t.ataque.carta)))}!`, `${esc(pl(t.ataque.from).name)} attacks you with ${esc(cname(card(t.ataque.carta)))}!`)}</b> ${attackDesc(t.ataque)}${timerHtml()}`;
      btns = `<button class="btn primary" data-a="defender" ${p.magiaLibre && p.reserva.lumen >= 2 ? '' : 'disabled'}>🫧 ${L('Burbuja', 'Bubble')} ${tok('lumen', { cls: 'xs' })}${tok('lumen', { cls: 'xs' })}</button>
        <button class="btn" data-a="noDefender">${L('Aceptar el ataque', 'Accept the attack')}</button>`;
    } else if (t.paso === 'estudiar') {
      const ph = L('<b class="ph">Fase 2 · Estudiar.</b>', '<b class="ph">Phase 2 · Study.</b>');
      if (!p.estudio && !t.completada) msg = `${ph} ${L('Elige un conocimiento disponible para estudiarlo.', 'Choose an available knowledge to study.')}`;
      else if (!p.estudio) msg = `${ph} ${L('¡Aprendido! Elegirás nueva receta en tu próximo turno.', 'Learned! You will choose a new recipe next turn.')}`;
      else if (t.lechuza || t.estudiadas >= t.limite) msg = `${ph} ${L('Has terminado tu estudio normal.', 'You have finished your normal study.')}`;
      else msg = `${ph} ${L('Pulsa ingredientes de tu reserva para colocarlos', 'Tap ingredients from your reserve to place them')} (${t.estudiadas}/${t.limite}${t.limite === 1 ? ' 💤' : ''}).`;
      if (ui.mode === 'liebre') msg = L('🐇 Pulsa el ingrediente de tu reserva que quieres transformar.', '🐇 Tap the ingredient from your reserve you want to transform.');
      if (ui.mode === 'lechuza') msg = L('🦉 Pulsa el ingrediente de tu reserva que la Lechuza colocará.', '🦉 Tap the ingredient from your reserve the Owl will place.');
      const canPlace = p.estudio && !t.lechuza && t.estudiadas < t.limite && ING().some((k) => p.reserva[k] > 0 && p.estudio.pend[k] > 0);
      if (!ui.mode && !canPickCard() && !canPlace && !anyMagic()) {
        stuck = L('No puedes colocar nada más.', 'You cannot place anything else.');
      }
      btns += `<button class="btn primary" data-a="finEstudio">${L('Terminar estudio', 'Finish study')}</button>`;
    } else if (t.paso === 'preparar') {
      msg = `${L('<b class="ph">Fase 3 · Preparar.</b>', '<b class="ph">Phase 3 · Brew.</b>')} ${t.preparada ? L('Ya has preparado una poción.', 'You have brewed a potion.') : L('Puedes preparar 1 poción que conozcas.', 'You may brew 1 potion you know.')}`;
      if (!Object.keys(D.cartas).some(canPrepare) && !anyMagic(false)) {
        stuck = t.preparada ? L('Ya no puedes hacer nada más.', 'There is nothing else you can do.')
          : L('No tienes ninguna poción que puedas preparar.', 'You have no potion you can brew.');
        msg = `${L('<b class="ph">Fase 3 · Preparar.</b>', '<b class="ph">Phase 3 · Brew.</b>')} ${L('No hay nada que preparar.', 'Nothing to brew.')}`;
      }
      btns = `<button class="btn primary" data-a="finTurno">${L('Terminar turno', 'End turn')}</button>`;
    } else if (t.paso === 'descartar') {
      msg = L(`Tienes más de ${D.limiteReserva} ingredientes: devuelve los que sobran.`, `You have more than ${D.limiteReserva} ingredients: return the extra ones.`);
      btns = `<button class="btn primary" data-a="openDescartar">${L('Elegir', 'Choose')}</button>`;
    }
  } else {
    msg = L(`Turno de <b>${esc(a.name)}</b>`, `<b>${esc(a.name)}</b>'s turn`) + ` · ${PASO[t.paso]}.`;
    if (t.paso === 'ventana') {
      if (S.ataques.length && !t.miRespuesta) {
        msg = L(`<b>${esc(a.name)} ha recogido.</b> ¿Le atacas?`, `<b>${esc(a.name)} has gathered.</b> Attack?`) + timerHtml();
        btns = S.ataques.map((id) => `<button class="btn attack" data-a="atacar" data-v="${id}">⚡ ${esc(cname(card(id)))}</button>`).join('')
          + `<button class="btn" data-a="pasar">${L('No atacar', 'Do not attack')}</button>`;
      } else {
        msg = L(`${esc(a.name)} ha recogido. Los rivales deciden si le atacan…`, `${esc(a.name)} has gathered. Rivals decide whether to attack…`) + timerHtml();
      }
    } else if (t.paso === 'defensa') {
      msg = L(`${esc(pl(t.ataque.from).name)} ataca a ${esc(a.name)} con ${esc(cname(card(t.ataque.carta)))}. ¿Se defenderá con Burbuja?`, `${esc(pl(t.ataque.from).name)} attacks ${esc(a.name)} with ${esc(cname(card(t.ataque.carta)))}. Will they use Bubble?`) + timerHtml();
    }
  }
  if (ui.mode === 'chispa') msg = ui.chispaTipo ? L(`✧ Chispa: pulsa un ingrediente de El Claro para cambiarlo por ${N(ui.chispaTipo)}.`, `✧ Spark: tap an ingredient in the Clearing to swap it for ${N(ui.chispaTipo)}.`) : L('✧ Chispa: pulsa el ingrediente de tu reserva que quieres cambiar.', '✧ Spark: tap the ingredient from your reserve you want to swap.');
  if (ui.mode === 'pensar') msg = L('✦ Pensar: pulsa un ingrediente de El Claro que necesite tu receta.', '✦ Think: tap an ingredient in the Clearing your recipe needs.');
  if (ui.mode === 'cerv') msg = L('🦌 Cervatillo: pulsa el ingrediente de tu reserva que quieres colocar.', '🦌 Fawn: tap the ingredient from your reserve you want to place.');
  if (ui.mode) btns += `<button class="btn ghost" data-a="cancelMode">${L('Cancelar', 'Cancel')}</button>`;
  // La cabecera solo informa; lo que hay que decidir aparece en una ventana flotante sobre El Claro.
  el.className = 'prompt';
  el.innerHTML = `<div class="msg">${msg}</div>`;
  // En ataques y defensa la ventana explica qué pasa; en el resto basta con el botón.
  const explain = t.paso === 'ventana' || t.paso === 'defensa';
  const note = explain ? msg : stuck;
  ui.floatHtml = btns ? `<div class="float-act ${note ? '' : 'bare'}">${note ? `<div class="float-msg">${note}</div>` : ''}<div class="btns">${btns}</div></div>` : '';
}

function attackDesc(a) {
  if (a.carta === 'robo') return L(`Quiere robarte un ${N(a.tipo)}.`, `They want to steal a ${N(a.tipo)}.`);
  if (a.carta === 'lio') return L(`Quiere cambiar tu ${N(a.tipo)} por ${N(S.claro[a.slot])} de El Claro.`, `They want to swap your ${N(a.tipo)} for ${N(S.claro[a.slot])} from the Clearing.`);
  if (a.carta === 'sueno') return L('Solo podrás colocar 1 ingrediente en tu estudio.', 'You may place only 1 ingredient in your study.');
  return '';
}

// Icono grande de una carta: su ilustración o el ingrediente con que se usa.
// Símbolo del tipo de conocimiento: frasco (poción) o pergamino sellado (hechizo).
function kindIcon(tipo, cls = '') {
  const img = D.img.ui[tipo === 'pocion' ? 'pocion' : 'hechizo'];
  const label = tipo === 'pocion' ? L('Poción', 'Potion') : L('Hechizo', 'Spell');
  return img ? `<img class="kind-ico ${cls}" src="${img}" alt="${label}" title="${label}">` : '';
}

// Ilustración del conocimiento: el pergamino o frasco ilustrado; si no hay, el icono sepia.
function cardIcon(id, cls = 'lg') {
  const ill = D.img.ilustradas && D.img.ilustradas[id];
  if (ill) return `<span class="card-icon ill ${cls}"><img src="${ill}" alt=""></span>`;
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
    const dots = ING().map((t) => Array.from({ length: c.req[t] || 0 }, (_, j) => `<span class="req-dot tok-${t} ${j < p.reserva[t] ? 'have' : 'miss'}" title="${N(t)}"></span>`).join('')).join('');
    return `<button class="kc ${c.tipo} ${c.ataque ? 'attack' : ''} ${known ? 'known' : ''} ${pick && !known && S.catalogo[id] > 0 ? 'pickable' : ''}"
        data-a="info" data-v="${id}" title="${esc(cname(c))}: ${esc(ctext(c))}">
      <span class="kc-top">
        <span class="kc-icon ${D.img.ilustradas && D.img.ilustradas[id] ? '' : c.tipo === 'pocion' ? 'flask' : 'scroll'}" title="${c.tipo === 'pocion' ? L('Poción', 'Potion') : L('Hechizo', 'Spell')}">${cardIcon(id)}</span>
        <span class="kc-req" title="${L('Para aprenderlo', 'To learn it')}">${dots}</span>
      </span>
      <span class="kc-name">${esc(cname(c))} <span class="kc-count">${known ? '✓' : `×${S.catalogo[id] || 0}`}</span></span>
    </button>`;
  }).join('');
  $('catalog').innerHTML = `${pick ? `<div class="kcs-hint">${L('Elige qué quieres estudiar', 'Choose what to study')} ↓</div>` : ''}<div class="kcs">${cards}</div>`;
  $('catalog').classList.toggle('picking', pick);
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
// Prestigio: número en negro sobre una esfera del color del druida.
const prestigeHtml = (n, cls = '', druida = null) => `<span class="pts-ball ${cls}" title="${L('Prestigio', 'Prestige')}"${druida && D.druidas[druida] ? ` style="--pc:${D.druidas[druida].hex}"` : ''}>${n}</span>`;

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
    const n = on ? ui.sel.indexOf(i) + 1 : 0;
    const hint = ui.mode === 'pensar' && !(pend[c] > 0) ? 'dim' : '';
    return clickable ? `<button class="cslot live ${on ? 'on' : ''} ${hint}" data-a="claro" data-v="${i}" ${pos} title="${N(c)}">${inner}${n ? `<b class="sel-n">${n}</b>` : ''}</button>`
      : `<span class="cslot" ${pos} title="${N(c)}">${inner}</span>`;
  }).join('');
  $('claro').innerHTML = `<div class="ring">${slots}<span class="bag-pill" title="${L('Ingredientes que quedan en la bolsa', 'Ingredients left in the bag')}">${sum(S.bolsa)}</span></div>${ui.floatHtml || ''}`;
}

function studyHtml(p, t) {
  if (!p.estudio) {
    return `<div class="study-mini empty">${canPickCard() ? L('Elige un conocimiento abajo ↓', 'Choose a knowledge below ↓') : L('Nada en estudio', 'Nothing in study')}</div>`;
  }
  const c = D.cartas[p.estudio.card];
  const slots = [];
  for (const k of ING()) {
    for (let j = 0; j < (c.req[k] || 0); j += 1) slots.push(j < p.estudio.placed[k] ? tok(k) : emptyTok(k));
  }
  const canAbandon = isMyTurn() && t.paso === 'estudiar' && !t.tocado && t.estudiadas === 0;
  return `<div class="study-mini ${c.tipo}" title="${esc(ctext(c))}">
      <div class="study-ico">${cardIcon(p.estudio.card, 'md')}<b class="study-title">${esc(cname(c))}</b></div>
      <div class="recipe-slots">${slots.join('')}</div>
      ${canAbandon ? `<button class="btn tiny ghost dark" data-a="abandonar" title="${L('Abandonar receta', 'Abandon recipe')}">✕</button>` : ''}
    </div>`;
}

function renderMesa() {
  const p = me();
  const t = S.turn;
  const pet = D.mascotas[p.mascota];
  const click = resClickable();
  const petOn = ui.mode === 'liebre' || ui.mode === 'lechuza' || ui.mode === 'cerv' || ui.zorro;
  // Ingredientes: solo los que tienes, uno por ficha.
  const fresh = (k, j) => (ui.fresh && j >= p.reserva[k] - (ui.fresh.add[k] || 0) ? 'fresh' : '');
  const ings = ING().flatMap((k) => Array.from({ length: p.reserva[k] }, (_, j) => (click
    ? `<button class="tokbtn ${fresh(k, j)}" data-a="res" data-v="${k}" title="${N(k)}">${tok(k, { cls: 'lg' })}</button>`
    : `<span class="tokwrap ${fresh(k, j)}">${tok(k, { cls: 'lg' })}</span>`))).join('') || `<span class="none-txt">${L('Sin ingredientes', 'No ingredients')}</span>`;
  // Magia: solo lo que conoces. Las pociones sin preparar, en gris (con su coste si puedes prepararlas).
  const spell = (id) => {
    const c = card(id);
    const live = id !== 'burbuja' && !c.ataque && canCast(id);
    return `<button class="spell-ico ${c.ataque ? 'attack' : ''} ${live ? 'live' : ''}" ${live ? `data-a="cast" data-v="${id}"` : 'disabled'} title="${esc(cname(c))}: ${esc(ctext(c))}">
      ${cardIcon(id, 'md')}<span class="spell-name">${esc(cname(c))}</span></button>`;
  };
  const potion = (id) => {
    const c = D.cartas[id];
    const ready = p.pociones.includes(id);
    const live = ready && !c.ataque && canCast(id);
    const prep = !ready && canPrepare(id);
    return `<button class="spell-ico potion ${c.ataque ? 'attack' : ''} ${live || prep ? 'live' : ''} ${ready ? '' : 'unready'}"
      ${live ? `data-a="cast" data-v="${id}"` : prep ? `data-a="prep" data-v="${id}"` : 'disabled'}
      title="${esc(cname(c))} · ${ready ? L('Preparada', 'Brewed') : prep ? L('Pulsa para prepararla', 'Tap to brew it') : L('Sin preparar', 'Not brewed')}: ${esc(ctext(c))}">
      ${cardIcon(id, 'md')}<span class="spell-name">${esc(cname(c))}</span>${prep ? `<span class="prep-cost">${costHtml(c.coste)}</span>` : ''}</button>`;
  };
  const known = (tipo) => p.aprendidas.filter((id) => D.cartas[id].tipo === tipo);
  const studying = isMyTurn() && t && t.paso === 'estudiar' && !!p.estudio && !t.lechuza;
  const magicIds = [...['chispa', 'burbuja', ...known('hechizo')].map(spell), ...known('pocion').map(potion)];
  const magicCount = magicIds.length;
  const magic = magicIds.join('');
  $('mesa').innerHTML = `
    <div class="m-hero">
      <div class="m-name-row">
      <b class="m-name">${esc(p.name)}</b>${prestigeHtml(p.puntos, '', p.druida)}
      <span class="magic-dot ${p.magiaLibre ? 'on' : ''}" title="${p.magiaLibre ? L('Te queda la magia de este turno', 'You still have this turn\'s magic') : L('Ya has usado tu magia en este turno', 'You already used your magic this turn')}">✦</span>${p.dormido ? `<span title="${L('Dormido: solo 1 ingrediente', 'Asleep: only 1 ingredient')}">💤</span>` : ''}
    </div>
      ${druidPortrait(p.druida, 'hero')}
      <button class="m-pet-pic ${petUsable() ? 'live' : ''} ${petOn ? 'on' : ''}" data-a="habilidad" ${petUsable() ? '' : 'disabled'}
        title="${esc(petName(pet))} · ${esc(petDon(pet))}: ${esc(L(pet.texto, pet.textoEn))}">${petPortrait(p.mascota, 'free')}</button>
    </div>
    <section class="m-card"><h4>${L('Ingredientes', 'Ingredients')} <span class="h4-n">${sum(p.reserva)}/${D.limiteReserva}</span></h4><div class="ing-row">${ings}</div></section>
    <section class="m-card"><h4>${L('Aprendiendo', 'Learning')}${studying ? ` <span class="h4-n study-n" title="${L('Ingredientes que puedes colocar en este turno', 'Ingredients you can place this turn')}">${t.estudiadas}/${t.limite}</span>` : ''}</h4>${studyHtml(p, t)}</section>
    <section class="m-card"><h4>${L('Magia', 'Magic')}</h4><div class="spell-row" style="--n:${Math.min(5, magicCount)}">${magic}</div></section>`;
}

function renderRivals() {
  const rivals = S.players.filter((p) => p.id !== S.me);
  $('rivals').innerHTML = rivals.map((p) => {
    const active = S.turn && S.turn.pid === p.id;
    const learned = p.aprendidas.map((id) => `<span class="learned ${D.cartas[id].ataque ? 'attack' : ''} ${D.cartas[id].tipo === 'pocion' && !p.pociones.includes(id) ? 'unready' : ''}" title="${esc(cname(D.cartas[id]))}${p.pociones.includes(id) ? L(' (preparada)', ' (brewed)') : ''}: ${esc(ctext(D.cartas[id]))}">
      ${cardIcon(id, 'sm')}</span>`).join('');
    const initial = ['chispa', 'burbuja'].map((id) => `<span class="learned initial" title="${esc(cname(card(id)))}: ${esc(ctext(card(id)))}">${cardIcon(id, 'sm')}</span>`).join('');
    const star = `<span class="magic-dot ${p.magiaLibre ? 'on' : ''}" title="${p.magiaLibre ? L('Le queda la magia de este turno', 'Still has this turn\'s magic') : L('Ya ha usado su magia en este turno', 'Already used their magic this turn')}">✦</span>`;
    const status = `${p.connected || p.bot ? '' : L('desconectado', 'offline')}${S.startId === p.id ? `${p.connected || p.bot ? '' : ' · '}${L('abre la ronda', 'opens the round')}` : ''}`;
    return `<div class="rival ${active ? 'active' : ''}">
      <div class="r-head">
        ${druidPortrait(p.druida, 'rsm')}
        <span class="r-pet" title="${esc(petName(D.mascotas[p.mascota]))}: ${esc(L(D.mascotas[p.mascota].texto, D.mascotas[p.mascota].textoEn))}">${petPortrait(p.mascota, 'free')}</span>
        <div class="r-who"><span class="r-name"><b title="${esc(p.name)}">${esc([...p.name].slice(0, 2).join(''))}</b>${star}</span>
          ${status ? `<span class="r-sub">${status}</span>` : ''}</div>
        ${prestigeHtml(p.puntos, '', p.druida)}
      </div>
      <div class="r-learned">${initial}${learned}</div>
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
    $('log').innerHTML = S.log.map((l) => `<p class="${l.text.startsWith('—') ? 'turn' : ''}">${esc(L(l.text, l.en || l.text))}</p>`).join('');
    $('log').scrollTop = $('log').scrollHeight;
    // Avisos de lo que hacen los demás.
    if (ui.lastLog >= 0) {
      const fresh = S.log.filter((l) => l.n > ui.lastLog && /^[⚡🫧✦💤]/u.test(l.text));
      if (fresh.length) { const f = fresh[fresh.length - 1]; toast(L(f.text, f.en || f.text)); }
    }
    ui.lastLog = last;
  }
}

// ------------------------------------------------------------ ventanas

function picker(field, values, current, { multi = false } = {}) {
  return values.map((v, i) => {
    const on = multi ? false : current === v.value;
    return `<button class="pick ${on ? 'on' : ''}" data-a="${multi ? 'mAdd' : 'm'}" data-f="${field}" data-v="${esc(v.value)}" data-i="${i}">${v.html}</button>`;
  }).join('') || `<span class="muted small">${L('nada disponible', 'nothing available')}</span>`;
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
    body = rulesHtml(m.page || 0);
  } else if (m.kind === 'info') {
    const known = p.aprendidas.includes(m.id);
    const can = canPickCard() && !known && S.catalogo[m.id] > 0;
    body = cardHtml(m.id, { cls: 'big', footer: `<div class="kfoot"><span class="muted small">${S.catalogo[m.id] === 1 ? L('Queda 1', '1 left') : L(`Quedan ${S.catalogo[m.id] || 0}`, `${S.catalogo[m.id] || 0} left`)}</span>${known ? `<span class="tag ok">${L('aprendido', 'learned')}</span>` : ''}</div>` });
    ok = can ? L('Estudiar', 'Study') : '';
  } else if (m.kind === 'final') {
    const rank = [...S.players].sort((a, b) => b.puntos - a.puntos);
    body = `<h2 class="ptitle">${S.winners.length > 1 ? L('Victoria compartida', 'Shared victory') : L(`¡${esc(pl(S.winners[0]).name)} gana!`, `${esc(pl(S.winners[0]).name)} wins!`)}</h2>
      <ol class="final">${rank.map((x) => `<li>${druidPortrait(x.druida, 'sm')} <b>${esc(x.name)}</b> — ${x.puntos} ${L('de Prestigio', 'Prestige')}
        <div class="small muted">${x.aprendidas.map((id) => esc(cname(card(id)))).join(', ') || L('nada aprendido', 'nothing learned')}</div></li>`).join('')}</ol>`;
    ok = L('Nueva partida', 'New game');
  } else if (m.kind === 'learned') {
    const c = card(m.id);
    body = `<h3>✦ ${L('¡Has aprendido', 'You have learned')} ${esc(cname(c))}${L('!', '!')}</h3>
      ${cardHtml(m.id, { cls: 'big', prepared: c.tipo === 'pocion' })}
      <p class="learned-pts">+${c.puntos} ${L('de Prestigio', 'Prestige')}</p>`;
    ok = L('¡Estupendo!', 'Great!');
  } else if (m.kind === 'chispa') {
    const slots = S.claro.map((c, i) => (c ? { value: String(i), html: tok(c) } : null)).filter(Boolean);
    const target = m.slot !== null ? S.claro[Number(m.slot)] : null;
    body = `<h3>✧ ${L('Chispa', 'Spark')}</h3><p>${esc(ctext(card('chispa')))}</p>
      <h4>${L('1 · Das este ingrediente de tu reserva…', '1 · You give this ingredient from your reserve…')}</h4><div class="picks">${picker('tipo', resValues(me().reserva), m.tipo)}</div>
      <h4>${L('2 · …y te llevas este de El Claro', '2 · …and take this one from the Clearing')}</h4><div class="picks">${picker('slot', slots, m.slot)}</div>
      ${m.tipo && target ? `<div class="swap-preview">${tok(m.tipo)} <span>⇄</span> ${tok(target)}</div>` : ''}`;
    ok = m.tipo && m.slot !== null ? L('Lanzar Chispa', 'Cast Spark') : '';
  } else if (m.kind === 'pensar') {
    const slots = S.claro.map((c, i) => (c && pend[c] > 0 ? { value: String(i), html: tok(c) } : null)).filter(Boolean);
    body = `<h3>✦ ${L('Pensar', 'Think')}</h3><p>${esc(ctext(card('pensar')))}</p>
      <h4>${L('Ingrediente de El Claro que irá a tu receta', 'Ingredient from the Clearing that goes on your recipe')}</h4><div class="picks">${picker('slot', slots, m.slot)}</div>`;
    ok = m.slot !== null ? L('Beber Pensar', 'Drink Think') : '';
  } else if (m.kind === 'idea') {
    body = `<h3>💡 ${L('Idea', 'Idea')}</h3><p>${esc(ctext(card('idea')))}</p>`;
    ok = L('Lanzar Idea', 'Cast Idea');
  } else if (m.kind === 'memoria') {
    const r = freeRes(m.list);
    const left = { ...pend };
    for (const t of m.list) left[t] -= 1;
    body = `<h3>${L('Memoria', 'Memory')}</h3><p>${L('Elige hasta 2 ingredientes.', 'Choose up to 2 ingredients.')}</p>
      <div class="picked">${m.list.map((t, i) => `<button class="pick on" data-a="mDel" data-f="list" data-i="${i}">${tok(t)}</button>`).join('') || '<span class="muted">—</span>'}</div>
      ${m.list.length < 2 ? `<div class="picks">${picker('list', resValues(r, (t) => left[t] > 0), null, { multi: true })}</div>` : ''}`;
    ok = m.list.length ? L('Beber Memoria', 'Drink Memory') : '';
  } else if (m.kind === 'cambio') {
    const left = { ...pend };
    if (m.wComo) left[m.wComo] -= 1;
    if (m.match) left[m.match] -= 1;
    const pendValues = ING().filter((t) => pend[t] > 0 && (t === m.wComo || left[t] > 0)).map((t) => ({ value: t, html: emptyTok(t) }));
    body = `<h3>${L('Cambio', 'Change')} <span class="small">(${L('paga', 'pay')} ${tok('eter', { cls: 'xs' })})</span></h3>
      <p>${L('Elige hasta 2 ingredientes. Uno puede ser comodín.', 'Choose up to 2 ingredients. One can be a wildcard.')}</p>
      <h4>${L('Comodín (opcional): este ingrediente…', 'Wildcard (optional): this ingredient…')}</h4><div class="picks">${picker('wTipo', resValues(freeRes(['eter', m.match]), (t) => true), m.wTipo)}</div>
      <h4>${L('…ocupa este espacio', '…fills this slot')}</h4><div class="picks">${picker('wComo', pendValues, m.wComo)}</div>
      <h4>${L('Ingrediente que coincide (opcional)', 'Matching ingredient (optional)')}</h4><div class="picks">${picker('match', resValues(freeRes(['eter', m.wTipo]), (t) => (pend[t] || 0) - (m.wComo === t ? 1 : 0) > 0), m.match)}</div>`;
    ok = (m.wTipo && m.wComo) || m.match ? L('Lanzar Cambio', 'Cast Change') : '';
  } else if (m.kind === 'suerte') {
    const need = Math.min(3, S.claro.filter(Boolean).length);
    const slots = S.claro.map((c, i) => (c ? `<button class="pick ${m.slots.includes(i) ? 'on' : ''}" data-a="mSlot" data-v="${i}">${tok(c)}</button>` : '')).join('');
    const after = { ...p.reserva };
    for (const i of m.slots) after[S.claro[i]] += 1;
    body = `<h3>${L('Suerte', 'Luck')}</h3><p>${L(`Recoge ${need} ingredientes de El Claro`, `Take ${need} ingredients from the Clearing`)} (${m.slots.length}/${need}).</p>
      <div class="picks">${slots}</div>
      ${p.estudio ? `<h4>${L('Después, coloca uno en tu receta (opcional)', 'Then place one on your recipe (optional)')}</h4><div class="picks">${picker('colocar', resValues(after, (t) => pend[t] > 0), m.colocar)}</div>` : ''}`;
    ok = m.slots.length === need ? L('Beber Suerte', 'Drink Luck') : '';
  } else if (m.kind === 'robo') {
    const target = pl(S.turn.pid);
    body = `<h3>${L('Robo', 'Steal')} <span class="small">(${L('paga', 'pay')} ${tok('umbra', { cls: 'xs' })})</span></h3><p>${L(`Elige qué ingrediente robas a ${esc(target.name)}.`, `Choose which ingredient to steal from ${esc(target.name)}.`)}</p>
      <div class="picks">${picker('tipo', resValues(target.reserva), m.tipo)}</div>
      ${m.tipo && pend[m.tipo] > 0 ? `<label class="check"><input type="checkbox" data-a="mCheck" data-f="colocar" ${m.colocar ? 'checked' : ''}>${L(' Colocarlo directamente en mi receta', ' Place it straight on my recipe')}</label>` : ''}`;
    ok = m.tipo ? L('Lanzar Robo', 'Cast Steal') : '';
  } else if (m.kind === 'lio') {
    const target = pl(S.turn.pid);
    const swaps = S.lio.map((s, i) => ({ value: String(i), html: `<span class="swap">${tok(s.tipo, { cls: 'sm' })} ⇄ ${tok(S.claro[s.slot], { cls: 'sm' })}</span>` }));
    const r = freeRes(['umbra']);
    body = `<h3>${L('Lío', 'Mix-up')} <span class="small">(${L('paga', 'pay')} ${tok('umbra', { cls: 'xs' })})</span></h3>
      <p>${L(`Elige qué cambias a ${esc(target.name)}.`, `Choose what to swap from ${esc(target.name)}.`)}</p>
      <div class="picks">${picker('swap', swaps, m.swap)}</div>
      ${p.estudio ? `<h4>${L('Si no te bloquean: coloca uno de tu reserva como comodín (opcional)', 'If not blocked: place one of yours as a wildcard (optional)')}</h4>
        <div class="picks">${picker('bTipo', resValues(r), m.bTipo)}</div>
        ${m.bTipo ? `<h4>${L('…en este espacio', '…in this slot')}</h4><div class="picks">${picker('bComo', ING().filter((t) => pend[t] > 0).map((t) => ({ value: t, html: emptyTok(t) })), m.bComo)}</div>` : ''}` : ''}`;
    ok = m.swap !== null && (!m.bTipo || m.bComo) ? L('Lanzar Lío', 'Cast Mix-up') : '';
  } else if (m.kind === 'sueno') {
    body = `<h3>${L('Sueño', 'Sleep')}</h3><p>${L(`${esc(pl(S.turn.pid).name)} solo podrá colocar 1 ingrediente en su estudio.`, `${esc(pl(S.turn.pid).name)} may place only 1 ingredient in their study.`)}</p>
      ${p.estudio ? `<h4>${L('Si no te bloquean: coloca un ingrediente válido de tu reserva (opcional)', 'If not blocked: place a valid ingredient of yours (optional)')}</h4>
      <div class="picks">${picker('bTipo', resValues(p.reserva, (t) => pend[t] > 0), m.bTipo)}</div>` : ''}`;
    ok = L('Beber Sueño', 'Drink Sleep');
  } else if (m.kind === 'liebre') {
    body = `<h3>🐇 ${L('Liebre', 'Hare')}</h3><p>${L(`Tu ${N(m.tipo)} contará como…`, `Your ${N(m.tipo)} will count as…`)}</p>
      <div class="picks">${picker('como', ING().filter((t) => t !== m.tipo && pend[t] > 0).map((t) => ({ value: t, html: emptyTok(t) })), m.como)}</div>`;
    ok = m.como ? L('Transformar y colocar', 'Transform and place') : '';
  } else if (m.kind === 'descartar') {
    const extra = sum(p.reserva) - D.limiteReserva;
    const rows = ING().filter((t) => p.reserva[t] > 0).map((t) => `<div class="drow">${tok(t, { n: p.reserva[t] })}
      <button class="btn tiny" data-a="dMinus" data-v="${t}">−</button><b>${m.ings[t]}</b><button class="btn tiny" data-a="dPlus" data-v="${t}">+</button></div>`).join('');
    body = `<h3>${L('Devolver a la bolsa', 'Return to the bag')}</h3><p>${L(`Solo puedes guardar ${D.limiteReserva}. Devuelve ${extra}`, `You can keep only ${D.limiteReserva}. Return ${extra}`)} (${sum(m.ings)}/${extra}).</p>${rows}`;
    ok = sum(m.ings) === extra ? L('Devolver', 'Return') : '';
  }
  const closable = m.kind !== 'descartar';
  el.innerHTML = `<div class="modal-card ${m.kind === 'rules' ? 'book-card' : 'parch-card'}">
    ${closable ? `<button class="modal-close" data-a="closeModal" aria-label="${L('Cerrar', 'Close')}">×</button>` : ''}
    ${body}
    ${ok ? `<div class="row end"><button class="btn primary" data-a="mOk">${ok}</button></div>` : ''}
  </div>`;
}

function modalOk() {
  const m = ui.modal;
  const close = () => { ui.modal = null; renderModal(); };
  if (m.kind === 'info') return send('elegir', { carta: m.id }, close);
  if (m.kind === 'final') return H.leave();
  if (m.kind === 'chispa') return send('magia', { carta: 'chispa', tipo: m.tipo, slot: Number(m.slot) }, close);
  if (m.kind === 'pensar') return send('magia', { carta: 'pensar', slot: Number(m.slot) }, close);
  if (m.kind === 'idea') return send('magia', { carta: 'idea' }, close);
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

// Libro de reglas: varias páginas, de dos en dos.
function rulesPages() {
  const ruleCard = (id) => {
    const c = card(id);
    const req = c.req ? ING().map((t) => tok(t, { cls: 'sm' }).repeat(c.req[t] || 0)).join('') : `<i>${L('se tiene desde el principio', 'you start with it')}</i>`;
    const tipo = c.tipo === 'pocion' ? L('Poción', 'Potion') : L('Hechizo', 'Spell');
    return `<div class="rule-card ${c.ataque ? 'attack' : ''}">${cardIcon(id, 'lg')}
      <b class="rc-name">${esc(cname(c))}</b>
      <div class="rc-sub">${tipo}${c.ataque ? L(' · ataque', ' · attack') : ''}${c.puntos ? ` · ${c.puntos} ${L('de Prestigio', 'Prestige')}` : ''}</div>
      <div class="rc-line">${L('Aprender', 'Learn')}: ${req}</div>
      <div class="rc-line">${c.tipo === 'pocion' ? L('Preparar', 'Brew') : L('Lanzar', 'Cast')}: ${costHtml(c.coste) || L('gratis', 'free')}</div>
      <p>${esc(ctext(c))}</p></div>`;
  };
  const cards = (title, ids) => `<h2 class="ptitle">${title}</h2>${ids.map(ruleCard).join('')}`;
  const ings = ING().map((t) => `<span class="rule-ing">${tok(t)}<span>${esc(N(t))}</span></span>`).join('');
  const pets = (ids) => ids.map((id) => {
    const m = D.mascotas[id];
    return `<div class="rule-pet">${petPortrait(id, 'lg2')}<b>${esc(petName(m))}</b><i class="rp-don">${esc(petDon(m))}</i>
      <p>${esc(L(m.texto, m.textoEn || m.texto))}</p></div>`;
  }).join('');
  const petIds = Object.keys(D.mascotas);
  const spells = Object.keys(D.cartas).filter((id) => D.cartas[id].tipo === 'hechizo');
  const potions = Object.keys(D.cartas).filter((id) => D.cartas[id].tipo === 'pocion');
  return [
    L(`<h2 class="ptitle">El objetivo</h2>
      <p>Sois aprendices de druida en la Escuela de Magia. Recogéis ingredientes en El Claro y estudiáis hechizos y recetas de pociones.</p>
      <p>Cuando alguien llega a <b>${D.meta} de Prestigio</b>, se termina esa ronda (así todos juegan los mismos turnos) y gana quien tenga más. Si nadie llega, la partida acaba tras la ronda ${D.rondas}. El Prestigio solo se consigue <b>aprendiendo conocimientos</b>: cada uno da 3 o 4 puntos.</p>
      <p>Todo es público: se ven las reservas, las recetas en estudio y las pociones preparadas de todos.</p>`,
    `<h2 class="ptitle">The goal</h2>
      <p>You are druid apprentices at the School of Magic. You gather ingredients in the Clearing and study spells and potion recipes.</p>
      <p>When someone reaches <b>${D.meta} Prestige</b>, that round is finished (so everyone plays the same number of turns) and whoever has the most wins. If nobody gets there, the game ends after round ${D.rondas}. Prestige is only earned by <b>learning knowledge</b>: each one gives 3 or 4 points.</p>
      <p>Everything is public: everyone's reserves, recipes in study and brewed potions can be seen.</p>`),
    L(`<h2 class="ptitle">Los ingredientes</h2>
      <div class="rule-ings">${ings}</div>
      <p>Hay 4 tipos de ingredientes. Están en la <b>bolsa</b>, y siempre hay 6 a la vista en <b>El Claro</b>.</p>
      <p>Cuando alguien recoge, El Claro se rellena desde la bolsa. Los ingredientes que se gastan vuelven a la bolsa.</p>`,
    `<h2 class="ptitle">The ingredients</h2>
      <div class="rule-ings">${ings}</div>
      <p>There are 4 types of ingredients. They are in the <b>bag</b>, and there are always 6 in sight in <b>the Clearing</b>.</p>
      <p>When someone gathers, the Clearing is refilled from the bag. Spent ingredients go back to the bag.</p>`),
    L(`<h2 class="ptitle">Tu turno (I)</h2>
      <h3>1 · Recoger</h3>
      <p>Toma 3 ingredientes de El Claro y ponlos en tu reserva.</p>
      <h3>2 · Ataques</h3>
      <p>Los rivales tienen unos segundos para lanzarte <i>un</i> ataque (Robo, Lío o Sueño). Si atacan varios, vale el primero en el orden de juego.</p>
      <p>Puedes defenderte con <b>Burbuja</b>, pagando 2 Lumen.</p>`,
    `<h2 class="ptitle">Your turn (I)</h2>
      <h3>1 · Gather</h3>
      <p>Take 3 ingredients from the Clearing and put them in your reserve.</p>
      <h3>2 · Attacks</h3>
      <p>Rivals have a few seconds to cast <i>one</i> attack on you (Steal, Mix-up or Sleep). If several attack, the first in turn order counts.</p>
      <p>You can defend yourself with <b>Bubble</b>, paying 2 Lumen.</p>`),
    L(`<h2 class="ptitle">Tu turno (II)</h2>
      <h3>3 · Estudiar</h3>
      <p>Estudias una sola receta a la vez. Coloca hasta 2 ingredientes de tu reserva que encajen. Al completarla, la aprendes y sus ingredientes vuelven a la bolsa.</p>
      <p>Una poción recién aprendida viene preparada gratis.</p>
      <h3>4 · Preparar</h3>
      <p>Prepara 1 poción que conozcas pagando su coste. Puedes tener 2 preparadas como máximo, y distintas.</p>
      <h3>5 · Final del turno</h3>
      <p>Conservas como máximo ${D.limiteReserva} ingredientes; el resto vuelve a la bolsa.</p>`,
    `<h2 class="ptitle">Your turn (II)</h2>
      <h3>3 · Study</h3>
      <p>You study only one recipe at a time. Place up to 2 ingredients from your reserve that fit. When it is complete you learn it and its ingredients go back to the bag.</p>
      <p>A newly learned potion comes brewed for free.</p>
      <h3>4 · Brew</h3>
      <p>Brew 1 potion you know by paying its cost. You can have at most 2 brewed, and they must be different.</p>
      <h3>5 · End of turn</h3>
      <p>You keep at most ${D.limiteReserva} ingredients; the rest go back to the bag.</p>`),
    L(`<h2 class="ptitle">La magia</h2>
      <p>Cada jugador puede usar <b>un efecto mágico en el turno de cada jugador</b>, también en el suyo.</p>
      <p>Los <b>hechizos</b> se aprenden para siempre. Cada <b>poción</b> preparada sirve una sola vez.</p>
      <p><b>Chispa</b> es gratis, una vez en tu turno, y no gasta tu magia.</p>
      <p>Los <b>ataques</b> (Robo, Lío y Sueño) van siempre contra el jugador activo, después de su recogida.</p>`,
    `<h2 class="ptitle">Magic</h2>
      <p>Each player may use <b>one magic effect on each player's turn</b>, their own included.</p>
      <p><b>Spells</b> are learned forever. Each brewed <b>potion</b> works only once.</p>
      <p><b>Spark</b> is free, once on your turn, and does not use your magic.</p>
      <p><b>Attacks</b> (Steal, Mix-up and Sleep) always target the active player, after they gather.</p>`),
    ...petIds.map((id) => `<h2 class="ptitle">${L('Las mascotas', 'The pets')}</h2>${pets([id])}`),
    ...['chispa', 'burbuja'].map((id) => cards(L('Magia inicial', 'Starting magic'), [id])),
    ...spells.map((id) => cards(L('Hechizos', 'Spells'), [id])),
    ...potions.map((id) => cards(L('Pociones', 'Potions'), [id])),
  ];
}

function rulesHtml(spread = 0) {
  const pages = rulesPages();
  const last = Math.ceil(pages.length / 2) - 1;
  const s = Math.max(0, Math.min(spread, last));
  const page = (k) => (pages[k] ? `${pages[k]}<span class="pnum">${k + 1}</span>` : '');
  return `<div class="book">
    <section class="page left">${page(2 * s)}</section>
    <section class="page right">${page(2 * s + 1)}</section>
    ${s > 0 ? `<button class="book-nav prev" data-a="rulesPage" data-v="${s - 1}" aria-label="${L('Anterior', 'Previous')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>` : ''}
    ${s < last ? `<button class="book-nav next" data-a="rulesPage" data-v="${s + 1}" aria-label="${L('Siguiente', 'Next')}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>` : ''}
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
    navigator.clipboard?.writeText(i.value).then(() => toast(L('Enlace copiado', 'Link copied')), () => {});
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
    // Al elegir el último ingrediente se recogen directamente.
    if (isMyTurn() && S.turn.paso === 'recoger' && ui.sel.length === recogerNeed()) return send('recoger', { slots: ui.sel, zorro: ui.zorro });
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
  abandonar: () => { if (confirm(L('¿Abandonar la receta? Los ingredientes colocados vuelven a la bolsa.', 'Abandon the recipe? The placed ingredients go back to the bag.'))) send('abandonar'); },
  finEstudio: () => send('fin_estudio'),
  finTurno: () => send('fin_turno'),
  openDescartar: () => { ui.modal = { kind: 'descartar', ings: { eter: 0, umbra: 0, lumen: 0, raiz: 0 } }; render(); },
  prep: (v) => send('preparar', { carta: v }),
  cast: (v) => {
    if (v === 'chispa') ui.modal = { kind: 'chispa', tipo: null, slot: null };
    if (v === 'pensar') ui.modal = { kind: 'pensar', slot: null };
    if (v === 'idea') ui.modal = { kind: 'idea' };
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
  rulesPage: (v) => { ui.modal.page = Number(v); renderModal(); },
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
$('rulesTopBtn').onclick = $('rulesBtn').onclick;
$('langBtn').onclick = () => setLang(LANG === 'en' ? 'es' : 'en');
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
  $('sub').textContent = '';
  const sess = S && loadSession();
  $('backRow').innerHTML = sess ? `<button class="btn green" data-a="back">${L('Volver a la partida', 'Back to game')} ${esc(sess.code)}</button>` : '';
  const code = new URLSearchParams(location.search).get('sala');
  if (code) $('codeInput').value = code.toUpperCase();
  try { $('nameInput').value = localStorage.getItem('druidas.name') || ''; } catch { /* sin almacenamiento */ }
}

function enter(r) {
  if (!r || !r.ok) {
    $('homeError').textContent = (r && L(r.error, r.errorEn || r.error)) || L('No se pudo conectar', 'Could not connect');
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
  if (code.length !== 4) return void ($('homeError').textContent = L('Escribe el código de 4 letras', 'Type the 4-letter code'));
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
  toast(L('Te han quitado de la sala', 'You were removed from the room'));
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

applyStaticTexts();

fetch('/api/datos').then((r) => r.json()).then((d) => {
  D = d;
  document.body.classList.toggle('has-table-art', !!D.img.ui.mesa);
  for (const el of [$('mesa'), $('rivals')]) el.classList.toggle('vertical', !!D.img.ui['mesa-vertical']);
  applyStaticTexts();
  render();
});
