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
  detail: null,
  rules: false,
  rulesTab: 'heroe',
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

// Retrato del héroe (Raza + Clase). Si aún no hay ilustración, un marco vacío.
function portrait(raza, clase, size = 'md', _color = null, extra = '') {
  const key = raza && clase ? `${raza}-${clase}` : null;
  const has = key && DATA && (DATA.retratos || []).includes(key);
  const alt = raza && clase && DATA ? `${DATA.razas[raza].nombre} ${DATA.clases[clase].nombre}` : 'Héroe';
  const src = `img/heroes/${key}.webp`;
  if (has) return `<img class="portrait ${size}" src="${src}" alt="${esc(alt)}" ${extra}>`;
  return `<div class="portrait ${size} missing" ${extra}>${raza && clase ? 'Retrato pendiente' : '?'}</div>`;
}
function heroPortrait(p, size = 'md') { return portrait(p.raza, p.clase, size, p.color); }

// Ilustración del monstruo (si existe).
function monsterArt(m, cls = 'monster-art') {
  if (!m || !m.imagen || !DATA) return '';
  const key = `${m.imagen}-${m.variante || 1}`;
  if (!(DATA.ilustracionesMonstruos || []).includes(key)) return '';
  return `<img class="${cls}" src="img/monstruos/${key}.webp" alt="${esc(m.nombre)}" loading="lazy">`;
}

const SHAPE_LABEL = { circulo: 'Círculo', cuadrado: 'Cuadrado', rombo: 'Rombo', triangulo: 'Triángulo', estrella: 'Estrella (comodín)', cruz: 'Cruz' };
const WILD = { color: 'blanco', forma: 'estrella' };

// Una esfera: figura de su forma rellena de su color (img/formas). Sin color = solo
// el contorno de la forma (lo que pide un monstruo de formas). Sin forma = esfera de color.
function die(face, { cls = '', attrs = '', sm = false, shape = null } = {}) {
  const title = [FACE_LABEL[face], SHAPE_LABEL[shape]].filter(Boolean).join(' · ');
  if (shape) {
    const src = `img/formas/${shape}-${face || 'tinta'}.webp`;
    return `<div class="die piece ${sm ? 'sm' : ''} ${face || 'tinta'} ${cls}" ${attrs} title="${title}"><img src="${src}" alt="${title}" draggable="false"></div>`;
  }
  const f = face || 'empty';
  return `<div class="die ${sm ? 'sm' : ''} ${f} ${cls}" ${attrs} title="${title}"></div>`;
}

function comboHtml(combo, sm = true, tipo = 'color') {
  return `<div class="dice ${combo.length >= 5 ? 'five' : ''}">${combo.map((c) => (tipo === 'forma' ? die(null, { sm, cls: 'target', shape: c }) : die(c, { sm, cls: 'target' }))).join('')}</div>`;
}

function matchDice(faces, combo, wild = 'blanco') {
  const needs = {};
  combo.forEach((c) => (needs[c] = (needs[c] || 0) + 1));
  const used = new Set();
  faces.forEach((f, i) => { if (f && f !== wild && needs[f] > 0) { needs[f]--; used.add(i); } });
  let missing = Object.values(needs).reduce((a, b) => a + b, 0);
  faces.forEach((f, i) => { if (missing > 0 && f === wild) { used.add(i); missing--; } });
  return { used, missing };
}

// Cómo van las esferas frente a cada monstruo del combate.
function targetMatch(cb, t, faces) {
  const vals = t.tipo === 'forma' ? cb.dice.map((d) => d.shape) : (faces || cb.dice.map((d) => d.face));
  const r = matchDice(vals, t.combo, WILD[t.tipo] || 'blanco');
  return { ...r, ok: r.missing === 0 };
}
function bestTarget(cb, faces) {
  const targets = cb.targets || [{ tipo: 'color', combo: cb.combo }];
  const st = targets.map((t) => targetMatch(cb, t, faces));
  let best = 0;
  st.forEach((x, i) => { if (x.missing < st[best].missing) best = i; });
  return { ...st[best], index: best, all: st };
}

function itemIcon(it) {
  const key = `${it.tipo === 'equipo' ? it.forma || it.slot : it.tipo}-${it.grado || 1}`;
  if (DATA && (DATA.ilustracionesObjetos || []).includes(key)) {
    return `<img class="item-img" src="img/objetos/${key}.webp" alt="">`;
  }
  if (it.tipo === 'pocion') return '🧪';
  if (it.tipo === 'pergamino') return '📜';
  return { arma: '🗡', dosManos: '⚔', escudo: '🛡', yelmo: '⛑', armadura: '🥋', botas: '🥾' }[it.slot] || '•';
}

