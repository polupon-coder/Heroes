/* HÉROES — cliente web */
'use strict';

const socket = io();
const $ = (id) => document.getElementById(id);
const SESSION_KEY = 'heroes.session';

let S = null; // último estado recibido del servidor
let DATA = null; // tablas de razas/clases
const ui = {
  held: new Set(),
  combatKey: '',
  manaMode: false,
  manaPick: new Map(),
  manaSel: null,
  trade: { to: null, give: new Set(), want: new Set() },
  theft: null,
  curse: { target: null, amount: 5 },
};

const FACE_LABEL = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', amarillo: 'Amarillo', negro: 'Negro', blanco: 'Blanco (comodín)' };
const COLOR_LABEL = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', amarillo: 'Amarillo' };
const FACES = ['rojo', 'azul', 'verde', 'amarillo', 'negro', 'blanco'];

// ------------------------------------------------------------ utilidades

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

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

function act(type, data = {}) {
  socket.emit('act', { type, data }, (res) => {
    if (res && !res.ok) toast(res.error);
  });
}

function me() { return S && S.players.find((p) => p.id === S.me); }
function byId(id) { return S.players.find((p) => p.id === id); }
function others() { return S.players.filter((p) => p.id !== S.me); }
function chip(color) { return `<span class="chip ${color}" title="${COLOR_LABEL[color] || ''}"></span>`; }
function raceName(p) { return p.raza && DATA ? DATA.razas[p.raza].nombre : '¿Raza?'; }
function className(p) { return p.clase && DATA ? DATA.clases[p.clase].nombre : '¿Clase?'; }

function die(face, { cls = '', attrs = '', sm = false } = {}) {
  const f = face || 'empty';
  return `<div class="die ${sm ? 'sm' : ''} ${f} ${cls}" ${attrs} title="${FACE_LABEL[face] || ''}"></div>`;
}

function comboHtml(combo, sm = true) {
  return `<div class="dice">${combo.map((c) => die(c, { sm, cls: 'target' })).join('')}</div>`;
}

function matchDice(faces, combo) {
  const needs = {};
  combo.forEach((c) => (needs[c] = (needs[c] || 0) + 1));
  const used = new Set();
  faces.forEach((f, i) => { if (f && f !== 'blanco' && needs[f] > 0) { needs[f]--; used.add(i); } });
  let missing = Object.values(needs).reduce((a, b) => a + b, 0);
  faces.forEach((f, i) => { if (missing > 0 && f === 'blanco') { used.add(i); missing--; } });
  return { used, missing };
}

function itemIcon(it) {
  if (it.tipo === 'pocion') return '🧪';
  if (it.tipo === 'pergamino') return '📜';
  return { arma: '🗡', dosManos: '⚔', escudo: '🛡', yelmo: '⛑', armadura: '🥋', botas: '🥾' }[it.slot] || '•';
}

function itemDesc(it) {
  if (it.tipo === 'equipo') {
    const slot = { arma: 'Arma (1 mano)', dosManos: 'Arma a dos manos', escudo: 'Escudo (1 mano)', yelmo: 'Yelmo', armadura: 'Armadura', botas: 'Botas' }[it.slot];
    return `${slot} · +${it.bonus} Fuerza`;
  }
  if (it.efecto === 'mana') return `+${it.valor} Maná durante un combate`;
  if (it.efecto === 'curacion') return `Recupera ${it.valor} de Vida`;
  if (it.efecto === 'robo') return 'Roba 1 objeto a otro jugador (entre combates)';
  return '';
}

function allItems(h) {
  const inv = h.inv;
  return [inv.yelmo, inv.armadura, inv.botas, ...inv.manos, ...inv.pociones, ...inv.pergaminos].filter(Boolean);
}

function isMyTurnCombat() {
  const p = me();
  if (!p || !p.combat || p.combat.status !== 'activo') return false;
  if (S.phase === 'combat') return p.stage === 'combate';
  if (S.phase === 'torneo') {
    return (S.tournament.matches || []).some((m) => !m.winner && m.attacker === p.id);
  }
  return false;
}

// ------------------------------------------------------------ conexión

socket.on('connect', () => {
  const sess = loadSession();
  if (sess && sess.code && sess.token) {
    socket.emit('join', { code: sess.code, token: sess.token }, (res) => {
      if (!res.ok) { saveSession(null); showHome(); }
    });
  } else {
    showHome();
  }
});

socket.on('disconnect', () => { $('status').textContent = 'Reconectando…'; });

socket.on('state', (state) => {
  S = state;
  render();
});

socket.on('kicked', () => {
  saveSession(null);
  S = null;
  toast('Te han expulsado de la sala');
  showHome();
});

socket.on('chat', ({ from, color, text }) => {
  const box = $('chatLog');
  const div = document.createElement('div');
  div.innerHTML = `${chip(color)} <b>${esc(from)}:</b> ${esc(text)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
});

fetch('/api/datos').then((r) => r.json()).then((d) => { DATA = d; if (S) render(); });

// ------------------------------------------------------------ inicio

function showHome() {
  $('home').classList.remove('hidden');
  $('app').classList.add('hidden');
  $('roomInfo').innerHTML = '';
  $('status').textContent = '';
  const params = new URLSearchParams(location.search);
  if (params.get('sala')) $('codeInput').value = params.get('sala').toUpperCase();
  try { $('nameInput').value = localStorage.getItem('heroes.name') || ''; } catch { /* nada */ }
}

function enter(res) {
  if (!res.ok) { $('homeError').textContent = res.error; return; }
  saveSession({ code: res.code, token: res.token });
  history.replaceState(null, '', `?sala=${res.code}`);
}

function getName() {
  const n = $('nameInput').value.trim();
  try { localStorage.setItem('heroes.name', n); } catch { /* nada */ }
  return n;
}

$('createBtn').onclick = () => {
  const name = getName();
  if (!name) { $('homeError').textContent = 'Escribe tu nombre'; return; }
  socket.emit('create', { name }, enter);
};
$('joinBtn').onclick = () => {
  const name = getName();
  const code = $('codeInput').value.trim().toUpperCase();
  if (!name) { $('homeError').textContent = 'Escribe tu nombre'; return; }
  if (!code) { $('homeError').textContent = 'Escribe el código de la sala'; return; }
  socket.emit('join', { code, name }, enter);
};

$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('chatInput').value.trim();
  if (t) socket.emit('chat', { text: t });
  $('chatInput').value = '';
};

// ------------------------------------------------------------ render

function render() {
  if (!S) return;
  $('home').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('roomInfo').innerHTML = `Sala <code>${esc(S.code)}</code>`;
  $('status').textContent = statusText();

  if (S.phase === 'lobby') {
    $('lobby').classList.remove('hidden');
    $('table').classList.add('hidden');
    $('lobby').innerHTML = renderLobby();
  } else {
    $('lobby').classList.add('hidden');
    $('table').classList.remove('hidden');
    syncCombatUi();
    $('sheet').innerHTML = renderSheet();
    $('main').innerHTML = renderMain();
    $('others').innerHTML = renderOthers();
    const log = $('log');
    log.innerHTML = S.log.map((l) => `<div>${esc(l.text)}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }
  renderModal();
}

function statusText() {
  switch (S.phase) {
    case 'lobby': return 'Preparando la partida';
    case 'prep': return S.round > S.rounds ? 'Preparación para el Torneo' : `Fase 1 · Entre combates · Próxima ronda ${S.round}/${S.rounds}`;
    case 'combat': return `Fase 1 · Aventura · Ronda ${S.round}/${S.rounds}`;
    case 'torneo': return 'Fase 2 · Torneo';
    case 'fin': return 'Partida terminada';
    default: return '';
  }
}

// ---------- Lobby

function heroPreview(raza, clase) {
  if (!DATA || !raza || !clase) return null;
  const r = DATA.razas[raza];
  const c = DATA.clases[clase];
  return { vida: DATA.base.vida + r.vida + c.vida, mana: DATA.base.mana + r.mana + c.mana, fuerza: DATA.base.fuerza + r.fuerza + c.fuerza };
}

function mods(x) {
  const f = (n) => (n > 0 ? `+${n}` : `${n}`);
  return `V ${f(x.vida)} · M ${f(x.mana)} · F ${f(x.fuerza)}`;
}