function itemDesc(it) {
  if (it.tipo === 'equipo') {
    const slot = { arma: 'Arma · ocupa 1 mano', dosManos: 'Arma · ocupa las 2 manos', escudo: 'Escudo · ocupa 1 mano', yelmo: 'Yelmo', armadura: 'Armadura', tunica: 'Túnica', botas: 'Botas' }[it.slot];
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
  document.body.classList.add('at-home');
  $('roomInfo').innerHTML = '';
  Sounds.setMusic(true);
  $('status').textContent = '';
  try { $('nameInput').value = localStorage.getItem('heroes.name') || ''; } catch { /* nada */ }
}

function invitedCode() {
  const c = new URLSearchParams(location.search).get('sala');
  return c ? c.toUpperCase() : null;
}

// Ventana de «Jugar»: crear una partida o entrar en una existente (como en Imperio).
let homeJoining = false;
function renderHomeActions() {
  const inv = invitedCode();
  let html;
  if (inv) {
    html = `<button class="seal" data-h="join">Entrar en<br>la sala ${esc(inv)}</button>`;
  } else if (homeJoining) {
    html = `<input id="codeInput" class="ink-input code-input" maxlength="4" placeholder="Código" aria-label="Código de la sala">
      <button class="seal" data-h="join">Entrar</button>
      <button class="link-btn" data-h="back">volver</button>`;
  } else {
    html = `<button class="seal" data-h="create">Crear<br>partida</button>
      <span class="home-or">o</span>
      <button class="seal" data-h="joining">Unirse</button>`;
  }
  $('homeActions').innerHTML = html;
  if (homeJoining && $('codeInput')) $('codeInput').focus();
}

$('playBtn').onclick = () => {
  homeJoining = false;
  $('homeError').textContent = '';
  renderHomeActions();
  $('homeModal').classList.remove('hidden');
  $('nameInput').focus();
};
$('homeClose').onclick = () => $('homeModal').classList.add('hidden');
$('homeModal').onclick = (e) => { if (e.target === $('homeModal')) $('homeModal').classList.add('hidden'); };

function enter(res) {
  if (!res.ok) { $('homeError').textContent = res.error; return; }
  saveSession({ code: res.code, token: res.token });
  history.replaceState(null, '', `?sala=${res.code}`);
  $('homeModal').classList.add('hidden');
  document.body.classList.remove('at-home');
}

function getName() {
  const n = $('nameInput').value.trim();
  try { localStorage.setItem('heroes.name', n); } catch { /* nada */ }
  return n;
}

$('homeActions').addEventListener('click', (e) => {
  const b = e.target.closest('[data-h]');
  if (!b) return;
  const h = b.dataset.h;
  if (h === 'joining') { homeJoining = true; renderHomeActions(); return; }
  if (h === 'back') { homeJoining = false; renderHomeActions(); return; }
  const name = getName();
  if (!name) { $('homeError').textContent = 'Escribe tu nombre'; $('nameInput').focus(); return; }
  if (h === 'create') socket.emit('create', { name }, enter);
  if (h === 'join') {
    const code = invitedCode() || ($('codeInput') ? $('codeInput').value.trim().toUpperCase() : '');
    if (!code) { $('homeError').textContent = 'Escribe el código de la sala'; return; }
    socket.emit('join', { code, name }, enter);
  }
});

$('chatForm').onsubmit = (e) => {
  e.preventDefault();
  const t = $('chatInput').value.trim();
  if (t) socket.emit('chat', { text: t });
  $('chatInput').value = '';
};

// ------------------------------------------------------------ render

function render() {
  if (!S) return;
  const mp = me();
  if (mp && mp.monster) ui.lastMonster = mp.monster;
  $('home').classList.add('hidden');
  $('homeModal').classList.add('hidden');
  document.body.classList.remove('at-home');
  $('app').classList.remove('hidden');
  $('roomInfo').innerHTML = `<span class="room-name">Sala ${esc(S.code)}</span><button class="exit-btn" data-a="exit" title="Salir de la sala" aria-label="Salir de la sala">×</button>`;
  Sounds.setMusic(S.phase === 'lobby');
  playEventSounds();
  $('status').textContent = statusText();

  if (S.phase === 'lobby') {
    $('lobby').classList.remove('hidden');
    $('table').classList.add('hidden');
    $('lobby').innerHTML = renderLobby();
  } else {
    $('lobby').classList.add('hidden');
    $('table').classList.remove('hidden');
    syncCombatUi();
    $('arena').innerHTML = renderArena();
    $('sheet').innerHTML = renderSheet();
    $('main').innerHTML = renderMain();
  }
  $('journalBtn').classList.remove('hidden');
  const log = $('log');
  log.innerHTML = S.log.map((l) => `<div>${esc(l.text)}</div>`).join('');
  log.scrollTop = log.scrollHeight;
  detectNewItems();
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
  return { vida: DATA.base.vida + r.vida + c.vida, mana: DATA.base.mana + r.mana + c.mana, fuerza: Math.max(DATA.minFuerza || 0, DATA.base.fuerza + r.fuerza + c.fuerza) };
}

function mods(x) {
  const f = (n) => (n > 0 ? `+${n}` : `${n}`);
  return `V ${f(x.vida)} · M ${f(x.mana)} · F ${f(x.fuerza)}`;
}

function renderLobby() {
  const p = me();
  if (!p || !DATA) return '<div class="card">Cargando…</div>';
  return S.lobbyStage === 'heroes' ? renderLobbyHeroes(p) : renderLobbyRivals(p);
}

// Paso 1: elegir contrincantes (amigos que entran con el enlace o bots).
function renderLobbyRivals(p) {
  const host = S.host === S.me;
  const link = `${location.origin}${location.pathname}?sala=${S.code}`;
  // Figuras de adorno para cada asiento (solo ilustración, no es su héroe).
  const deco = ['humano-guerrero', 'elfo-mago', 'enano-guerrero', 'faunar-guerrero'];
  const seats = [];
  for (let i = 0; i < 4; i++) {
    const x = S.players[i];
    const img = `<img class="seat-art" src="img/heroes/${deco[i]}.webp" alt="">`;
    if (x) {
      const role = x.id === S.me ? 'Tú' : x.id === S.host ? 'Anfitrión' : x.bot ? 'Compañero automático' : x.connected ? 'Amigo' : 'Desconectado';
      seats.push(`
        <div class="seat-card taken">
          ${img}
          <div class="seat-name">${esc(x.name)}</div>
          <div class="seat-role">${role}</div>
          ${host && x.id !== S.me ? `<button class="link-btn" data-a="kick" data-id="${x.id}">Quitar</button>` : '<span class="seat-gap"></span>'}
        </div>`);
    } else {
      seats.push(`
        <div class="seat-card empty">
          ${img}
          <div class="seat-name"><i>Asiento libre</i></div>
          <div class="seat-role">Esperando a un amigo…</div>
          ${host ? '<button class="btn small" data-a="addBot">Poner un bot</button>' : '<span class="seat-gap"></span>'}
        </div>`);
    }
  }
  return `
  <div class="lobby-step room card">
    <div class="room-head">
      <div class="room-label">Sala</div>
      <div class="room-big-code">${esc(S.code)}</div>
      <div class="row center-row"><button class="btn" data-a="copy" data-text="${esc(link)}">Invitar</button></div>
    </div>
    <div class="seat-grid">${seats.join('')}</div>
    ${host ? `
      <div class="row center-row"><button class="seal" data-a="lobbyStage" data-s="heroes">Elegir<br>héroes</button></div>`
    : '<p class="center muted">El anfitrión está preparando la mesa…</p>'}
  </div>`;
}

// Paso 2: cada uno configura su héroe viendo lo que eligen los demás.
function renderLobbyHeroes(p) {
  const host = S.host === S.me;
  const preview = heroPreview(p.raza, p.clase);
  const showClass = p.clase || 'guerrero';
  const others = S.players.filter((x) => x.id !== S.me).map((x) => `
    <div class="mini-hero">
      ${x.raza ? portrait(x.raza, x.clase || 'guerrero', 'other', x.color) : '<div class="portrait other missing">?</div>'}
      <div class="mini-name"><b>${esc(x.name)}</b> ${x.ready ? '<span class="check">✔</span>' : ''}</div>
      <div class="muted small">${x.raza ? raceName(x) : 'eligiendo…'}${x.clase ? ` · ${className(x)}` : ''}</div>
    </div>`).join('');
  return `
  <div class="lobby-heroes v2 card">
    <div class="pick-center">
      ${p.raza ? portrait(p.raza, showClass, 'pick', p.color) : '<div class="portrait pick missing">Elige una raza</div>'}
      <div class="pick-name">${p.raza ? esc(raceName(p)) : ''}${p.clase ? ` · ${esc(className(p))}` : ''}</div>
      ${preview ? `
        <div class="statline">
          <span class="stat">Vida <b>${preview.vida}</b></span>
          <span class="stat">Fuerza <b>${preview.fuerza}</b></span>
          <span class="stat">Maná <b>${preview.mana}</b></span>
          <span class="stat">${spheresRow(dicePreview(preview.fuerza), p.color, false, Math.floor(preview.mana / 5))}</span>
        </div>` : ''}
    </div>
    <div class="pick-choices">
      <div class="choice-grid row7">
        ${Object.entries(DATA.razas).map(([k, r]) => `<button class="btn choice ${p.raza === k ? 'selected' : ''}" data-a="raza" data-k="${k}">${r.nombre}<span class="mods">${mods(r)}</span></button>`).join('')}
      </div>
      <div class="choice-grid row7">
        ${Object.entries(DATA.clases).map(([k, c]) => `<button class="btn choice ${p.clase === k ? 'selected' : ''}" data-a="clase" data-k="${k}">${c.nombre}<span class="mods">${mods(c)}</span></button>`).join('')}
      </div>
    </div>
    <div class="pick-bottom">
      <div class="others-row">${others}</div>
      <div class="ready-side">
        ${p.ready
          ? '<button class="seal green" data-a="lobbyReady" data-v="0">Listo ✔</button>'
          : `<button class="seal" data-a="lobbyReady" data-v="1" ${p.raza && p.clase ? '' : 'disabled'}>¡Listo!</button>`}
      </div>
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
  return n ? `${n - f} de Fuerza más para otra esfera` : 'máximo de esferas';
}

// ---------- Hoja del héroe

// Las esferas disponibles se muestran como esferas, no como un número de dados.
// Las primeras `whites` esferas son blancas: el Maná las fija como comodín.
function spheresRow(n, color, big = false, whites = 0) {
  const w = Math.min(n, whites);
  return Array.from({ length: n }, (_, i) => `<span class="sphere ${big ? 'big' : ''} ${i < w ? 'blanco' : 'gris'}"></span>`).join('');
}

function itemTile(it, label) {
  if (!it) return `<div class="tile empty"><span class="ring"><i>${label}</i></span></div>`;
  return `<button class="tile" data-a="item" data-id="${it.id}" title="${esc(it.nombre)}"><span class="ring">${itemIcon(it)}</span><span>${esc(it.nombre)}</span></button>`;
}

function renderSheet() {
  const p = me();
  if (!p || !p.hero) return '';
  const h = p.hero;
  const pct = Math.max(0, Math.min(100, (h.vida / h.base.vida) * 100));
  const inv = h.inv;
  const hands = inv.manos;
  const handTiles = hands.length === 0
    ? [itemTile(null, 'Mano'), itemTile(null, 'Mano')]
    : hands[0].slot === 'dosManos' ? [itemTile(hands[0]), `<div class="tile empty taken"><span class="ring"><i>2 manos</i></span></div>`] : [itemTile(hands[0]), itemTile(hands[1], 'Mano')];
  const slots3 = (list, label) => [0, 1, 2].map((i) => itemTile(list[i], label)).join('');
  return `
  <div class="me-hero">
    ${heroPortrait(p, 'xl')}
    <div class="me-name">${esc(p.name)}${S.phase === 'prep' && p.ready ? ' <span class="check">✔</span>' : ''}</div>
    <div class="spheres-row mine" title="${nextDiceHint(h.fuerza)}">${spheresRow(h.dados, p.color, true, h.fijables)}</div>
    <div class="life"><i style="width:${pct}%"></i><span>${h.vida} / ${h.base.vida}</span></div>
    <div class="me-sub">${raceName(p)} · ${className(p)}</div>
  </div>
  <div class="glyphs two">
    <div title="Fuerza: ${nextDiceHint(h.fuerza)}"><b>${h.fuerza}</b><span>Fuerza</span></div>
    <div title="Cada 5 de Maná es una esfera blanca"><b>${h.manaDisponible}</b><span>Maná</span></div>
  </div>
  ${h.curses ? `<p class="warn center">Maleficio: repetirás ${h.curses} esfera(s) acertada(s) en tu próximo combate.</p>` : ''}
  <div class="tiles">
    ${itemTile(inv.yelmo, 'Yelmo')}${itemTile(inv.armadura, 'Armadura')}${itemTile(inv.tunica, 'Túnica')}
    ${itemTile(inv.botas, 'Botas')}${handTiles.join('')}
    ${slots3(inv.pociones, 'Poción')}
    ${slots3(inv.pergaminos, 'Pergamino')}
  </div>
  <p class="muted small center">${h.victorias} victorias · ${h.caidas} caídas</p>`;
}

// Detalle de un objeto (al tocarlo en tu hoja).
function renderItemDetail() {
  if (!S) return '';
  const p = me();
  const it = ui.detail && p && p.hero && allItems(p.hero).find((x) => x.id === ui.detail);
  if (!it) { ui.detail = null; return ''; }
  return `
    <div class="card detail">
      <div class="big-item">${itemIcon(it)}</div>
      <h2>${esc(it.nombre)}</h2>
      <p class="muted">${itemDesc(it)}</p>
      <div class="row center-row">${useBtn(it)}${discardBtn(it)}<button class="btn" data-a="closeDetail">Cerrar</button></div>
    </div>`;
}

function discardBtn(it) {
  if (S.phase !== 'prep' && S.phase !== 'combat') return '';
  return `<button class="btn" data-a="discard" data-id="${it.id}">Descartar</button>`;
}

function useBtn(it) {
  const p = me();
  const h = p.hero;
  const myCombat = isMyTurnCombat();
  let ok = false;
  if (it.efecto === 'mana') ok = myCombat;
  if (it.efecto === 'curacion') ok = h.vida < h.base.vida && (S.phase === 'prep' || S.phase === 'combat' || (S.phase === 'torneo' && myCombat));
  if (it.efecto === 'robo') ok = S.phase === 'prep';
  if (!ok) return '';
  return `<button class="btn primary" data-a="use" data-id="${it.id}" data-efecto="${it.efecto}">Usar</button>`;
}

// ---------- Mesa: cada héroe y contra quién se enfrenta

function opponentOf(p) {
  if (S.phase === 'combat') {
    if (!p.monster && p.stage === 'combate' && p.offers && p.offers.length) {
      return { art: p.offers.map((m) => monsterArt(m, 'foe two')).join(''), name: p.offers.map((m) => m.nombre).join(' o ') };
    }
    if (p.monster) {
      const res = p.combat && p.combat.status === 'victoria' ? 'win' : p.combat && p.combat.status === 'derrota' ? 'lose' : '';
      return { art: monsterArt(p.monster, 'foe'), name: p.monster.nombre, res };
    }
  }
  if (S.phase === 'torneo' && S.tournament) {
    const m = S.tournament.matches.find((x) => !x.winner && (x.a === p.id || x.b === p.id));
    if (m) {
      const r = byId(m.a === p.id ? m.b : m.a);
      return { art: portrait(r.raza, r.clase, 'foe', r.color), name: r.name, turn: m.attacker === p.id };
    }
    if (S.tournament.bye === p.id) return { txt: 'espera en la final' };
    const lost = S.tournament.matches.some((x) => x.winner && x.winner !== p.id && (x.a === p.id || x.b === p.id));
    return { txt: lost ? 'eliminado' : 'espera', out: lost };
  }
  if (S.phase === 'prep') return { txt: p.ready ? '✔ listo' : 'preparándose…' };
  if (S.phase === 'fin') return { txt: S.winner === p.id ? 'campeón' : '' };
  return { txt: '' };
}

function renderArena() {
  return `<h3 class="col-title">Rivales</h3>` + others().map((p) => {
    const h = p.hero;
    const pct = Math.max(0, Math.min(100, (h.vida / h.base.vida) * 100));
    const o = opponentOf(p);
    const ready = S.phase === 'prep' && p.ready;
    return `
    <div class="rival ${o.out ? 'out' : ''}">
      <div class="rival-pair">
        <div class="rival-side">${heroPortrait(p, 'rival')}</div>
        <div class="rival-vs">${o.art ? 'versus' : ''}</div>
        <div class="rival-side rival-foe ${o.res || ''}">
          ${o.art ? `<div class="foe-imgs">${o.art}</div><div class="foe-name">${esc(o.name)}</div>` : `<div class="state">${o.txt === '✔ listo' ? '' : o.txt || ''}</div>`}
        </div>
      </div>
      <div class="rival-info">
        <div class="nm">${esc(p.name)} ${ready ? '<span class="check">✔</span>' : ''}${!p.connected && !p.bot ? ' <small class="off">desconectado</small>' : ''}</div>
        <div class="muted small">${esc(raceName(p))} ${esc(className(p))} · Fuerza ${h.fuerza ?? ''} · Vida ${h.vida}/${h.base.vida}</div>
        <div class="spheres-row">${spheresRow(h.dados, p.color, false, h.fijables)}</div>
        <div class="life thin"><i style="width:${pct}%"></i></div>
      </div>
    </div>`;
  }).join('');
}

// ---------- Ventana flotante de victoria o derrota

// Tras el último lanzamiento se deja ver un momento las esferas antes de la ventana.
function holdOutcome() {
  ui.outcomeAt = Date.now() + 1800;
  setTimeout(() => { if (S) renderModal(); }, 1850);
}

function renderOutcome() {
  const p = me();
  if (!p || !p.hero) return '';
  // Aviso: alguien te ha lanzado un maleficio.
  if (ui.curseAlert) {
    const who = ui.curseAlert.split(' gasta ')[0];
    const n = (ui.curseAlert.match(/repetirá (\d+)/) || [])[1] || '1';
    return `
      <div class="card outcome curse-alert">
        <div class="outcome-title">Maleficio</div>
        <p class="center"><b>${esc(who)}</b> te ha lanzado un maleficio.</p>
        <p class="center">En tu próximo combate tendrás que repetir ${n} esfera(s) acertada(s).</p>
        <div class="row center-row"><button class="btn primary" data-a="closeCurse">Entendido</button></div>
      </div>`;
  }
  if (ui.stealResult) {
    return `
      <div class="card outcome">
        <div class="outcome-title">${ui.stealResult.ok ? '¡Robado!' : 'Robo'}</div>
        <p class="center">${esc(ui.stealResult.text)}</p>
        <div class="row center-row"><button class="btn primary" data-a="closeSteal">Continuar</button></div>
      </div>`;
  }
  if (ui.outcomeAt && Date.now() < ui.outcomeAt) return '';
  // Al ganar, primero se ven las esferas y luego la ventana de recompensa.
  const winKey = p.stage === 'recompensa' ? `${S.round}` : '';
  if (winKey && ui.winKey !== winKey) { ui.winKey = winKey; holdOutcome(); return ''; }
  // Victoria contra un monstruo: aquí se elige la recompensa.
  if (S.phase === 'combat' && p.stage === 'recompensa' && p.rewards) {
    return `
      <div class="card outcome win">
        <div class="outcome-title">¡Victoria!</div>
        ${monsterArt(p.monster, 'outcome-art')}
        <p class="center">Has derrotado a ${esc(p.monster.nombre)} ${esc((p.monster.tamano || '').toLowerCase())}. Elige tu recompensa:</p>
        <div class="reward-pick">${p.rewards.map((it, i) => `
          <button class="reward-choice" data-a="reward" data-i="${i}">
            <span class="big-item">${itemIcon(it)}</span>
            <b>${esc(it.nombre)}</b><small>${itemDesc(it)}</small>
          </button>`).join('')}</div>
      </div>`;
  }
  // Derrota contra un monstruo (se guarda hasta pulsar Continuar).
  if (ui.defeat) {
    const m = ui.defeat.monster;
    return `
      <div class="card outcome lose">
        <div class="outcome-title">Derrota</div>
        ${m ? monsterArt(m, 'outcome-art') : ''}
        <p class="center">${esc(ui.defeat.text.replace(/^🩸 /, ''))}</p>
        ${ui.defeat.fell ? '<p class="center warn">Has caído a 0 Vida: pierdes tus consumibles y tu mejor objeto, y recuperas la Vida inicial.</p>' : ''}
        <div class="row center-row"><button class="btn primary" data-a="closeDefeat">Continuar</button></div>
      </div>`;
  }
  // Duelos del torneo en los que no participas: resumen en una ventana.
  if (S.tournament && ui.seenMatches) {
    const other = S.tournament.matches.find((x) => x.winner && x.a !== p.id && x.b !== p.id && !ui.seenMatches.has(x.id));
    if (other) {
      const w = byId(other.winner);
      const l = byId(other.winner === other.a ? other.b : other.a);
      return `
        <div class="card outcome">
          <div class="outcome-title">${esc(other.label)}</div>
          <div class="duel-pair">
            <figure>${heroPortrait(w, 'duelist')}<figcaption><b>${esc(w.name)}</b><br>${w.hero.vida} Vida</figcaption></figure>
            <span class="faceoff-vs">vence a</span>
            <figure class="lost">${heroPortrait(l, 'duelist')}<figcaption><b>${esc(l.name)}</b></figcaption></figure>
          </div>
          <p class="center">El duelo duró ${other.turns} ataques. ${esc(w.name)} ${S.tournament.stage === 'final' || S.phase === 'fin' ? '' : 'pasa a la final'}${other.label === 'Final' ? 'gana el torneo' : ''}.</p>
          <div class="row"><button class="btn primary" data-a="seenOutcome" data-k="t${other.id}" data-m="${other.id}">Continuar</button></div>
        </div>`;
    }
  }
  // Fin de un duelo del torneo en el que participas.
  if (S.tournament) {
    const m = [...S.tournament.matches].reverse().find((x) => x.winner && (x.a === p.id || x.b === p.id));
    if (m && ui.seenOutcome !== `t${m.id}` && ui.seenMatches && !ui.seenMatches.has(m.id)) {
      const won = m.winner === p.id;
      const rival = byId(m.a === p.id ? m.b : m.a);
      return `
        <div class="card outcome ${won ? 'win' : 'lose'}">
          <div class="outcome-title">${won ? '¡Victoria!' : 'Derrota'}</div>
          ${portrait(rival.raza, rival.clase, 'outcome-art', rival.color)}
          <p class="center">${won ? `Has vencido a ${esc(rival.name)} en la ${esc(m.label)}.` : `${esc(rival.name)} te ha vencido en la ${esc(m.label)}.`}</p>
          <div class="row center-row"><button class="btn primary" data-a="seenOutcome" data-k="t${m.id}" data-m="${m.id}">Continuar</button></div>
        </div>`;
    }
  }
  return '';
}

// ---------- Reglas (como en Imperio)

const RULES = {
  heroe: ['El héroe', `
    <p>Cada jugador controla un héroe formado por una <b>Raza</b> y una <b>Clase</b>, y tiene un color propio.</p>
    <p><b>Vida</b>: resistencia; no se recupera sola, solo con objetos. <b>Fuerza</b>: decide cuántas esferas lanzas
    (1–5: 1 · 6–10: 2 · 11–15: 3 · 16–20: 4 · 21+: 5). Todos empiezan con Fuerza 10 como mínimo.
    <b>Maná</b>: cada 5 puntos convierten una de tus esferas en blanca (comodín) desde el inicio de cada combate. Todos los héroes empiezan con al menos 5.</p>
    <p>Equipo: yelmo, armadura, botas y dos manos (un arma a dos manos ocupa ambas). Hasta 3 pociones y 3 pergaminos.</p>`],
  aventura: ['Aventura', `
    <p>La Fase 1 dura <b>12 rondas</b>. En cada una aparecen <b>2 monstruos a la vez</b>; no eliges antes de lanzar:
    al terminar tus tiradas presentas tus esferas contra el que puedas o quieras derrotar. Siempre hay monstruos a tu alcance.</p>
    <p>Los monstruos salen en tres tamaños: pequeño, mediano (★★) y grande (★★★). Cuanto más grandes, más difíciles,
    más daño hacen y mejores recompensas dan.</p>
    <p>Si ganas, eliges 1 de 2 recompensas. Si pierdes, pierdes Vida. Si caes a 0, pierdes tus consumibles y tu mejor objeto
    y recuperas la Vida inicial.</p>
    <p>Entre combates puedes comerciar, curarte, robar con pergaminos y lanzar maleficios (uno recibido como máximo por ronda, y un comercio por ronda): cada 5 de Maná obliga a un rival a
    repetir una esfera acertada en su próximo combate.</p>`],
  combate: ['Combate', `
    <p>Cada esfera da a la vez un <b>color</b> y una <b>forma</b>. Colores: rojo, azul, verde, amarillo, <b>blanco</b> (comodín de color)
    y <b>negro</b> (no cuenta). Formas: círculo, cuadrado, rombo, triángulo, <b>estrella</b> (comodín de forma) y <b>cruz</b> (no cuenta).</p>
    <p>Cada monstruo pide <b>solo colores</b> o <b>solo formas</b>. Los dos monstruos de la ronda suelen pedir cosas distintas,
    así que puedes orientar tus tiradas hacia uno u otro.</p>
    <p>Lanzas tus esferas, conservas las que quieras y relanzas el resto: <b>3 tiradas</b> como máximo. Cuando tu combinación completa
    lo que pide un monstruo, pulsa <b>Derrotar</b> en él.</p>
    <p>Tus esferas de Maná salen blancas con estrella (comodín para los dos) y ya fijadas. Las pociones de Maná añaden más.
    Si al terminar las tiradas no completas ninguno, pierdes contra el menos dañino.</p>`],
  torneo: ['Torneo', `
    <p>Tras la ronda 12 empieza el torneo. El héroe con más Fuerza + Maná elige rival para su semifinal; los otros dos se enfrentan entre sí.
    Los ganadores juegan la final. Nadie recupera Vida.</p>
    <p>Para golpear hay que sacar esferas del <b>color del rival</b>: 3 → 1 de daño, 4 → 2, 5 → 3. Ataca primero el más débil y se alterna
    hasta que uno llega a 0 Vida. Quien gana la final, gana la partida.</p>`],
};

function renderRules() {
  const tabs = Object.entries(RULES).map(([k, [t]]) => `<button class="btn small ${ui.rulesTab === k ? 'selected' : ''}" data-a="rulesTab" data-t="${k}">${t}</button>`).join('');
  return `
    <div class="card rules">
      <button class="modal-close" data-a="closeRules" aria-label="Cerrar" title="Cerrar">×</button>
      <h2 class="center">Reglas de Héroes</h2>
      <div class="row center-row rules-tabs">${tabs}</div>
      <div class="rules-body">${RULES[ui.rulesTab][1]}</div>
    </div>`;
}
$('rulesBtn').onclick = () => { ui.rules = true; renderModal(); };
function paintSound() {
  const m = Sounds.isMuted();
  $('soundBtn').innerHTML = speakerIcon(m);
  $('soundBtn').title = m ? 'Activar sonidos' : 'Silenciar sonidos';
}
$('soundBtn').onclick = () => { Sounds.toggle(); paintSound(); };
paintSound();

// ---------- Sonidos según lo que pasa en la partida

let lastLogN = null;
let lastMyTurn = false;
function playEventSounds() {
  const meP = me();
  const lastN = S.log.length ? S.log[S.log.length - 1].n : 0;
  const myTurn = isMyTurnCombat() && S.phase === 'torneo';
  if (lastLogN === null) { lastLogN = lastN; lastMyTurn = myTurn; return; }
  const texts = S.log.filter((l) => l.n > lastLogN).map((l) => l.text);
  lastLogN = lastN;
  if (!meP) return;
  const name = meP.name;
  const has = (re) => texts.some((t) => re.test(t));
  const mine = (re) => texts.some((t) => re.test(t) && t.includes(name));
  if (has(/GANA LA PARTIDA/)) Sounds.play('victoria');
  else if (has(/Comienza el Torneo/)) Sounds.play('victoria');
  else if (texts.some((t) => /^🏅/.test(t) && t.includes(name))) Sounds.play('conquista');
  else if (mine(/^💀/)) Sounds.play('destruccion');
  else if (mine(/^🗡/)) Sounds.play('celebracion', 300);
  else if (mine(/^🩸/)) { Sounds.play('dados'); Sounds.play('derrota', 600); }
  const lost = texts.find((t) => /^🩸/.test(t) && t.startsWith(`🩸 ${name} no consigue`));
  if (lost) { ui.defeat = { text: lost, monster: meP.monster || ui.lastMonster, fell: mine(/^💀/) }; holdOutcome(); }
  const stole = texts.find((t) => /^(🦝|🪤|🎲) /.test(t) && t.includes(`${name} saca`));
  if (stole) ui.stealResult = { ok: stole.startsWith('🦝'), text: stole.replace(/^\S+ /, '') };
  const cursed = texts.find((t) => t.includes(`lanza un maleficio a ${name}:`));
  if (cursed) { ui.curseAlert = cursed; Sounds.play('fe'); }
  else if (texts.some((t) => /^💥/.test(t) && t.includes(name))) Sounds.play('batalla');
  else if (texts.some((t) => /^🔮/.test(t) && t.includes(name))) Sounds.play('fe');
  else if (texts.some((t) => t.startsWith(`${name} se enfrenta a`))) Sounds.play('batalla');
  else if (has(/^— Ronda/)) Sounds.play('turno');
  else if (texts.some((t) => /intercambio/.test(t) && t.includes(name))) Sounds.play('ficha');
  if (myTurn && !lastMyTurn) Sounds.play('turno', 300);
  lastMyTurn = myTurn;
}

// ---------- Objetos nuevos: se muestran en grande

let knownItems = null;
const revealQueue = [];
function detectNewItems() {
  const p = me();
  if (!p || !p.hero) return;
  const items = allItems(p.hero);
  const ids = new Set(items.map((it) => it.id));
  if (knownItems) {
    for (const it of items) if (!knownItems.has(it.id)) revealQueue.push(it);
  }
  knownItems = ids;
  showReveal();
}
let revealTimer = null;
function showReveal() {
  const box = $('reveal');
  if (!box.classList.contains('hidden') || !revealQueue.length) return;
  const it = revealQueue.shift();
  box.innerHTML = `<div class="reveal-card card"><div class="reveal-title">Has conseguido</div><div class="big-item">${itemIcon(it)}</div><h2>${esc(it.nombre)}</h2><p>${itemDesc(it)}</p></div>`;
  box.classList.remove('hidden');
  Sounds.play('fe');
  clearTimeout(revealTimer);
  revealTimer = setTimeout(closeReveal, 3200);
}
function closeReveal() {
  $('reveal').classList.add('hidden');
  setTimeout(showReveal, 250);
}
$('reveal').onclick = closeReveal;
$('journalBtn').onclick = () => $('journal').classList.toggle('hidden');
$('journalClose').onclick = () => $('journal').classList.add('hidden');

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
  const incoming = S.trades.filter((t) => t.to === S.me).length;
  return `
  <div class="card prep-card">
    <h2>${torneo ? 'Preparación para el Torneo' : `Ronda ${S.round} de ${S.rounds}`}</h2>
    <div class="prep-actions">
      ${p.ready
        ? '<button class="seal green" data-a="ready" data-v="0">Listo ✔</button>'
        : `<button class="seal" data-a="ready" data-v="1">${torneo ? 'Listo para<br>el Torneo' : 'Listo para<br>el combate'}</button>`}
      <div class="prep-buttons">
        <button class="btn ${incoming ? 'alert' : ''}" data-a="prepWin" data-w="trade">Comerciar${incoming ? ` <span class="badge">${incoming}</span>` : ''}</button>
        <button class="btn" data-a="prepWin" data-w="curse" ${S.round <= 1 ? 'disabled title="Desde la ronda 2"' : ''}>Maleficio</button>
        <button class="btn" data-a="prepWin" data-w="steal">Robar</button>
      </div>
    </div>
  </div>`;
}

// Ventana flotante de cada acción entre combates.
function renderPrepWin() {
  if (S.phase !== 'prep' || !ui.prepWin) return '';
  const body = ui.prepWin === 'trade' ? renderTrade() : ui.prepWin === 'curse' ? renderMagic() : renderTheft();
  return `<div class="card prep-win"><button class="modal-close" data-a="closePrep" aria-label="Cerrar" title="Cerrar">×</button>${body}</div>`;
}

function renderTheft() {
  const p = me();
  const t = ui.theft || (ui.theft = { targetId: null });
  const target = t.targetId && byId(t.targetId);
  const scroll = [...p.hero.inv.pergaminos].find((it) => it.efecto === 'robo');
  const picked = target && t.itemId && allItems(target.hero).find((it) => it.id === t.itemId);
  return `
    <h3>Robar</h3>
    <p class="muted small center">Con un Pergamino de Robo te lo llevas seguro. Sin él, tiras un dado:
    1-2 lo robas · 3-5 te pillan y pierdes tu Maná en el próximo combate · 6 no pasa nada.</p>
    <div class="row">${others().map((o) => `<button class="btn small ${t.targetId === o.id ? 'selected' : ''}" data-a="theftTarget" data-id="${o.id}">${esc(o.name)}</button>`).join('')}</div>
    ${target ? (allItems(target.hero).length ? `<div class="steal-items">${allItems(target.hero).map((it) => `
      <button class="steal-item ${t.itemId === it.id ? 'selected' : ''}" data-a="theftItem" data-id="${it.id}">
        <span class="ring">${itemIcon(it)}</span><span>${esc(it.nombre)}</span></button>`).join('')}</div>`
      : '<p class="muted center">No tiene objetos.</p>') : '<p class="muted center">Elige a quién robar.</p>'}
    <div class="row">
      ${scroll ? `<button class="btn primary" data-a="steal" data-mode="scroll" ${picked ? '' : 'disabled'}>Usar ${esc(scroll.nombre)}</button>` : ''}
      <button class="btn ${scroll ? '' : 'primary'}" data-a="steal" data-mode="roll" ${picked && !p.stoleThisRound ? '' : 'disabled'}>Tirar el dado</button>
    </div>
    ${p.stoleThisRound ? '<p class="muted small center">Ya has intentado robar con el dado esta ronda.</p>' : ''}`;
}

function renderMagic() {
  const p = me();
  const h = p.hero;
  if (S.round <= 1) return '<h3>Maleficio</h3><p class="muted center">Podrás lanzar maleficios desde la ronda 2.</p>';
  const avail = h.manaDisponible;
  const amounts = [];
  for (let a = 5; a <= avail; a += 5) amounts.push(a);
  if (!amounts.includes(ui.curse.amount)) ui.curse.amount = amounts[0] || 5;
  const targets = others().filter((o) => !o.cursedThisRound);
  if (ui.curse.target && !targets.some((o) => o.id === ui.curse.target)) ui.curse.target = null;
  return `
    <h3>Maleficio</h3>
    ${amounts.length && targets.length ? `
      <div class="row">${targets.map((o) => `<button class="btn small ${ui.curse.target === o.id ? 'selected' : ''}" data-a="curseTarget" data-id="${o.id}">${esc(o.name)}</button>`).join('')}</div>
      <div class="row">${amounts.map((a) => `<button class="btn tiny ${ui.curse.amount === a ? 'selected' : ''}" data-a="curseAmount" data-n="${a}">${a} Maná</button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="curse" ${ui.curse.target ? '' : 'disabled'}>Lanzar maleficio</button></div>`
    : `<p class="muted small center">${amounts.length ? 'Todos los rivales ya han recibido un maleficio esta ronda.' : 'Necesitas al menos 5 de Maná disponible.'}</p>`}`;
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
    <h3>Comerciar</h3>
    ${p.tradedThisRound ? '<p class="muted small center">Ya has comerciado esta ronda.</p>' : ''}
    ${incoming.map((t) => { const from = byId(t.from); return `
      <div class="match" style="margin-bottom:8px">
        <b>${esc(from.name)}</b> te ofrece <b>${names(from, t.give)}</b> a cambio de <b>${names(p, t.want)}</b>
        <div class="row" style="margin-top:6px"><button class="btn small primary" data-a="tradeResp" data-id="${t.id}" data-ok="1">Aceptar</button><button class="btn small" data-a="tradeResp" data-id="${t.id}" data-ok="0">Rechazar</button></div>
      </div>`; }).join('')}
    ${outgoing.map((t) => { const to = byId(t.to); return `
      <div class="match" style="margin-bottom:8px">Ofreces a <b>${esc(to.name)}</b>: ${names(p, t.give)} por ${names(to, t.want)}
        <button class="btn tiny" data-a="tradeResp" data-id="${t.id}" data-ok="0">Retirar</button></div>`; }).join('')}
    ${p.tradedThisRound || outgoing.length ? '' : `<div class="row" style="margin-bottom:8px">
      <span class="small muted">Proponer a:</span>
      ${others().filter((o) => !o.tradedThisRound).map((o) => `<button class="btn small ${ui.trade.to === o.id ? 'selected' : ''}" data-a="tradeTo" data-id="${o.id}">${esc(o.name)}</button>`).join('')}
    </div>`}
    ${target && !p.tradedThisRound && !outgoing.length ? `
      <div class="offers">
        <div><h4>Das</h4>${pickList(p, ui.trade.give, 'give')}</div>
        <div><h4>Pides a ${esc(target.name)}</h4>${pickList(target, ui.trade.want, 'want')}</div>
      </div>
      <button class="btn small primary" style="margin-top:8px" data-a="tradeSend" ${ui.trade.give.size || ui.trade.want.size ? '' : 'disabled'}>Enviar oferta</button>` : ''}`;
}

function renderRound() {
  const p = me();
  let body = '';
  if (p.stage === 'combate') {
    body = `<div class="card">${renderCombat(p, true)}</div>`;
  } else if (p.stage === 'recompensa') {
    body = `
    <div class="card">
      ${renderCombat(p, false)}
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
    // Las esferas que ya sirven salen marcadas para conservarlas.
    if (cb) {
      const { used } = bestTarget(cb);
      cb.dice.forEach((d, i) => { if (d.fixed || (cb.rolls > 0 && used.has(i))) ui.held.add(i); });
    }
  }
}

function renderCombat(p, controllable) {
  const cb = p.combat;
  const mine = p.id === S.me;
  const faces = cb.dice.map((d, i) => (mine && ui.manaPick.has(i) ? ui.manaPick.get(i) : d.face));
  const monster = cb.kind === 'monstruo' && cb.targets && p.offers;
  const { used, all } = bestTarget(cb, faces);
  const fijables = mine ? p.hero.fijables : null;
  const diceHtml = cb.dice.length
    ? cb.dice.map((d, i) => {
      const cls = [
        used.has(i) ? 'success' : '',
        d.fixed ? 'fixed' : '',
        controllable && !ui.manaMode && ui.held.has(i) && !d.fixed ? 'held' : '',
        controllable && ui.manaMode && (ui.manaSel === i || ui.manaPick.has(i)) ? 'picking' : '',
      ].join(' ');
      return die(faces[i], { cls, shape: d.shape, attrs: controllable ? `data-a="die" data-i="${i}"` : '' });
    }).join('')
    : Array.from({ length: cb.diceCount }, () => die(null)).join('');

  let controls = '';
  let result = '';
  if (cb.kind === 'duelo' && cb.damage !== undefined) {
    result = cb.damage > 0 ? `<div class="result win">¡Golpe! −${cb.damage} Vida</div>` : '<div class="result lose">Ataque fallido</div>';
  } else if (cb.status === 'victoria') result = `<div class="result win">¡Victoria!</div>`;
  else if (cb.status === 'derrota') result = `<div class="result lose">Derrota</div>`;
  else if (cb.status === 'cancelado') result = `<div class="muted center">Combate terminado</div>`;

  if (controllable && cb.status === 'activo') {
    const left = 3 - cb.rolls;
    const rerollN = cb.dice.filter((d, i) => !d.fixed && !ui.held.has(i)).length;
    const manaPot = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'mana');
    controls = `
      ${cb.rolls > 0 && left > 0 ? `<div class="muted small center">${monster ? 'Las esferas que te sirven ya están marcadas. Puedes ir a por cualquiera de los dos monstruos.' : 'Las esferas que te sirven ya están marcadas. Toca para cambiar cuáles conservas.'}</div>` : ''}
      <div class="row">
        ${cb.rolls === 0 ? '<button class="btn primary" data-a="roll">Atacar</button>' : ''}
        ${cb.rolls > 0 && left > 0 ? `<button class="btn primary" data-a="roll" ${rerollN ? '' : 'disabled'}>Relanzar ${rerollN}</button>` : ''}
      </div>
      ${manaPot ? `<div class="row"><button class="btn small" data-a="use" data-id="${manaPot.id}" data-efecto="mana">Beber ${esc(manaPot.nombre)}</button></div>` : ''}
      ${cb.rolls > 0 && cb.kind === 'duelo' ? `<div class="row"><button class="btn small" data-a="endAttack">Terminar ataque (${duelDamage(cb, faces)} de daño)</button></div>` : ''}
      ${cb.rolls >= 3 && cb.kind !== 'duelo' && !all.some((x) => x.ok) ? '<div class="row"><button class="btn small" data-a="concedeNow">Aceptar derrota</button></div>' : ''}`;
  }

  const holder = mine ? 'Tus esferas' : `Esferas de ${esc(p.name)}`;
  let foe = '';
  let foeName = '';
  if (cb.kind === 'monstruo') { /* se muestran los dos monstruos */ }
  else if (S.tournament) {
    const m = S.tournament.matches.find((x) => !x.winner && (x.a === p.id || x.b === p.id));
    const def = m && byId(m.a === p.id ? m.b : m.a);
    if (def) { foe = portrait(def.raza, def.clase, 'duel-art', def.color); foeName = def.name; }
  }
  return `
  <div class="combat">
    ${monster ? foesHtml(p, cb, all, controllable) : `<h2 class="center" style="margin:0">${esc(cb.label)}</h2>`}
    <div class="row"><span class="pill">Tirada ${cb.rolls}/3</span>${cb.cursesLeft ? `<span class="pill">Maleficio: ${cb.cursesLeft}</span>` : ''}</div>
    ${monster ? '' : `<div class="targetline"><span class="muted">Necesitas:</span>${comboHtml(cb.combo)}</div>`}
    <div><div class="muted small center" style="margin-bottom:8px">${holder}</div><div class="dice">${diceHtml}</div></div>
    ${result}
    ${controls}
    <div class="events">${cb.events.slice().reverse().map((e) => `<div>${esc(e)}</div>`).join('')}</div>
  </div>`;
}