function renderLobby() {
  const p = me();
  if (!p || !DATA) return '<div class="card">Cargando…</div>';
  const host = S.host === S.me;
  const link = `${location.origin}${location.pathname}?sala=${S.code}`;
  const rows = S.players.map((x) => `
    <div class="player-row">
      ${chip(x.color)}
      <div style="flex:1"><b>${esc(x.name)}</b>${x.id === S.host ? ' 👑' : ''} ${x.bot ? '<span class="badge">bot</span>' : ''}
        ${!x.connected && !x.bot ? '<span class="badge off">desconectado</span>' : ''}
        <div class="muted small">${x.raza && x.clase ? `${raceName(x)} ${className(x)}` : 'Eligiendo héroe…'}</div>
      </div>
      ${host && x.id !== S.me ? `<button class="btn tiny danger" data-a="kick" data-id="${x.id}">Expulsar</button>` : ''}
    </div>`).join('');

  const preview = heroPreview(p.raza, p.clase);
  const ready = S.players.every((x) => x.raza && x.clase);
  return `
  <div class="lobby">
    <div>
      <div class="card">
        <h2>Sala ${esc(S.code)}</h2>
        <p class="muted small">Comparte este enlace o el código con tus amigos:</p>
        <div class="row"><div class="share" style="flex:1">${esc(link)}</div><button class="btn small" data-a="copy" data-text="${esc(link)}">Copiar</button></div>
      </div>
      <div class="card">
        <h3>Jugadores (${S.players.length}/4)</h3>
        ${rows}
        ${S.players.length < 4 ? '<p class="muted small">El reglamento es para 4 jugadores. Puedes completar con bots.</p>' : ''}
        ${host ? `
          <div class="row" style="margin-top:10px">
            <button class="btn small" data-a="addBot" ${S.players.length >= 4 ? 'disabled' : ''}>+ Añadir bot</button>
          </div>
          <h4 style="margin-top:14px">Opciones</h4>
          <div class="row small">Resultados necesarios para golpear en el Torneo:
            ${[4, 5].map((n) => `<button class="btn tiny ${S.settings.pvpHits === n ? 'selected' : ''}" data-a="pvpHits" data-n="${n}">${n}</button>`).join('')}
          </div>
          <div class="row" style="margin-top:14px">
            <button class="btn primary" data-a="start" ${ready ? '' : 'disabled'}>Empezar partida</button>
            ${ready ? '' : '<span class="muted small">Todos deben elegir Raza y Clase</span>'}
          </div>` : `<p class="muted">Esperando a que el anfitrión empiece. Resultados para golpear en el Torneo: <b>${S.settings.pvpHits}</b>.</p>`}
      </div>
    </div>
    <div class="card">
      <h2>Tu héroe</h2>
      <h4>Color</h4>
      <div class="row" style="margin-bottom:12px">
        ${['rojo', 'azul', 'verde', 'amarillo'].map((c) => `<button class="btn small ${p.color === c ? 'selected' : ''}" data-a="color" data-c="${c}">${chip(c)} ${COLOR_LABEL[c]}</button>`).join('')}
      </div>
      <h4>Raza</h4>
      <div class="choice-grid">
        ${Object.entries(DATA.razas).map(([k, r]) => `<button class="btn choice ${p.raza === k ? 'selected' : ''}" data-a="raza" data-k="${k}">${r.nombre}<span class="mods">${mods(r)}</span></button>`).join('')}
      </div>
      <h4>Clase</h4>
      <div class="choice-grid">
        ${Object.entries(DATA.clases).map(([k, c]) => `<button class="btn choice ${p.clase === k ? 'selected' : ''}" data-a="clase" data-k="${k}">${c.nombre}<span class="mods">${mods(c)}</span></button>`).join('')}
      </div>
      ${preview ? `
        <h4>Resultado: ${raceName(p)} ${className(p)}</h4>
        <div class="statline">
          <span class="stat">❤ Vida <b>${preview.vida}</b></span>
          <span class="stat">✨ Maná <b>${preview.mana}</b></span>
          <span class="stat">💪 Fuerza <b>${preview.fuerza}</b></span>
          <span class="stat">🎲 Dados <b>${dicePreview(preview.fuerza)}</b></span>
          <span class="stat">Fijables <b>${preview.mana >= 5 ? Math.min(5, Math.floor(preview.mana / 5)) : 0}</b></span>
        </div>` : '<p class="muted">Elige Raza y Clase.</p>'}
    </div>
  </div>`;
}

function dicePreview(f) {
  if (f >= 21) return 5;
  if (f >= 16) return 4;
  if (f >= 11) return 3;
  if (f >= 6) return 2;
  return 1;
}

function nextDiceHint(f) {
  const steps = [6, 11, 16, 21];
  const n = steps.find((s) => s > f);
  return n ? `${n - f} más para el siguiente dado` : 'máximo de dados';
}

// ---------- Hoja del héroe

function renderSheet() {
  const p = me();
  if (!p || !p.hero) return '';
  const h = p.hero;
  const pct = Math.max(0, Math.min(100, (h.vida / h.base.vida) * 100));
  const inv = h.inv;
  const hands = inv.manos;
  const slot = (k, it) => `<div class="slot"><span class="k">${k}</span>${it ? `<span class="n">${itemIcon(it)} ${esc(it.nombre)}</span>${discardBtn(it)}` : '<span class="n empty">vacío</span>'}</div>`;
  const handRows = hands.length === 0
    ? [slot('Mano', null), slot('Mano', null)]
    : hands[0].slot === 'dosManos'
      ? [slot('Dos manos', hands[0])]
      : [slot('Mano', hands[0]), slot('Mano', hands[1] || null)];

  const cons = (list, max, label) => `
    <h4 style="margin-top:12px">${label} (${list.length}/${max})</h4>
    ${list.length ? list.map((it) => `<div class="slot"><span class="n">${itemIcon(it)} ${esc(it.nombre)}<div class="muted small">${itemDesc(it)}</div></span>${useBtn(it)}${discardBtn(it)}</div>`).join('') : '<div class="muted small">Ninguno</div>'}`;

  return `
  <div class="card">
    <div class="hero-title">${chip(p.color)}<h2 style="margin:0">${esc(p.name)}</h2></div>
    <div class="muted">${raceName(p)} ${className(p)} · color ${COLOR_LABEL[p.color]}</div>
    <div class="row small" style="margin-top:8px"><span>❤ Vida ${h.vida} / ${h.base.vida}</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="stats">
      <div class="box"><div class="v">${h.fuerza}</div><div class="l">Fuerza (base ${h.base.fuerza})</div></div>
      <div class="box"><div class="v">🎲 ${h.dados}</div><div class="l">Dados · ${nextDiceHint(h.fuerza)}</div></div>
      <div class="box"><div class="v">${h.manaDisponible}${h.manaDisponible !== h.mana ? `<span class="small muted"> / ${h.mana}</span>` : ''}</div><div class="l">Maná${h.manaDisponible !== h.mana ? ' (gastado en magia)' : ''}</div></div>
      <div class="box"><div class="v">✨ ${h.fijables}</div><div class="l">Dados fijables</div></div>
    </div>
    ${h.curses ? `<div class="warn">☠ Maldito: repetirás ${h.curses} dado(s) exitoso(s) en tu próximo combate.</div>` : ''}
    <div class="muted small">Victorias: ${h.victorias} · Caídas: ${h.caidas} · Torneo (F+M): ${h.puntuacion}</div>
    <h4 style="margin-top:12px">Equipo</h4>
    ${slot('Yelmo', inv.yelmo)}
    ${slot('Armadura', inv.armadura)}
    ${slot('Botas', inv.botas)}
    ${handRows.join('')}
    ${cons(inv.pociones, 3, 'Pociones')}
    ${cons(inv.pergaminos, 3, 'Pergaminos')}
  </div>`;
}

function discardBtn(it) {
  if (S.phase !== 'prep' && S.phase !== 'combat') return '';
  return `<button class="btn tiny" title="Descartar" data-a="discard" data-id="${it.id}">✕</button>`;
}

function useBtn(it) {
  const p = me();
  const h = p.hero;
  const myCombat = isMyTurnCombat();
  let ok = false;
  if (it.efecto === 'mana') ok = myCombat && !p.combat.manaUsed;
  if (it.efecto === 'curacion') ok = h.vida < h.base.vida && (S.phase === 'prep' || S.phase === 'combat' || (S.phase === 'torneo' && myCombat));
  if (it.efecto === 'robo') ok = S.phase === 'prep';
  if (!ok) return '';
  return `<button class="btn tiny" data-a="use" data-id="${it.id}" data-efecto="${it.efecto}">Usar</button>`;
}

// ---------- Otros jugadores

function renderOthers() {
  return others().map((p) => {
    const h = p.hero;
    const pct = Math.max(0, Math.min(100, (h.vida / h.base.vida) * 100));
    let st = '';
    if (S.phase === 'prep') st = p.ready ? '<span class="badge ok">listo</span>' : '<span class="badge">preparándose</span>';
    if (S.phase === 'combat') st = { elegir: 'eligiendo monstruo', combate: 'combatiendo', recompensa: 'eligiendo recompensa', hecho: 'ha terminado' }[p.stage] || '';
    if (S.phase === 'combat') st = `<span class="badge ${p.stage === 'hecho' ? 'ok' : ''}">${st}</span>`;
    const mini = p.combat && S.phase === 'combat' && p.stage === 'combate'
      ? `<div class="mini-combat"><span class="small muted">${esc(p.combat.label)}:</span>${p.combat.dice.map((d) => die(d.face, { sm: true, cls: d.fixed ? 'fixed' : '' })).join('')}<span class="small muted">tirada ${p.combat.rolls}/3</span></div>`
      : '';
    const equip = allItems(h).map((it) => `${itemIcon(it)} ${esc(it.nombre)}`).join(' · ');
    return `
    <div class="card other">
      <div class="top">${chip(p.color)}<span class="name">${esc(p.name)}</span>${p.bot ? '<span class="badge">bot</span>' : ''}${!p.connected && !p.bot ? '<span class="badge off">desconectado</span>' : ''}${st}</div>
      <div class="meta">${raceName(p)} ${className(p)}</div>
      <div class="meta">❤ ${h.vida}/${h.base.vida} · 💪 ${h.fuerza} (🎲${h.dados}) · ✨ ${h.manaDisponible}${h.curses ? ` · ☠${h.curses}` : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="meta">${equip || 'Sin objetos'}</div>
      ${mini}
    </div>`;
  }).join('');
}

// ---------- Panel central

function renderMain() {
  switch (S.phase) {
    case 'prep': return renderPrep();
    case 'combat': return renderRound();
    case 'torneo': return renderTournament();
    case 'fin': return renderEnd();
    default: return '';
  }
}

function renderPrep() {
  const p = me();
  const torneo = S.round > S.rounds;
  const waiting = S.players.filter((x) => !x.ready).map((x) => esc(x.name));
  return `
  <div class="card">
    <h2>${torneo ? 'Preparación para el Torneo' : `Entre combates · Ronda ${S.round} de ${S.rounds}`}</h2>
    <p class="muted">${torneo
      ? 'Última oportunidad para comerciar, curarte o lanzar magia. Después empieza el Torneo.'
      : 'Prepara tu equipo antes de conocer los monstruos de la próxima ronda. Puedes comerciar, curarte, robar con pergaminos o lanzar magia contra otros.'}</p>
    <div class="row">
      ${p.ready
        ? '<button class="btn" data-a="ready" data-v="0">Cancelar «Listo»</button>'
        : `<button class="btn primary" data-a="ready" data-v="1">${torneo ? '¡Listo para el Torneo!' : '¡Listo para la ronda!'}</button>`}
      <span class="muted small">${waiting.length ? `Faltan: ${waiting.join(', ')}` : ''}</span>
    </div>
  </div>
  ${ui.theft ? renderTheft() : ''}
  ${renderMagic()}
  ${renderTrade()}`;
}