// Los dos monstruos de la ronda, cada uno con lo que pide y su botón para derrotarlo.
function foesHtml(p, cb, all, controllable) {
  const done = cb.status !== 'activo';
  return `<div class="foes">${p.offers.map((m, i) => {
    const st = all[i] || { missing: m.combo.length, ok: false };
    const chosen = done && cb.chosen === i;
    const faded = done && cb.status === 'victoria' && cb.chosen !== i;
    const can = controllable && !done && cb.rolls > 0 && st.ok;
    const state = done
      ? (chosen ? '<div class="need ok">Derrotado</div>' : '')
      : cb.rolls === 0 ? '' : st.ok ? '<div class="need ok">¡Lo tienes!</div>' : `<div class="need">Te faltan ${st.missing}</div>`;
    return `
    <div class="foe-card ${st.ok && !done ? 'ready' : ''} ${chosen ? 'chosen' : ''} ${faded ? 'faded' : ''}">
      <div class="foe-art">${monsterArt(m, 'duel-art')}</div>
      <div class="foe-title">${esc(m.nombre)} <span class="muted small">${esc(m.tamano || '')}</span></div>
      <div class="muted small">Nivel ${m.level} · si pierdes: −${m.dano} Vida</div>
      <div class="req-label">Pide ${m.tipo === 'forma' ? 'formas' : 'colores'}</div>
      ${comboHtml(m.combo, false, m.tipo)}
      ${state}
      ${can ? `<button class="btn primary" data-a="present" data-i="${i}">Derrotar a ${esc(m.nombre)}</button>` : ''}
      <button class="link-btn see-rewards" data-a="seeRewards" data-i="${i}">Ver recompensas</button>
    </div>`;
  }).join('<div class="foes-or">o</div>')}</div>`;
}