function renderTheft() {
  const target = ui.theft.targetId && byId(ui.theft.targetId);
  return `
  <div class="card">
    <h3>📜 Pergamino de Robo</h3>
    <div class="row" style="margin-bottom:8px">
      ${others().map((o) => `<button class="btn small ${ui.theft.targetId === o.id ? 'selected' : ''}" data-a="theftTarget" data-id="${o.id}">${chip(o.color)} ${esc(o.name)}</button>`).join('')}
      <button class="btn small" data-a="theftCancel">Cancelar</button>
    </div>
    ${target ? (allItems(target.hero).length ? allItems(target.hero).map((it) => `
      <div class="slot"><span class="n">${itemIcon(it)} ${esc(it.nombre)} <span class="muted small">${itemDesc(it)}</span></span>
      <button class="btn tiny primary" data-a="steal" data-id="${it.id}">Robar</button></div>`).join('') : '<p class="muted">No tiene objetos.</p>') : '<p class="muted">Elige a quién robar.</p>'}
  </div>`;
}

function renderMagic() {
  const p = me();
  const h = p.hero;
  if (S.round <= 1) return '';
  const avail = h.manaDisponible;
  const amounts = [];
  for (let a = 5; a <= avail; a += 5) amounts.push(a);
  if (!amounts.includes(ui.curse.amount)) ui.curse.amount = amounts[0] || 5;
  return `
  <div class="card">
    <h3>🔮 Magia contra otro héroe</h3>
    <p class="muted small">Cada 5 de Maná obliga al objetivo a repetir 1 dado exitoso en su próximo combate. Ese Maná quedará gastado para tu próximo combate.</p>
    ${amounts.length ? `
      <div class="row" style="margin-bottom:8px">
        ${others().map((o) => `<button class="btn small ${ui.curse.target === o.id ? 'selected' : ''}" data-a="curseTarget" data-id="${o.id}">${chip(o.color)} ${esc(o.name)}</button>`).join('')}
      </div>
      <div class="row">
        ${amounts.map((a) => `<button class="btn tiny ${ui.curse.amount === a ? 'selected' : ''}" data-a="curseAmount" data-n="${a}">${a} Maná (${a / 5} dado${a > 5 ? 's' : ''})</button>`).join('')}
        <button class="btn small primary" data-a="curse" ${ui.curse.target ? '' : 'disabled'}>Lanzar maldición</button>
      </div>` : '<p class="muted small">Necesitas al menos 5 de Maná disponible.</p>'}
  </div>`;
}

function renderTrade() {
  const p = me();
  const incoming = S.trades.filter((t) => t.to === S.me);
  const outgoing = S.trades.filter((t) => t.from === S.me);
  const names = (owner, ids) => ids.map((id) => { const it = allItems(owner.hero).find((x) => x.id === id); return it ? `${itemIcon(it)} ${esc(it.nombre)}` : '(ya no existe)'; }).join(', ') || 'nada';
  const target = ui.trade.to && byId(ui.trade.to);
  const pickList = (owner, set, kind) => {
    const items = allItems(owner.hero);
    if (!items.length) return '<div class="muted small">Sin objetos</div>';
    return `<div class="list-select">${items.map((it) => `<label><input type="checkbox" data-a="tradePick" data-kind="${kind}" data-id="${it.id}" ${set.has(it.id) ? 'checked' : ''}> ${itemIcon(it)} ${esc(it.nombre)}</label>`).join('')}</div>`;
  };
  return `
  <div class="card">
    <h3>🤝 Comercio</h3>
    ${incoming.map((t) => { const from = byId(t.from); return `
      <div class="match" style="margin-bottom:8px">
        <b>${esc(from.name)}</b> te ofrece <b>${names(from, t.give)}</b> a cambio de <b>${names(p, t.want)}</b>
        <div class="row" style="margin-top:6px"><button class="btn small primary" data-a="tradeResp" data-id="${t.id}" data-ok="1">Aceptar</button><button class="btn small" data-a="tradeResp" data-id="${t.id}" data-ok="0">Rechazar</button></div>
      </div>`; }).join('')}
    ${outgoing.map((t) => { const to = byId(t.to); return `
      <div class="match" style="margin-bottom:8px">Ofreces a <b>${esc(to.name)}</b>: ${names(p, t.give)} por ${names(to, t.want)}
        <button class="btn tiny" data-a="tradeResp" data-id="${t.id}" data-ok="0">Retirar</button></div>`; }).join('')}
    <div class="row" style="margin-bottom:8px">
      <span class="small muted">Proponer a:</span>
      ${others().map((o) => `<button class="btn small ${ui.trade.to === o.id ? 'selected' : ''}" data-a="tradeTo" data-id="${o.id}">${chip(o.color)} ${esc(o.name)}</button>`).join('')}
    </div>
    ${target ? `
      <div class="offers">
        <div><h4>Das</h4>${pickList(p, ui.trade.give, 'give')}</div>
        <div><h4>Pides a ${esc(target.name)}</h4>${pickList(target, ui.trade.want, 'want')}</div>
      </div>
      <button class="btn small primary" style="margin-top:8px" data-a="tradeSend" ${ui.trade.give.size || ui.trade.want.size ? '' : 'disabled'}>Enviar oferta</button>` : ''}
  </div>`;
}

function renderRound() {
  const p = me();
  let body = '';
  if (p.stage === 'elegir') {
    body = `
    <div class="card">
      <h2>Ronda ${S.round}: elige tu monstruo</h2>
      <p class="muted small">Tienes ${p.hero.dados} dado(s) y puedes fijar ${p.hero.fijables} con el Maná.</p>
      <div class="offers">${p.offers.map((m, i) => monsterCard(m, i, p)).join('')}</div>
    </div>`;
  } else if (p.stage === 'combate') {
    body = `<div class="card">${renderCombat(p, true)}</div>`;
  } else if (p.stage === 'recompensa') {
    body = `
    <div class="card">
      ${renderCombat(p, false)}
      <h2 style="margin-top:14px">🎁 Elige tu recompensa</h2>
      <div class="offers">${p.rewards.map((it, i) => `
        <div class="monster"><div class="name" style="font-size:1.1em">${itemIcon(it)} ${esc(it.nombre)}</div><div class="muted">${itemDesc(it)}</div>
        <button class="btn primary" data-a="reward" data-i="${i}">Elegir</button></div>`).join('')}</div>
    </div>`;
  } else {
    body = `
    <div class="card">
      ${p.combat ? renderCombat(p, false) : ''}
      <p class="muted" style="margin-top:10px">Esperando a que terminen los demás héroes…</p>
    </div>`;
  }
  return body;
}

function monsterCard(m, i, p) {
  const tooHard = m.combo.length > p.hero.dados;
  return `
  <div class="monster">
    <div class="lvl">Nivel ${m.level} · si pierdes: −${m.dano} Vida</div>
    <div class="name">${esc(m.nombre)}</div>
    ${comboHtml(m.combo, false)}
    ${tooHard ? `<div class="warn">⚠ Necesitas ${m.combo.length} dados y solo tienes ${p.hero.dados}: no puedes ganar.</div>` : ''}
    <h4 style="margin:6px 0 0">Recompensas posibles (elegirás 1)</h4>
    ${m.rewards.map((it) => `<div class="reward"><span class="item-ico">${itemIcon(it)}</span><span>${esc(it.nombre)}<div class="muted small">${itemDesc(it)}</div></span></div>`).join('')}
    <button class="btn primary" data-a="monster" data-i="${i}">Luchar</button>
  </div>`;
}

function syncCombatUi() {
  const p = me();
  const cb = p && p.combat;
  const key = cb ? `${S.phase}|${S.round}|${cb.label}|${cb.rolls}|${cb.manaUsed}|${(S.tournament && S.tournament.matches.length) || 0}|${cb.events.length}` : '';
  if (key !== ui.combatKey) {
    ui.combatKey = key;
    ui.held = new Set();
    ui.manaMode = false;
    ui.manaPick = new Map();
    ui.manaSel = null;
    if (cb) cb.dice.forEach((d, i) => { if (d.fixed) ui.held.add(i); });
  }
}