// Golpe graduado: con N exigidos, N → 3 daño, N−1 → 2, N−2 → 1.
function duelDamage(cb, faces) {
  const hits = cb.combo.length;
  const n = Math.min(hits, faces.filter((f) => f === cb.combo[0] || f === 'blanco').length);
  return Math.max(0, 3 - (hits - n));
}

function renderTournament() {
  const t = S.tournament;
  const rank = `
    <div class="card">
      <h2>Torneo</h2>
      <p class="muted small">El atacante saca resultados del color del rival (el blanco vale como comodín). Daño: ${S.settings.pvpHits - 2} resultados → 1, ${S.settings.pvpHits - 1} → 2, ${S.settings.pvpHits} → 3. Puedes terminar el ataque cuando quieras.</p>
      <h4>Clasificación (Fuerza + Maná)</h4>
      ${t.ranking.map((id, i) => { const x = byId(id); return `<div class="fighter">${i + 1}. ${heroPortrait(x, 'xs')} ${chip(x.color)} ${esc(x.name)} <span class="hp">${x.hero.puntuacion}</span></div>`; }).join('')}
    </div>`;
  let choose = '';
  if (t.stage === 'eleccion') {
    if (t.ranking[0] === S.me) {
      choose = `<div class="card"><h3>Elige rival para tu semifinal</h3><div class="row rival-pick">
        ${t.ranking.slice(1).map((id) => { const x = byId(id); return `<button class="rival-card" data-a="rival" data-id="${id}">${heroPortrait(x, 'duelist')}<b>${esc(x.name)}</b><span>${x.hero.vida} Vida · Fuerza ${x.hero.fuerza} · Maná ${x.hero.mana}</span></button>`; }).join('')}
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
    const mineMatch = m.a === S.me || m.b === S.me;
    const fighter = (x) => `<div class="fighter big ${m.winner === x.id ? 'win' : ''} ${live && m.attacker === x.id ? 'attacking' : ''}">${heroPortrait(x, 'duelist')}<b>${esc(x.name)}</b><span class="hp">${x.hero.vida} Vida</span></div>`;
    return `
    <div class="card match ${live ? 'live' : ''}">
      <h3>${esc(m.label)}${m.winner ? ` · gana ${esc(byId(m.winner).name)}` : ''}</h3>
      <div class="vs duel-pair">${fighter(a)}<span class="faceoff-vs">vs</span>${fighter(b)}</div>
      ${live && mineMatch && att.combat ? `<div style="margin-top:12px">${renderCombat(att, att.id === S.me)}</div>` : ''}
      ${live && !mineMatch ? '<p class="muted center small">Duelo en curso…</p>' : ''}
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
    ${heroPortrait(w, 'lg')}
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

function renderRewardsView(p) {
  const m = p && p.offers && p.offers[ui.rewardsView];
  if (!m || S.phase !== 'combat') { ui.rewardsView = null; return ''; }
  return `
    <div class="card outcome rewards-view">
      <button class="modal-close" data-a="closeRewards" aria-label="Cerrar" title="Cerrar">×</button>
      <div class="outcome-title">Recompensas</div>
      <p class="center muted">${esc(m.nombre)} ${esc((m.tamano || '').toLowerCase())}: si lo derrotas, eliges una.</p>
      <div class="reward-pick">${m.rewards.map((it) => `
        <div class="reward-choice static">
          <span class="big-item">${itemIcon(it)}</span>
          <b>${esc(it.nombre)}</b><small>${itemDesc(it)}</small>
        </div>`).join('')}</div>
    </div>`;
}

function renderModal() {
  const modal = $('modal');
  const before = modal.innerHTML;
  const hidden = modal.classList.contains('hidden');
  const html = modalHtml();
  if (html) {
    if (html !== ui.lastModal || hidden) modal.innerHTML = html;
    modal.classList.remove('hidden');
  } else { modal.classList.add('hidden'); if (before) modal.innerHTML = ''; }
  ui.lastModal = html;
}

function modalHtml() {
  const p = S && me();
  if (ui.rules) return renderRules();
  if (ui.rewardsView != null) {
    const v = renderRewardsView(p);
    if (v) return v;
  }
  const pend = p && p.hero && p.hero.pending && p.hero.pending[0];
  if (!pend || !pend.item) {
    if (S && !ui.seenMatches) ui.seenMatches = new Set((S.tournament ? S.tournament.matches : []).filter((x) => x.winner).map((x) => x.id));
    const o = S && renderOutcome();
    if (o) return o;
    const pw = S && renderPrepWin();
    if (pw) return pw;
    return renderItemDetail() || '';
  }
  return `
    <div class="card">
      <div class="big-item center">${itemIcon(pend.item)}</div>
      <h2>${esc(pend.item.nombre)}</h2>
      <p class="muted center">${itemDesc(pend.item)}</p>
      <p class="center">No tienes espacio libre para este objeto. ¿Qué haces?</p>
      <div class="opts">${pend.options.map((o) => `<button class="btn ${o.torpe ? 'torpe' : 'primary'}" data-a="pending" data-c="${o.id}">${esc(o.label)}</button>`).join('')}</div>
      ${pend.fromReward ? '<div class="row"><button class="link-btn" data-a="undoReward">Deshacer y volver a elegir recompensa</button></div>' : ''}
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
    case 'item': ui.detail = d.id; renderModal(); break;
    case 'closeDetail': ui.detail = null; renderModal(); break;
    case 'kick': act('kick', { playerId: d.id }); break;
    case 'addBot': act('addBot'); break;
    case 'pvpHits': act('setSettings', { pvpHits: Number(d.n) }); break;
    case 'start': act('start'); break;
    case 'lobbyStage': act('lobbyStage', { stage: d.s }); break;
    case 'lobbyReady': act('lobbyReady', { value: d.v === '1' }); break;
    case 'color': act('setColor', { color: d.c }); break;
    case 'raza': act('setHero', { raza: d.k }); break;
    case 'clase': act('setHero', { clase: d.k }); break;
    case 'ready': act('ready', { value: d.v === '1' }); break;
    case 'discard':
      if (confirm('¿Descartar este objeto?')) { act('discard', { itemId: d.id }); ui.detail = null; }
      break;
    case 'use':
      ui.detail = null;
      if (d.efecto === 'robo') { ui.theft = { targetId: null }; ui.prepWin = 'steal'; render(); }
      else { act('useItem', { itemId: d.id }); renderModal(); }
      break;
    case 'theftTarget': ui.theft = { targetId: d.id }; render(); break;
    case 'theftItem': ui.theft.itemId = d.id; render(); break;
    case 'steal': {
      const t = ui.theft;
      if (d.mode === 'scroll') {
        const sc = me().hero.inv.pergaminos.find((it) => it.efecto === 'robo');
        if (sc) act('useItem', { itemId: sc.id, targetId: t.targetId, targetItemId: t.itemId });
      } else { Sounds.play('dados'); act('stealRoll', { targetId: t.targetId, targetItemId: t.itemId }); }
      ui.theft = null; ui.prepWin = null; render();
      break;
    }
    case 'prepWin': ui.prepWin = d.w; render(); break;
    case 'closePrep': ui.prepWin = null; ui.theft = null; render(); break;
    case 'closeSteal': ui.stealResult = null; renderModal(); break;
    case 'curseTarget': ui.curse.target = d.id; render(); break;
    case 'curseAmount': ui.curse.amount = Number(d.n); render(); break;
    case 'curse': act('curse', { targetId: ui.curse.target, amount: ui.curse.amount }); ui.prepWin = null; render(); break;
    case 'tradeTo': ui.trade = { to: d.id, give: new Set(), want: new Set() }; render(); break;
    case 'tradePick': {
      const set = d.kind === 'give' ? ui.trade.give : ui.trade.want;
      el.checked ? set.add(d.id) : set.delete(d.id);
      render();
      break;
    }
    case 'tradeSend':
      ui.prepWin = null;
      act('proposeTrade', { toId: ui.trade.to, give: [...ui.trade.give], want: [...ui.trade.want] });
      ui.trade = { to: null, give: new Set(), want: new Set() };
      break;
    case 'tradeResp': act('respondTrade', { tradeId: d.id, accept: d.ok === '1' }); break;
    case 'skip': act('skipRound'); break;
    case 'present': act('present', { index: Number(d.i) }); break;
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
    case 'roll': Sounds.play('dados'); act('roll', { hold: [...ui.held] }); break;
    case 'manaMode': ui.manaMode = true; ui.manaPick = new Map(); ui.manaSel = null; render(); break;
    case 'manaCancel': ui.manaMode = false; ui.manaPick = new Map(); ui.manaSel = null; render(); break;
    case 'manaOk':
      Sounds.play('fe');
      act('mana', { assign: [...ui.manaPick].map(([index, face]) => ({ index, face })) });
      break;
    case 'endAttack': act('concede'); break;
    case 'concedeNow': act('concede'); break;
    case 'concede':
      if (confirm('¿Aceptar la derrota?')) act('concede');
      break;
    case 'rival': act('chooseRival', { rivalId: d.id }); break;
    case 'undoReward': act('undoReward'); break;
    case 'pending': act('resolvePending', { choice: d.c }); break;
    case 'exit':
      if (!confirm('¿Salir de la sala? Podrás volver con el mismo enlace.')) break;
      saveSession(null);
      location.href = location.pathname;
      break;
    case 'closeDefeat': ui.defeat = null; renderModal(); break;
    case 'closeCurse': ui.curseAlert = null; renderModal(); break;
    case 'seeRewards': ui.rewardsView = Number(d.i); renderModal(); break;
    case 'closeRewards': ui.rewardsView = null; renderModal(); break;
    case 'seenOutcome':
      ui.seenOutcome = d.k;
      if (d.m !== undefined) ui.seenMatches.add(Number(d.m));
      renderModal();
      break;
    case 'rulesTab': ui.rulesTab = d.t; renderModal(); break;
    case 'closeRules': ui.rules = false; renderModal(); break;
    case 'leave':
      saveSession(null);
      S = null;
      history.replaceState(null, '', location.pathname);
      location.reload();
      break;
    default: break;
  }
});