function renderCombat(p, controllable) {
  const cb = p.combat;
  const mine = p.id === S.me;
  const faces = cb.dice.map((d, i) => (mine && ui.manaPick.has(i) ? ui.manaPick.get(i) : d.face));
  const { used } = matchDice(faces, cb.combo);
  const fijables = mine ? p.hero.fijables : null;
  const diceHtml = cb.dice.length
    ? cb.dice.map((d, i) => {
      const cls = [
        used.has(i) ? 'success' : '',
        d.fixed ? 'fixed' : '',
        controllable && !ui.manaMode && ui.held.has(i) && !d.fixed ? 'held' : '',
        controllable && ui.manaMode && (ui.manaSel === i || ui.manaPick.has(i)) ? 'picking' : '',
      ].join(' ');
      return die(faces[i], { cls, attrs: controllable ? `data-a="die" data-i="${i}"` : '' });
    }).join('')
    : Array.from({ length: cb.diceCount }, () => die(null)).join('');

  let controls = '';
  let result = '';
  if (cb.status === 'victoria') result = `<div class="result win">¡Victoria!</div>`;
  else if (cb.status === 'derrota') result = `<div class="result lose">Derrota</div>`;
  else if (cb.status === 'cancelado') result = `<div class="muted">Combate terminado</div>`;

  if (controllable && cb.status === 'activo') {
    if (ui.manaMode) {
      controls = `
        <div class="muted small">Toca un dado y elige su resultado. Puedes fijar hasta ${fijables} dado(s). (${ui.manaPick.size}/${fijables})</div>
        ${ui.manaSel !== null ? `<div class="palette">${FACES.map((f) => die(f, { attrs: `data-a="pick" data-f="${f}"` })).join('')}</div>` : ''}
        <div class="row">
          <button class="btn primary" data-a="manaOk" ${ui.manaPick.size ? '' : 'disabled'}>Confirmar Maná</button>
          <button class="btn" data-a="manaCancel">Cancelar</button>
        </div>`;
    } else {
      const left = 3 - cb.rolls;
      const rerollN = cb.dice.filter((d, i) => !d.fixed && !ui.held.has(i)).length;
      controls = `
        ${cb.rolls > 0 && left > 0 ? '<div class="muted small">Toca los dados que quieres conservar y relanza el resto.</div>' : ''}
        <div class="row">
          ${cb.rolls === 0 ? '<button class="btn primary" data-a="roll">🎲 Tirar dados</button>' : ''}
          ${cb.rolls > 0 && left > 0 ? `<button class="btn primary" data-a="roll" ${rerollN ? '' : 'disabled'}>🎲 Relanzar ${rerollN} dado(s)</button>` : ''}
          ${cb.rolls > 0 && !cb.manaUsed && fijables > 0 ? `<button class="btn" data-a="manaMode">✨ Usar Maná (fijar ${fijables})</button>` : ''}
          ${cb.rolls > 0 ? `<button class="btn ${cb.rolls >= 3 ? 'danger' : 'small'}" data-a="concede">${cb.rolls >= 3 ? 'Aceptar derrota' : 'Rendirse'}</button>` : ''}
        </div>`;
    }
  }

  const holder = mine ? 'Tus dados' : `Dados de ${esc(p.name)}`;
  return `
  <div class="combat">
    <div class="row"><h2 style="margin:0">${esc(cb.label)}</h2><span class="spacer"></span>
      <span class="pill">Tirada ${cb.rolls}/3</span>
      <span class="pill">${cb.manaUsed ? 'Maná usado' : `Maná ${mine ? p.hero.manaCombate : ''} sin usar`}</span>
      ${cb.cursesLeft ? `<span class="pill">☠ ${cb.cursesLeft} maldición(es)</span>` : ''}
    </div>
    <div class="targetline"><span class="muted">Necesitas:</span>${comboHtml(cb.combo)}</div>
    <div><div class="muted small" style="margin-bottom:8px">${holder}</div><div class="dice">${diceHtml}</div></div>
    ${result}
    ${controls}
    <div class="events">${cb.events.slice().reverse().map((e) => `<div>${esc(e)}</div>`).join('')}</div>
  </div>`;
}

function renderTournament() {
  const t = S.tournament;
  const rank = `
    <div class="card">
      <h2>🏆 Torneo</h2>
      <p class="muted small">Para golpear hay que sacar ${S.settings.pvpHits} resultados del color del rival (el blanco vale como comodín). Cada golpe quita 3 de Vida.</p>
      <h4>Clasificación (Fuerza + Maná)</h4>
      ${t.ranking.map((id, i) => { const x = byId(id); return `<div class="fighter">${i + 1}. ${chip(x.color)} ${esc(x.name)} <span class="hp">${x.hero.puntuacion}</span></div>`; }).join('')}
    </div>`;
  let choose = '';
  if (t.stage === 'eleccion') {
    if (t.ranking[0] === S.me) {
      choose = `<div class="card"><h3>Elige rival para tu semifinal</h3><div class="row">
        ${t.ranking.slice(1).map((id) => { const x = byId(id); return `<button class="btn" data-a="rival" data-id="${id}">${chip(x.color)} ${esc(x.name)} · ❤${x.hero.vida} · F+M ${x.hero.puntuacion}</button>`; }).join('')}
      </div></div>`;
    } else {
      choose = `<div class="card muted">${esc(byId(t.ranking[0]).name)} está eligiendo rival…</div>`;
    }
  }
  const matches = t.matches.slice().reverse().map((m) => {
    const a = byId(m.a);
    const b = byId(m.b);
    const live = !m.winner;
    const att = byId(m.attacker);
    const fighter = (x) => `<div class="fighter ${m.winner === x.id ? 'win' : ''}">${chip(x.color)} ${esc(x.name)} ${live && m.attacker === x.id ? '⚔' : ''}<span class="hp">❤ ${x.hero.vida}</span></div>`;
    return `
    <div class="card match ${live ? 'live' : ''}">
      <h3>${esc(m.label)}${m.winner ? ` · gana ${esc(byId(m.winner).name)}` : ''}</h3>
      <div class="vs">${fighter(a)}${fighter(b)}</div>
      ${live && att.combat ? `<div style="margin-top:12px">${renderCombat(att, att.id === S.me)}</div>` : ''}
    </div>`;
  }).join('');
  const bye = t.bye ? `<div class="card muted">${esc(byId(t.bye).name)} espera en la final.</div>` : '';
  const myMatch = t.matches.find((m) => !m.winner && (m.a === S.me || m.b === S.me));
  const spectator = !myMatch && t.stage !== 'eleccion' ? '<div class="card muted">Estás como espectador.</div>' : '';
  return choose + matches + bye + spectator + rank;
}

function renderEnd() {
  const w = byId(S.winner);
  return `
  <div class="card winner-banner">
    <div class="crown">👑</div>
    <h1>${esc(w.name)}</h1>
    <p>${raceName(w)} ${className(w)} gana la partida con ${w.hero.vida} de Vida.</p>
    <button class="btn primary" data-a="leave">Volver al inicio</button>
  </div>
  ${S.tournament ? renderTournamentHistory() : ''}`;
}

function renderTournamentHistory() {
  return S.tournament.matches.map((m) => `<div class="card match"><b>${esc(m.label)}</b>: ${esc(byId(m.a).name)} vs ${esc(byId(m.b).name)} → gana <b>${esc(byId(m.winner).name)}</b></div>`).join('');
}

// ---------- Modal de objeto pendiente

function renderModal() {
  const p = me();
  const modal = $('modal');
  const pend = p && p.hero && p.hero.pending && p.hero.pending[0];
  if (!pend || !pend.item) { modal.classList.add('hidden'); modal.innerHTML = ''; return; }
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="card">
      <h2>${itemIcon(pend.item)} ${esc(pend.item.nombre)}</h2>
      <p class="muted">${itemDesc(pend.item)}</p>
      <p>No tienes espacio libre para este objeto. ¿Qué haces?</p>
      <div class="opts">${pend.options.map((o) => `<button class="btn ${o.id === 'descartar' ? '' : 'primary'}" data-a="pending" data-c="${o.id}">${esc(o.label)}</button>`).join('')}</div>
    </div>`;
}

// ------------------------------------------------------------ eventos

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  const a = el.dataset.a;
  const d = el.dataset;
  switch (a) {
    case 'copy':
      navigator.clipboard?.writeText(d.text).then(() => toast('Enlace copiado'), () => {});
      break;
    case 'kick': act('kick', { playerId: d.id }); break;
    case 'addBot': act('addBot'); break;
    case 'pvpHits': act('setSettings', { pvpHits: Number(d.n) }); break;
    case 'start': act('start'); break;
    case 'color': act('setColor', { color: d.c }); break;
    case 'raza': act('setHero', { raza: d.k }); break;
    case 'clase': act('setHero', { clase: d.k }); break;
    case 'ready': act('ready', { value: d.v === '1' }); break;
    case 'discard':
      if (confirm('¿Descartar este objeto?')) act('discard', { itemId: d.id });
      break;
    case 'use':
      if (d.efecto === 'robo') { ui.theft = { itemId: d.id, targetId: null }; render(); }
      else act('useItem', { itemId: d.id });
      break;
    case 'theftTarget': ui.theft.targetId = d.id; render(); break;
    case 'theftCancel': ui.theft = null; render(); break;
    case 'steal':
      act('useItem', { itemId: ui.theft.itemId, targetId: ui.theft.targetId, targetItemId: d.id });
      ui.theft = null;
      break;
    case 'curseTarget': ui.curse.target = d.id; render(); break;
    case 'curseAmount': ui.curse.amount = Number(d.n); render(); break;
    case 'curse': act('curse', { targetId: ui.curse.target, amount: ui.curse.amount }); break;
    case 'tradeTo': ui.trade = { to: d.id, give: new Set(), want: new Set() }; render(); break;
    case 'tradePick': {
      const set = d.kind === 'give' ? ui.trade.give : ui.trade.want;
      el.checked ? set.add(d.id) : set.delete(d.id);
      render();
      break;
    }
    case 'tradeSend':
      act('proposeTrade', { toId: ui.trade.to, give: [...ui.trade.give], want: [...ui.trade.want] });
      ui.trade = { to: null, give: new Set(), want: new Set() };
      break;
    case 'tradeResp': act('respondTrade', { tradeId: d.id, accept: d.ok === '1' }); break;
    case 'monster': act('chooseMonster', { index: Number(d.i) }); break;
    case 'reward': act('chooseReward', { index: Number(d.i) }); break;
    case 'die': {
      const i = Number(d.i);
      const cb = me().combat;
      if (!cb || cb.rolls === 0 || cb.dice[i].fixed) break;
      if (ui.manaMode) {
        if (ui.manaPick.has(i)) { ui.manaPick.delete(i); ui.manaSel = null; }
        else if (ui.manaPick.size < me().hero.fijables) ui.manaSel = i;
      } else if (cb.rolls < 3) {
        ui.held.has(i) ? ui.held.delete(i) : ui.held.add(i);
      }
      render();
      break;
    }
    case 'pick':
      if (ui.manaSel !== null) { ui.manaPick.set(ui.manaSel, d.f); ui.manaSel = null; render(); }
      break;
    case 'roll': act('roll', { hold: [...ui.held] }); break;
    case 'manaMode': ui.manaMode = true; ui.manaPick = new Map(); ui.manaSel = null; render(); break;
    case 'manaCancel': ui.manaMode = false; ui.manaPick = new Map(); ui.manaSel = null; render(); break;
    case 'manaOk':
      act('mana', { assign: [...ui.manaPick].map(([index, face]) => ({ index, face })) });
      break;
    case 'concede':
      if (confirm('¿Aceptar la derrota?')) act('concede');
      break;
    case 'rival': act('chooseRival', { rivalId: d.id }); break;
    case 'pending': act('resolvePending', { choice: d.c }); break;
    case 'leave':
      saveSession(null);
      S = null;
      history.replaceState(null, '', location.pathname);
      location.reload();
      break;
    default: break;
  }
});
