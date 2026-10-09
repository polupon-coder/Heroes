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
  counter: { trade: null, give: new Set() },
  seenTrades: new Set(),
  seenCounters: new Set(),
  theft: null,
  detail: null,
  rules: false,
  rulesTab: 'heroe',
  curse: { target: null, amount: 5 },
};

const FACE_LABEL = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', amarillo: 'Amarillo', multicolor: 'Multicolor (comodín)' };
const COLOR_LABEL = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', amarillo: 'Amarillo' };
const FACES = ['rojo', 'azul', 'verde', 'amarillo', 'multicolor'];

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
// Texto en frases cortas, cada una en su línea (punto y aparte).
function lines(...xs) {
  return `<div class="lines">${xs.filter(Boolean).map((x) => `<p>${x}</p>`).join('')}</div>`;
}

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

const SHAPE_LABEL = { circulo: 'Círculo', cuadrado: 'Cuadrado', rombo: 'Rombo', triangulo: 'Triángulo', espiral: 'Espiral (comodín)' };
const WILD = { color: 'multicolor', forma: 'espiral' };

// Una esfera: figura de su forma rellena de su color (img/formas). Sin color = solo
// el contorno de la forma (lo que pide un monstruo de formas). Sin forma = esfera de color.
function die(face, { cls = '', attrs = '', sm = false, shape = null } = {}) {
  // Esfera anulada por un maleficio: solo la calavera.
  if (face === 'maldita') return `<div class="die piece maldita ${sm ? 'sm' : ''} ${cls}" ${attrs} title="Maleficio: esta esfera no cuenta, relánzala"><img src="img/ui/calavera.webp" alt="Maleficio" draggable="false"></div>`;
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

function matchDice(faces, combo, wild = 'multicolor') {
  const needs = {};
  combo.forEach((c) => (needs[c] = (needs[c] || 0) + 1));
  const used = new Set();
  faces.forEach((f, i) => { if (f && f !== wild && needs[f] > 0) { needs[f]--; used.add(i); } });
  let missing = Object.values(needs).reduce((a, b) => a + b, 0);
  faces.forEach((f, i) => { if (missing > 0 && f === wild) { used.add(i); missing--; } });
  return { used, missing };
}

// Qué piezas de lo que pide un monstruo ya cubren tus esferas (para iluminarlas).
function comboCovered(combo, vals, wild) {
  const have = {};
  let wilds = 0;
  for (const v of vals) { if (!v) continue; if (v === wild) wilds++; else have[v] = (have[v] || 0) + 1; }
  const out = combo.map((c) => { if (have[c] > 0) { have[c]--; return true; } return false; });
  return out.map((ok) => { if (ok) return true; if (wilds > 0) { wilds--; return 'wild'; } return false; });
}

// Cómo van las esferas frente a cada monstruo del combate.
function targetMatch(cb, t, faces) {
  const vals = t.tipo === 'forma' ? cb.dice.map((d) => d.shape) : (faces || cb.dice.map((d) => d.face));
  const r = matchDice(vals, t.combo, WILD[t.tipo] || 'multicolor');
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

// Armas afines: +1 de Fuerza si el arma es afín a tu clase (en verde, junto al +N).
function afBonus(it) {
  const p = me();
  return it && it.afin && p && it.afin.includes(p.clase) ? 1 : 0;
}
function afPlus(it) { return afBonus(it) ? ' <span class="af">+1</span>' : ''; }
function itemName(it) { return esc(it.nombre) + afPlus(it); }
function shortName(it) {
  const n = { espada: 'Espada', maza: 'Maza', arco: 'Arco', hacha: 'Hacha', baculo: 'Báculo', cayado: 'Cayado', escudo: 'Escudo', yelmo: 'Yelmo', cota: 'Armadura', armadura: 'Armadura', tunica: 'Túnica', botas: 'Botas' }[it.forma || it.slot];
  return n ? `${n} +${it.bonus}${afPlus(it)}` : esc(rewardEffect(it));
}

function itemDesc(it) {
  if (it.tipo === 'equipo') {
    const slot = { arma: 'Arma · ocupa 1 mano', dosManos: 'Arma · ocupa las 2 manos', escudo: 'Escudo · ocupa 1 mano', yelmo: 'Yelmo', armadura: 'Armadura', tunica: 'Túnica', botas: 'Botas' }[it.slot];
    let d = `${slot} · +${it.bonus} ${it.slot === 'tunica' ? 'Maná' : 'Fuerza'}`;
    if (afBonus(it)) d += ` <span class="af">+1</span> · afín a ${esc(className(me()))}`;
    else if (it.afin && DATA) d += `<br>Afín a: ${it.afin.map((k) => DATA.clases[k].nombre).join(', ')}`;
    return d;
  }
  if (it.efecto === 'mana') return `+${it.valor} Maná durante un combate`;
  if (it.efecto === 'curacion') return `Recupera ${it.valor} de Vida`;
  if (it.efecto === 'robo') return 'Roba 1 objeto a otro jugador (entre combates)';
  return '';
}

function allItems(h) {
  const inv = h.inv;
  return [inv.yelmo, inv.armadura, inv.tunica, inv.botas, ...inv.manos, ...inv.pociones, ...inv.pergaminos].filter(Boolean);
}

function isMyTurnCombat() {
  const p = me();
  if (!p || !p.combat || p.combat.status !== 'activo') return false;
  if (S.phase === 'combat') return p.stage === 'combate';
  if (S.phase === 'torneo') {
    if (S.tournament.stage === 'batalla') return true;
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
  setHtml($('roomInfo'), '');
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

// Ataques de mi duelo del torneo: se cuentan uno a uno en ventanas flotantes.
function trackDuel() {
  if (!S.tournament) return;
  ui.duelQueue = ui.duelQueue || [];
  ui.duelSeen = ui.duelSeen || new Set();
  for (const m of S.tournament.matches) {
    if (!m.last || (m.a !== S.me && m.b !== S.me)) continue;
    const key = `${m.id}:${m.turns}:${m.last.by}:${m.last.dmg}:${m.last.faces.map((f) => f.face).join('')}`;
    if (ui.duelSeen.has(key)) continue;
    ui.duelSeen.add(key);
    if (ui.duelPrimed) ui.duelQueue.push({ ...m.last, label: m.label, vida: byId(m.last.to).hero.vida, max: byId(m.last.to).hero.base.vida });
  }
  ui.duelPrimed = true;
}

// Solo reescribe una zona si su HTML ha cambiado: así los botones no se
// sustituyen (ni se mueven) mientras otro jugador hace algo.
function setHtml(el, html) {
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

// Avisa cuando la Fuerza cruza un escalón: una tirada más o +1 de golpe en la Batalla final.
function trackFuerza() {
  const p = me();
  if (!p || !p.hero || S.phase === 'lobby') { ui.lastFuerza = null; return; }
  const f = p.hero.fuerza;
  const prev = ui.lastFuerza;
  ui.lastFuerza = f;
  if (prev == null || f <= prev || ui.lastFuerzaId !== p.id) { ui.lastFuerzaId = p.id; return; }
  const rolls = tiradasDe;
  const bonus = golpeDe;
  const msgs = [];
  if (rolls(f) > rolls(prev)) msgs.push('Ganas una tirada más.', `Ahora tienes <b>${rolls(f)} tiradas</b>.`);
  if (bonus(f) > bonus(prev)) msgs.push(`Tus golpes hacen <b>+${bonus(f)}</b> de daño.`, 'Solo en la Batalla final.');
  if (msgs.length) { ui.fuerzaMsg = { f, msgs }; Sounds.play('celebracion'); }
}

function render() {
  if (!S) return;
  trackFuerza();
  trackDuel();
  const mp = me();
  if (mp && mp.monster) ui.lastMonster = mp.monster;
  $('home').classList.add('hidden');
  $('homeModal').classList.add('hidden');
  document.body.classList.remove('at-home');
  $('app').classList.remove('hidden');
  setHtml($('roomInfo'), `${S.local && mp ? `<span class="local-who" title="Juega ahora en este dispositivo">${esc(mp.name)}</span>` : ''}<span class="room-name">Sala ${esc(S.code)}</span><button class="exit-btn" data-a="exit" title="Salir de la sala" aria-label="Salir de la sala">×</button>`);
  Sounds.setMusic(S.phase === 'lobby' || S.phase === 'torneo' || S.phase === 'fin');
  playEventSounds();
  $('status').textContent = statusText();

  if (S.phase === 'lobby') {
    $('lobby').classList.remove('hidden');
    $('table').classList.add('hidden');
    setHtml($('lobby'), renderLobby());
  } else {
    $('lobby').classList.add('hidden');
    $('table').classList.remove('hidden');
    syncCombatUi();
    setHtml($('arena'), renderArena());
    setHtml($('sheet'), renderSheet());
    setHtml($('main'), renderMain());
  }
  $('journalBtn').classList.remove('hidden');
  const log = $('log');
  if (setHtml(log, S.log.map((l) => `<div>${esc(l.text)}</div>`).join(''))) log.scrollTop = log.scrollHeight;
  detectNewItems();
  renderModal();
  fitParchments();
}

// Cada ventana usa el pergamino de proporción más parecida a la suya, para que
// la textura no se vea estirada (horizontal, 4:3, cuadrado, 3:4 o vertical).
const PERG = [['h', 1.78], ['133', 1.33], ['100', 1], ['075', 0.75], ['v', 0.56]];
const PERG_SEL = '.card, .journal, .home-sheet, .col-me, .col-rivals, .others-pick';
function fitParchments() {
  for (const el of document.querySelectorAll(PERG_SEL)) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const ar = r.width / r.height;
    let best = PERG[0];
    for (const p of PERG) if (Math.abs(Math.log(p[1] / ar)) < Math.abs(Math.log(best[1] / ar))) best = p;
    if (el.dataset.perg !== best[0]) el.dataset.perg = best[0];
  }
}
window.addEventListener('resize', () => fitParchments());
new MutationObserver(() => requestAnimationFrame(fitParchments)).observe(document.body, { childList: true, subtree: true });

function statusText() {
  switch (S.phase) {
    case 'lobby': return 'Preparando la partida';
    case 'prep': return S.tournament && S.tournament.stage === 'prefinal' ? 'Fase 2 · Torneo · Antes de la final' : S.round > S.rounds ? 'Preparación para el Torneo' : `Fase 1 · Entre combates · Próxima ronda ${S.round}/${S.rounds}`;
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
  const af = afinidadDe(raza, clase);
  const e = (af && DATA.afinidadEfecto && DATA.afinidadEfecto[af]) || { vida: 0, mana: 0, fuerza: 0 };
  let vida = DATA.base.vida + r.vida + c.vida + e.vida;
  if (e.vidaMax) vida = Math.max(e.vidaMin, Math.min(e.vidaMax, vida));
  return {
    vida,
    mana: Math.min(DATA.maxMana || 14, Math.max(5, DATA.base.mana + r.mana + c.mana + e.mana)),
    fuerza: Math.max(DATA.minFuerza || 0, DATA.base.fuerza + r.fuerza + c.fuerza + e.fuerza),
    af,
  };
}

function afinidadDe(raza, clase) {
  const a = DATA && DATA.afinidad && DATA.afinidad[raza];
  if (!a) return null;
  return a.natural.includes(clase) ? 'natural' : a.rara.includes(clase) ? 'rara' : null;
}

function mods(x) {
  const f = (n) => (n > 0 ? `+${n}` : `${n}`);
  return `V${f(x.vida)} · M${f(x.mana)} · F${f(x.fuerza)}`;
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
      const here = (S.local || []).some((l) => l.id === x.id);
      const role = x.id === S.me ? 'Tú' : here ? 'En este dispositivo' : x.id === S.host ? 'Anfitrión' : x.bot ? 'Rival' : x.connected ? 'Amigo' : 'Desconectado';
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
          <div class="seat-btns">${host ? '<button class="btn small" data-a="addBot">Poner un bot</button>' : ''}<button class="btn small" data-a="addLocal">Jugador aquí</button></div>
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
    <div class="pick-top">
      <div class="pick-side"></div>
      <div class="pick-center">
        ${p.raza ? portrait(p.raza, showClass, 'pick', p.color) : '<div class="portrait pick missing">Elige una raza</div>'}
        <div class="pick-name">${p.raza ? esc(raceName(p)) : ''}${p.clase ? ` · ${esc(className(p))}` : ''}</div>
        <div class="afinidad ${preview && preview.af ? preview.af : ''}">${preview && preview.af ? (preview.af === 'natural' ? 'Combinación natural' : 'Combinación rara') : '&nbsp;'}</div>
      </div>
      <div class="pick-right">
      <div class="pick-stats">
        ${preview ? `
          <div class="pstat"><span>Vida</span><b>${preview.vida}</b></div>
          <div class="pstat"><span>Fuerza</span><b>${preview.fuerza}</b></div>
          <div class="pstat"><span>Maná</span><b>${preview.mana}</b></div>
          <div class="pstat"><span>Tiradas</span><b>${tiradasDe(preview.fuerza)}</b></div>` : `
          <div class="pstat"><span>Vida</span><b>–</b></div>
          <div class="pstat"><span>Fuerza</span><b>–</b></div>
          <div class="pstat"><span>Maná</span><b>–</b></div>
          <div class="pstat"><span>Esferas</span><div class="spheres-row">${spheresRow(3, p.color, true, 0)}</div></div>`}
      </div>
      <div class="ready-side">
        ${p.ready
          ? '<button class="seal green" data-a="lobbyReady" data-v="0">Listo ✔</button>'
          : `<button class="seal" data-a="lobbyReady" data-v="1" ${p.raza && p.clase ? '' : 'disabled'}>¡Listo!</button>`}
      </div>
      </div>
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

// Escalones de Fuerza (vienen del servidor): tiradas por combate y golpe en la Batalla final.
function tiradasDe(f) {
  return ((DATA && DATA.tiradasBase) || 3) + ((DATA && DATA.tiradasFuerza) || []).filter((t) => f >= t).length;
}
function golpeDe(f) {
  return ((DATA && DATA.golpeFuerza) || []).filter((t) => f >= t).length;
}

function nextDiceHint(f) {
  const n = tiradasDe(f);
  const next = ((DATA && DATA.tiradasFuerza) || []).find((t) => t > f);
  return next ? `${n} tiradas · ${next - f} de Fuerza más para la ${n + 1}.ª` : `${n} tiradas por combate`;
}

// ---------- Hoja del héroe

// Las esferas disponibles se muestran como esferas, no como un número de dados.
// Las primeras `whites` esferas son multicolor: el Maná las fija como comodín.
// Las últimas `cursed` esferas salen en lila con la calavera: un maleficio pendiente.
function spheresRow(n, color, big = false, whites = 0, cursed = 0) {
  const w = Math.min(n, whites);
  return Array.from({ length: n }, (_, i) => {
    const c = cursed > 0 && i >= n - cursed;
    return `<span class="sphere ${big ? 'big' : ''} ${i < w ? 'multicolor' : 'gris'} ${c ? 'cursed' : ''}" ${c ? 'title="Maleficio: en tu próximo combate se anulará una esfera acertada y tendrás que relanzarla"' : ''}></span>`;
  }).join('');
}

function itemTile(it, label) {
  if (!it) {
    const ghost = { Yelmo: 'yelmo', Armadura: 'cota', 'Túnica': 'tunica', Botas: 'botas', Mano: 'espada', 'Poción': 'pocion', Pergamino: 'pergamino' }[label];
    return `<div class="tile empty" title="${label || ''}"><span class="ring">${ghost ? `<img class="ghost" src="img/objetos/${ghost}-1.webp" alt="">` : ''}<i>${label}</i></span></div>`;
  }
  return `<button class="tile" data-a="item" data-id="${it.id}" title="${esc(it.nombre)}"><span class="ring">${itemIcon(it)}</span><span>${itemName(it)}</span></button>`;
}

function renderSheet() {
  const p = me();
  if (!p || !p.hero) return '';
  const h = p.hero;
  const pct = Math.max(0, Math.min(100, (h.vida / (h.vidaMax || h.base.vida)) * 100));
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
    <div class="spheres-row mine" title="${nextDiceHint(h.fuerza)}">${spheresRow(h.dados, p.color, true, h.fijables, h.curses || 0)}</div>
    <div class="life"><i style="width:${pct}%"></i><span>${h.vida}</span></div>
    <div class="me-sub">${raceName(p)} · ${className(p)}</div>
  </div>
  <div class="glyphs three">
    <div title="Fuerza: ${nextDiceHint(h.fuerza)}"><b>${h.fuerza}</b><span>Fuerza</span></div>
    <div title="Cada 5 de Maná es una esfera multicolor"><b>${h.manaDisponible}${h.manaNext ? `<small class="mana-next">+${h.manaNext}</small>` : ''}</b><span>Maná</span></div>
    <div title="Monedas para la tienda"><b>${h.monedas ?? 0}</b><span>Monedas</span></div>
  </div>
  <div class="tiles">
    ${itemTile(inv.yelmo, 'Yelmo')}${itemTile(inv.armadura, 'Armadura')}${itemTile(inv.tunica, 'Túnica')}
    ${itemTile(inv.botas, 'Botas')}${handTiles.join('')}
    ${slots3(inv.pociones, 'Poción')}
    ${slots3(inv.pergaminos, 'Pergamino')}
  </div>
  <p class="muted small center">${h.victorias} victorias · ${h.trofeos || 0} trofeos · ${h.caidas} caídas</p>`;
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
      <h2>${itemName(it)}</h2>
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
  if (it.efecto === 'mana') ok = myCombat || S.phase === 'prep' || S.phase === 'combat' || S.phase === 'torneo';
  const fullSoon = false;
  if (it.efecto === 'curacion') ok = h.vida < (h.vidaMax || h.base.vida) && !fullSoon && (S.phase === 'prep' || S.phase === 'combat' || (S.phase === 'torneo' && myCombat));
  if (it.efecto === 'robo') ok = S.phase === 'prep';
  if (!ok) return '';
  const label = it.efecto === 'mana' && !myCombat ? 'Beber para el próximo combate' : 'Usar';
  return `<button class="btn primary" data-a="use" data-id="${it.id}" data-efecto="${it.efecto}">${label}</button>`;
}

// ---------- Mesa: cada héroe y contra quién se enfrenta

function opponentOf(p) {
  if (S.phase === 'combat') {
    if (!p.monster && p.stage === 'combate') return { txt: 'tirando…' };
    if (p.monster) {
      const res = p.combat && p.combat.status === 'victoria' ? 'win' : p.combat && p.combat.status === 'derrota' ? 'lose' : '';
      return { art: monsterArt(p.monster, 'foe'), name: p.monster.nombre, res };
    }
  }
  if (S.phase === 'torneo' && S.tournament && S.tournament.stage === 'batalla') {
    const t = S.tournament;
    if (!t.alive.includes(p.id)) return { txt: 'caído', out: true };
    return { txt: p.combat && p.combat.status === 'activo' ? 'tirando…' : 'listo' };
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
  // En la Batalla final todos se ven en el centro: aquí no hace falta repetirlos.
  if (S.phase === 'torneo' && S.tournament && S.tournament.stage === 'batalla') return '';
  return `<h3 class="col-title">Rivales</h3>` + others().map((p) => {
    const h = p.hero;
    const pct = Math.max(0, Math.min(100, (h.vida / (h.vidaMax || h.base.vida)) * 100));
    const o = opponentOf(p);
    const ready = S.phase === 'prep' && p.ready;
    return `
    <div class="rival ${o.out ? 'out' : ''}">
      <div class="rival-pair">
        <div class="rival-side">${heroPortrait(p, 'rival')}</div>
        <div class="rival-vs">${o.art ? 'versus' : ''}</div>
        <div class="rival-side rival-foe ${o.res || ''}">
          ${o.art ? `<div class="foe-imgs" title="${esc(o.name)}">${o.art}</div>` : `<div class="state">${o.txt === '✔ listo' ? '' : o.txt || ''}</div>`}
        </div>
      </div>
      <div class="rival-info">
        <div class="nm">${esc(p.name)} ${ready ? '<span class="check">✔</span>' : ''}${!p.connected && !p.bot ? ' <small class="off">desconectado</small>' : ''}</div>
        <div class="spheres-row">${spheresRow(h.dados, p.color, false, h.fijables, h.curses || 0)}</div>
        <div class="life thin"><i style="width:${pct}%"></i></div>
        <div class="muted small">${esc(raceName(p))} ${esc(className(p))} · Fuerza ${h.fuerza ?? ''} · Vida ${h.vida} · ${h.monedas ?? 0} monedas</div>
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

function battleResultHtml() {
  const t = S.tournament;
  if (!t || t.stage !== 'batalla' || !t.last || ui.battleSeen === t.last.round) return '';
  if (ui.battleSeen == null && t.round > 1 && !ui.battlePrimed) { ui.battlePrimed = true; ui.battleSeen = t.last.round; return ''; }
  ui.battlePrimed = true;
  // Solo la consecuencia: cuánta Vida pierde cada uno y quién cae.
  const lost = {};
  for (const h of t.last.hits) lost[h.to] = (lost[h.to] || 0) + h.dmg;
  for (const [id, n] of Object.entries(t.last.shields || {})) lost[id] = (lost[id] || 0) - n;
  const rows = Object.entries(t.last.vida).map(([id, v]) => {
    const x = byId(id);
    const n = Math.max(0, lost[id] || 0);
    const txt = v <= 0 ? '<b class="bad">cae</b>' : n ? `<b class="bad">−${n}</b> · le quedan ${v}` : '<span class="muted">sin daño</span>';
    return `<div class="br-row">${heroPortrait(x, 'sm')}<b>${id === S.me ? 'Tú' : esc(x.name)}</b> ${txt}</div>`;
  }).join('');
  return `
    <div class="card outcome battle-res">
      <div class="outcome-title">Ronda ${t.last.round}</div>
      ${rows}
      <div class="row center-row"><button class="btn primary" data-a="closeBattle">Continuar</button></div>
    </div>`;
}

function renderOutcome() {
  const p = me();
  if (!p || !p.hero) return '';
  const br = S.phase === 'torneo' ? battleResultHtml() : '';
  if (br) return br;
  // Aviso de Fuerza: ventana de pergamino con lo que has ganado.
  if (ui.fuerzaMsg) {
    return `
      <div class="card outcome fuerza-pop">
        <div class="outcome-title">Fuerza ${ui.fuerzaMsg.f}</div>
        <div class="fz-lines">${ui.fuerzaMsg.msgs.map((m) => `<p>${m}</p>`).join('')}</div>
        <div class="row center-row"><button class="btn primary" data-a="closeFuerza">Continuar</button></div>
      </div>`;
  }
  // Aviso: alguien te ha lanzado un maleficio.
  if (ui.curseAlert) {
    const who = ui.curseAlert.split(' gasta ')[0];
    const n = (ui.curseAlert.match(/anulará\(n\) (\d+)/) || [])[1] || '1';
    return `
      <div class="card outcome curse-alert">
        <div class="curse-sign"><img src="img/ui/calavera.webp" alt=""></div>
        <div class="outcome-title">Maleficio</div>
        ${lines(`<b>${esc(who)}</b> te ha lanzado un maleficio.`, n > 1 ? `Se te anularán ${n} esferas acertadas.` : 'Se te anulará una esfera acertada.', 'Saldrá con la calavera.', 'Tendrás que relanzarla.')}
        <div class="row center-row"><button class="btn primary" data-a="closeCurse">Entendido</button></div>
      </div>`;
  }
  if (ui.coinsMsg && !(p.stage === 'recompensa')) {
    return `
      <div class="card outcome coins-pop">
        <img class="coins-big" src="img/ui/monedas.webp" alt="">
        <p class="center big-text">${esc(ui.coinsMsg)}</p>
        <div class="row center-row"><button class="btn primary" data-a="closeCoins">Continuar</button></div>
      </div>`;
  }
  // Botín de la semifinal: el ganador elige un objeto del vencido.
  if (S.phase === 'torneo' && S.tournament && S.tournament.stage === 'botin' && S.tournament.loot && S.tournament.loot.winner === S.me) {
    const loser = byId(S.tournament.loot.loser);
    return `
      <div class="card outcome prep-win">
        <div class="outcome-title">Botín</div>
        ${lines(`Has vencido a ${esc(loser.name)}.`, 'Elige uno de sus objetos.')}
        <div class="trade-grid">${allItems(loser.hero).map((it) => tradeTile(it, { attrs: `data-a="loot" data-id="${it.id}"` })).join('')}</div>
      </div>`;
  }
  if (ui.duelQueue && ui.duelQueue.length) {
    const a = ui.duelQueue[0];
    // Se cierra sola enseguida: así nunca tapa el siguiente ataque ni el maleficio.
    if (!ui.duelTimer) ui.duelTimer = setTimeout(() => { ui.duelTimer = null; if (ui.duelQueue[0] === a) ui.duelQueue.shift(); renderModal(); }, 2200);
    const by = byId(a.by);
    const to = byId(a.to);
    const mine = a.by === S.me;
    const pct = Math.max(0, Math.min(100, (a.vida / a.max) * 100));
    return `
      <div class="card outcome duel-pop ${a.dmg ? 'hit' : 'miss'}">
        <div class="duel-pop-head">${esc(a.label)}</div>
        <div class="outcome-title">${mine ? 'Tu ataque' : `Ataque de ${esc(by.name)}`}</div>
        <div class="duel-pop-pair">${heroPortrait(by, 'duelist')}<span class="faceoff-vs">→</span>${heroPortrait(to, 'duelist')}</div>
        <div class="dice">${a.faces.map((f) => die(f.face, { shape: f.shape })).join('')}</div>
        <p class="center big-text">${a.dmg ? `¡Golpe! ${mine ? esc(to.name) : 'Pierdes'} −${a.dmg} Vida` : (mine ? 'Has fallado el ataque' : `${esc(by.name)} falla su ataque`)}</p>
        <div class="duel-life"><span>${esc(to.name)}</span><div class="life"><i style="width:${pct}%"></i><span>${a.vida}</span></div></div>
        <div class="row center-row"><button class="btn primary" data-a="nextDuel">Continuar</button></div>
      </div>`;
  }
  if (ui.stealResult) {
    return `
      <div class="card outcome">
        <div class="outcome-title">${ui.stealResult.ok ? '¡Robado!' : 'Robo'}</div>
        ${lines(...ui.stealResult.text.replace(/\.$/, '').split(/:\s*| y (?=roba|pierde)/).map((x, i) => esc(x.charAt(0).toUpperCase() + x.slice(1) + '.')))}
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
        ${lines(`Has derrotado a ${esc(p.monster.nombre)} ${esc((p.monster.tamano || '').toLowerCase())}.`, p.monster.tier === 4 ? 'Ganas un trofeo.' : '', p.monster.tier === 4 ? '+1 de Vida en la Batalla final.' : '', 'Elige tu recompensa.')}
        <div class="reward-pick">${p.rewards.map((it, i) => `
          <button class="reward-choice" data-a="reward" data-i="${i}">
            <span class="big-item">${itemIcon(it)}</span>
            <span class="rc-text"><b>${itemName(it)}</b><small>${itemDesc(it)}</small></span>
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
        ${(() => { const dn = (ui.defeat.text.match(/quita (\d+)/) || [])[1]; return lines('No derrotas a ningún monstruo.', m && dn ? `${esc(m.nombre)} te quita ${dn} de Vida.` : ''); })()}
        ${ui.defeat.fell ? `<div class="warn">${lines('Has caído a 0 Vida.', 'Pierdes todos tus objetos.', 'Recuperas la Vida inicial.')}</div>` : ''}
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
            <figure>${heroPortrait(w, 'duelist')}<figcaption><b>${esc(w.name)}</b></figcaption></figure>
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
    <section><div class="rule-ill"><img class="tall" src="img/heroes/enano-guerrero.webp" alt=""><span class="plus">=</span><span class="lbl">Enano<br>+<br>Guerrero</span></div><h4>Raza y clase</h4>
      <p>Tu héroe es una <b>Raza</b> y una <b>Clase</b>. Algunas parejas son <b class="ok">naturales</b> (+1 Fuerza y +1 Maná)
      y otras <b class="bad">raras</b> (−1 Vida): se indica al elegir.</p></section>
    <section><div class="rule-ill"><div class="life rl"><i style="width:70%"></i><span>10 / 14</span></div></div><h4>Vida</h4><p>Lo que aguantas. No se recupera sola: solo con pociones y pergaminos de curación. La que te quede al acabar la aventura es con la que entras en la Batalla final.</p></section>
    <section><div class="rule-ill"><span class="sphere big gris"></span><span class="sphere big gris"></span><span class="sphere big gris"></span><span class="sphere big gris"></span><span class="sphere big gris"></span><span class="lbl">Fuerza 22<br>= 4 tiradas</span></div><h4>Fuerza</h4><p>Siempre lanzas <b>5 esferas</b>. La Fuerza da tiradas: <b>3</b>, <b>4</b> con Fuerza 22 y <b>5</b> con 30. En la Batalla final, además, suma daño a tus golpes: <b>+1</b> con Fuerza 22, <b>+2</b> con 30 y <b>+3</b> con 38.</p></section>
    <section><div class="rule-ill"><img src="img/formas/espiral-multicolor.webp" alt=""><span class="lbl">5 Maná<br>= 1 comodín</span></div><h4>Maná</h4><p>Cada <b>5</b> de Maná convierte una esfera en <b>comodín</b> (multicolor con espiral), fijada desde el inicio del combate.</p></section>
    <section><div class="rule-ill"><img src="img/objetos/yelmo-1.webp" alt=""><img src="img/objetos/espada-2.webp" alt=""><img src="img/objetos/tunica-1.webp" alt=""></div><h4>Equipo</h4><p>Yelmo, armadura, túnica, botas y dos manos (un arma a dos manos ocupa las dos; como mucho un escudo).
      El equipo suma <b>Fuerza</b>; la <b>túnica</b> suma <b>Maná</b>. Hasta 3 pociones y 3 pergaminos.</p></section>
    <section><div class="rule-ill"><img src="img/objetos/arco-2.webp" alt=""><span class="lbl">Arco +3 <span class="af">+1</span></span></div><h4>Armas afines</h4><p>Cada clase maneja mejor ciertas armas: le dan <b class="af">+1</b> de Fuerza extra.
      Arco → Explorador y Ladrón · Báculo → Mago · Cayado → Druida · Maza → Clérigo · Hacha → Bárbaro · Espada y Escudo → Guerrero.</p></section>`],
  aventura: ['Aventura', `
    <section><div class="rule-ill"><img class="tall s1" src="img/monstruos/diablillo-1.webp" alt=""><img class="tall" src="img/monstruos/orco-2.webp" alt=""><img class="tall s3" src="img/monstruos/dragon-3.webp" alt=""></div><h4>12 rondas, 5 monstruos</h4><p>En cada ronda aparecen <b>5 monstruos</b>, de pequeño a grande. Los ves en un carrusel: el del centro y sus vecinos a los lados (desliza o usa las flechas).</p></section>
    <section><div class="rule-ill"><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="plus">…</span><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big rojo"></span></div><h4>De pequeño a grande</h4><p>Cada uno pide algo más difícil: desde tres iguales y una distinta hasta cinco iguales. Cuanto más grande, más daño hace y mejores son sus monedas y objetos. A medida que avanza la aventura, todos piden más: al final hasta el más pequeño pide cuatro iguales y una distinta.</p></section>
    <section><div class="rule-ill"><img src="img/objetos/espada-1.webp" alt=""><img src="img/ui/monedas.webp" alt=""></div><h4>Si ganas</h4><p>Eliges 1 de 2 recompensas y ganas <b>monedas</b>: cuanto más grande el monstruo, más monedas y mejores objetos.</p></section>
    <section><div class="rule-ill"><img class="tall" src="img/monstruos/dragon-3.webp" alt=""><span class="lbl">+1 Vida</span></div><h4>Trofeos</h4><p>Cada <b>monstruo grande</b> que derrotes es un trofeo. Cada trofeo te da <b>+1 de Vida</b> en la Batalla final.</p></section>
    <section><div class="rule-ill"><span class="big-dmg">−4</span><span class="lbl">Vida</span></div><h4>Si pierdes</h4><p>Pierdes la Vida que marca el monstruo. Si caes a 0 pierdes <b>todos tus objetos y monedas</b> y recuperas la Vida inicial.</p></section>`],
  combate: ['Combate', `
    <section><div class="rule-ill"><img src="img/formas/circulo-rojo.webp" alt=""><img src="img/formas/cuadrado-azul.webp" alt=""><img src="img/formas/rombo-verde.webp" alt=""><img src="img/formas/triangulo-amarillo.webp" alt=""><img src="img/formas/espiral-multicolor.webp" alt=""></div><h4>Esferas</h4><p>Cada esfera tiene un <b>color</b> (rojo, azul, verde, amarillo o <b>multicolor</b> = comodín)
      y una <b>forma</b> (círculo, cuadrado, rombo, triángulo o <b>espiral</b> = comodín).</p></section>
    <section><div class="rule-ill"><span class="dice"><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big azul"></span></span><span class="plus">o</span><img src="img/formas/rombo-tinta.webp" alt=""><img src="img/formas/triangulo-tinta.webp" alt=""></div><h4>Qué piden</h4><p>Cada monstruo pide <b>solo colores</b> o <b>solo formas</b>. Las esferas que le sirven al monstruo del centro se iluminan, y también lo que ya tienes de lo que pide.</p></section>
    <section><div class="rule-ill"><img src="img/formas/circulo-rojo.webp" alt=""><span class="reroll-ill"><img src="img/formas/cuadrado-verde.webp" alt=""></span><span class="lbl">1/3</span></div><h4>Tiradas</h4><p>Pulsa <b>Atacar</b>. Toca una esfera para marcarla o desmarcarla: las marcadas se relanzan. En cuanto completes cualquier monstruo puedes <b>Derrotarlo</b>, o seguir tirando a por uno más grande.</p></section>
      (toca una esfera para marcarla o desmarcarla). Cuando completes un monstruo, pulsa <b>Derrotar</b>.</p></section>
    <section><div class="rule-ill"><span class="big-dmg">−2</span></div><h4>Si no llegas</h4><p>Si se acaban las tiradas sin completar ninguno, pierdes contra el más pequeño.</p></section>`],
  entre: ['Entre rondas', `
    <section><div class="rule-ill"><img src="img/objetos/pocion-1.webp" alt=""><span class="plus">⇄</span><img src="img/objetos/botas-1.webp" alt=""></div><h4>Comerciar</h4><p>Ofreces objetos; los demás te dicen qué te dan a cambio y tú aceptas o rechazas. Una oferta por ronda.</p></section>
    <section><div class="rule-ill"><img src="img/objetos/escudo-1.webp" alt=""><img src="img/ui/monedas.webp" alt=""></div><h4>Comprar</h4><p>Cada ronda la tienda tiene objetos nuevos con su precio en <b>monedas</b>. Una compra por ronda.</p></section>
    <section><div class="rule-ill"><img src="img/objetos/pergamino-2.webp" alt=""><span class="lbl">1-2 ✔<br>3-5 ✘<br>6 –</span></div><h4>Robar</h4><p>Con Pergamino de Robo, seguro. Sin él tiras un dado: <b>1–2</b> robas · <b>3–5</b> pierdes tu Maná en el próximo combate · <b>6</b> nada.</p></section>
    <section><div class="rule-ill"><img src="img/ui/calavera.webp" alt=""></div><h4>Maleficio</h4><p>Gasta 5 de Maná: en su próximo combate, al rival se le anula una esfera acertada: sale con la calavera, no cuenta y tiene que relanzarla (verás cuál, con la calavera).
      Cada héroe recibe como mucho uno por ronda.</p></section>`],
  sala: ['Sala', `
    <section><div class="rule-ill"><img class="tall" src="img/heroes/humano-guerrero.webp" alt=""><span class="plus">+</span><img class="tall" src="img/heroes/elfo-mago.webp" alt=""></div><h4>Jugar en el mismo dispositivo</h4><p>En la sala, <b>Jugador aquí</b> añade a otro jugador que juega en tu mismo ordenador o móvil.
      Se juega por turnos: cuando te toca a ti aparece <b>«Turno de…»</b> y te pasan el dispositivo. Se puede mezclar con amigos conectados desde otros dispositivos y con bots.</p></section>`],
  torneo: ['Batalla final', `
    <section><div class="rule-ill"><img class="tall" src="img/heroes/humano-guerrero.webp" alt=""><span class="plus">vs</span><img class="tall" src="img/heroes/elfo-mago.webp" alt=""><span class="plus">vs</span><img class="tall" src="img/heroes/enano-guerrero.webp" alt=""></div><h4>Todos contra todos</h4><p>Tras la aventura, cada uno llega con la Vida que le queda, más 1 por cada trofeo, y luchan a la vez. Cada ronda todos tiran sus 5 esferas (3 tiradas) y, al acabar, cada uno elige a quién golpea. Gana el último en pie.</p></section>
    <section><div class="rule-ill"><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="sphere big rojo"></span><span class="lbl">→ −2</span></div><h4>Golpear</h4><p>Cuentan las esferas del <b>color de tu víctima</b> (y los comodines): 3 → 2 de daño, 4 → 4, 5 → 6. Tu Fuerza suma: +1 con Fuerza 22, +2 con 30, +3 con 38.</p></section>
    <section><div class="rule-ill"><span class="sphere big azul"></span><span class="lbl">🛡 −1</span></div><h4>Escudo</h4><p>Cada esfera de <b>tu propio color</b> te quita 1 del daño que recibes esa ronda.</p></section>
    <section><div class="rule-ill"><img src="img/ui/calavera.webp" alt=""></div><h4>Maldecir</h4><p>Una vez por ronda puedes maldecir a un rival: cada calavera (5 Maná) le anula una esfera acertada.</p></section>`],

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
  const healTxt = texts.find((t) => t.startsWith(`💚 ${name} usa `));
  if (healTxt) { const n = (healTxt.match(/recupera (\d+)/) || [])[1]; toast(`Recuperas ${n} de Vida`); Sounds.play('fe'); }
  const coinsTxt = texts.find((t) => t.startsWith(`💰 ${name} gana `));
  if (coinsTxt) ui.coinsMsg = coinsTxt.replace(/^💰 /, '').replace(`${name} gana`, 'Has ganado');
  const stole = texts.find((t) => /^(🦝|🪤|🎲) /.test(t) && t.includes(`${name} saca`));
  if (stole) ui.stealResult = { ok: stole.startsWith('🦝'), text: stole.replace(/^\S+ /, '') };
  const cursed = texts.find((t) => t.includes(`lanza un maleficio a ${name}:`));
  // Maleficio: risa cuando te lo lanzan o cuando lo lanzas tú.
  const castByMe = texts.some((t) => t.startsWith(`${name} gasta `) && t.includes('lanza un maleficio'));
  if (cursed || castByMe) Sounds.play('risa');
  if (cursed) { ui.curseAlert = cursed; }
  else if (texts.some((t) => /^💥/.test(t) && t.includes(name))) Sounds.play('batalla');
  else if (texts.some((t) => /^🔮/.test(t) && t.includes(name))) Sounds.play('fe');
  else if (texts.some((t) => t.startsWith(`${name} se enfrenta a`))) Sounds.play('batalla');
  else if (has(/^— Ronda/)) Sounds.play('rugido');
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
  box.innerHTML = `<div class="reveal-card card"><div class="reveal-title">Has conseguido</div><div class="big-item">${itemIcon(it)}</div><h2>${itemName(it)}</h2><p>${itemDesc(it)}</p></div>`;
  box.classList.remove('hidden');
  Sounds.play('fe');
  clearTimeout(revealTimer);
  revealTimer = setTimeout(closeReveal, 7000);
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
  const prefinal = S.tournament && S.tournament.stage === 'prefinal';
  const incoming = pendingCounters().length + unansweredTrades().length;
  return `
  <div class="card prep-card">
    <img class="prep-cover" src="img/ui/${torneo || prefinal ? 'espadas' : 'monstruo'}.webp" alt="">
    <h2>${prefinal ? 'Preparación para la final' : torneo ? 'Preparación para el Torneo' : `Ronda ${S.round} de ${S.rounds}`}</h2>
    <div class="prep-actions">
      ${p.ready
        ? '<button class="seal green" data-a="ready" data-v="0">Listo ✔</button>'
        : `<button class="seal" data-a="ready" data-v="1">¡Listo!</button>`}
      <div class="prep-buttons">
        <button class="btn ${incoming ? 'alert' : ''}" data-a="prepWin" data-w="trade">Comerciar${incoming ? ` <span class="badge">${incoming}</span>` : ''}</button>
        <button class="btn curse-btn" data-a="prepWin" data-w="curse" ${S.round <= 1 ? 'disabled title="Desde la ronda 2"' : ''}>Maleficio</button>
        <button class="btn" data-a="prepWin" data-w="steal">Robar</button>
        <button class="btn" data-a="prepWin" data-w="shop" ${p.boughtThisRound ? 'title="Ya has comprado esta ronda"' : ''}>Comprar</button>
      </div>
    </div>
  </div>`;
}

// Ventana flotante de cada acción entre combates.
function renderPrepWin() {
  if (S.phase !== 'prep' || !ui.prepWin) return '';
  const body = ui.prepWin === 'trade' ? renderTrade() : ui.prepWin === 'curse' ? renderMagic() : ui.prepWin === 'shop' ? renderShop() : renderTheft();
  return `<div class="card prep-win"><button class="modal-close" data-a="closePrep" aria-label="Cerrar" title="Cerrar">×</button>${body}</div>`;
}

function renderShop() {
  const p = me();
  const coins = p.hero.monedas || 0;
  const shop = p.shop || [];
  return `
    <h3>Comprar</h3>
    <p class="center shop-coins">Tienes <b>${coins}</b> monedas${p.boughtThisRound ? ' · ya has comprado esta ronda' : ' · una compra por ronda'}</p>
    <div class="trade-grid">${shop.map((it) => {
      const can = !p.boughtThisRound && coins >= it.precio;
      return `<div class="shop-item ${can ? '' : 'locked'}">
        ${tradeTile(it)}
        <button class="btn small ${can ? 'primary' : ''}" data-a="buy" data-id="${it.id}" ${can ? '' : 'disabled'}>${it.precio} monedas</button>
      </div>`;
    }).join('') || '<p class="muted center">No queda nada a la venta.</p>'}</div>`;
}

// Antes de la final solo puedes robar o lanzar maleficios a tu rival de la final.
function finalFoeId() {
  const f = S.pendingFinal;
  return f && f.includes(S.me) ? f.find((id) => id !== S.me) : null;
}
function prepTargets() {
  const foe = finalFoeId();
  return foe ? others().filter((o) => o.id === foe) : others();
}

function renderTheft() {
  const p = me();
  const t = ui.theft || (ui.theft = { targetId: null });
  if (!t.targetId && prepTargets().length === 1) t.targetId = prepTargets()[0].id;
  const target = t.targetId && byId(t.targetId);
  const scroll = [...p.hero.inv.pergaminos].find((it) => it.efecto === 'robo');
  const picked = target && t.itemId && allItems(target.hero).find((it) => it.id === t.itemId);
  return `
    <h3>Robar</h3>
    <div class="muted small">${lines('Con Pergamino de Robo, te lo llevas seguro.', 'Sin él, tiras un dado.', '1-2: lo robas.', '3-5: pierdes tu Maná en el próximo combate.', '6: no pasa nada.')}</div>
    <div class="row">${prepTargets().map((o) => `<button class="btn small ${t.targetId === o.id ? 'selected' : ''}" data-a="theftTarget" data-id="${o.id}">${esc(o.name)}</button>`).join('')}</div>
    ${target ? (allItems(target.hero).length ? `<div class="steal-items">${allItems(target.hero).map((it) => `
      <button class="steal-item ${t.itemId === it.id ? 'selected' : ''}" data-a="theftItem" data-id="${it.id}">
        <span class="ring">${itemIcon(it)}</span><span>${itemName(it)}</span></button>`).join('')}</div>`
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
  const targets = prepTargets().filter((o) => !o.cursedThisRound);
  if (ui.curse.target && !targets.some((o) => o.id === ui.curse.target)) ui.curse.target = null;
  // Si solo hay un rival posible, ya queda elegido.
  if (!ui.curse.target && targets.length === 1) ui.curse.target = targets[0].id;
  const tName = ui.curse.target && byId(ui.curse.target) ? byId(ui.curse.target).name : '';
  return `
    <h3>Maleficio</h3>
    ${amounts.length && targets.length ? `
      ${finalFoeId() ? '' : `<div class="muted small">${lines('Elige a quién.', 'Un maleficio por rival y ronda.')}</div>`}
      <div class="row curse-targets">${prepTargets().map((o) => o.cursedThisRound
        ? `<button class="btn small" disabled title="Ya tiene un maleficio esta ronda">${esc(o.name)} <small>(ya tiene uno)</small></button>`
        : `<button class="btn small ${ui.curse.target === o.id ? 'selected' : ''}" data-a="curseTarget" data-id="${o.id}">${esc(o.name)}</button>`).join('')}</div>
      <div class="row">${amounts.map((a) => `<button class="btn tiny ${ui.curse.amount === a ? 'selected' : ''}" data-a="curseAmount" data-n="${a}">${a} Maná</button>`).join('')}</div>
      <div class="row"><button class="btn primary" data-a="curse" ${ui.curse.target ? '' : 'disabled'}>${tName ? `Lanzar maleficio a ${esc(tName)}` : 'Toca un rival para elegirlo'}</button></div>`
    : `<p class="muted small center">${amounts.length ? 'Todos los rivales ya han recibido un maleficio esta ronda.' : 'Necesitas al menos 5 de Maná disponible.'}</p>`}`;
}

// ---------- Comercio: oferta pública, respuestas y aceptar o rechazar

function tradeTile(it, { selected = false, attrs = '' } = {}) {
  return `<button class="trade-tile ${selected ? 'selected' : ''}" ${attrs}>
    <span class="ring">${itemIcon(it)}</span><b>${itemName(it)}</b><small>${esc(rewardEffect(it))}</small></button>`;
}
function tradeItems(owner, ids) {
  return ids.map((id) => allItems(owner.hero).find((x) => x.id === id)).filter(Boolean);
}
function myOpenTrade() { return (S.trades || []).find((t) => t.from === S.me && t.status === 'abierta'); }
// Ofertas de otros a las que aún no he respondido.
function unansweredTrades() {
  const p = me();
  if (!p || p.tradedThisRound) return [];
  const foe = finalFoeId();
  return (S.trades || []).filter((t) => t.status === 'abierta' && t.from !== S.me && t.from !== foe && !t.counters.some((c) => c.by === S.me));
}
function pendingCounters() {
  const t = myOpenTrade();
  return t ? t.counters.filter((c) => c.status === 'pendiente') : [];
}

function renderTrade() {
  const p = me();
  const mine = myOpenTrade();
  const items = allItems(p.hero);
  let body = '';
  if (p.tradedThisRound) body = '<p class="muted center">Ya has comerciado esta ronda.</p>';
  else if (mine) {
    const counters = mine.counters.filter((c) => c.status === 'pendiente');
    body = `
      <div class="trade-block">
        <h4>Tu oferta</h4>
        <div class="trade-grid">${tradeItems(p, mine.give).map((it) => tradeTile(it)).join('')}</div>
      </div>
      <div class="trade-block">
        <h4>Lo que te ofrecen a cambio</h4>
        ${counters.length ? counters.map((c) => { const o = byId(c.by); return `
          <div class="trade-counter">
            <div class="who">${esc(o.name)}</div>
            <div class="trade-grid">${tradeItems(o, c.give).map((it) => tradeTile(it)).join('')}</div>
            <div class="row"><button class="btn primary" data-a="answer" data-t="${mine.id}" data-c="${c.id}" data-ok="1">Aceptar</button><button class="btn" data-a="answer" data-t="${mine.id}" data-c="${c.id}" data-ok="0">Rechazar</button></div>
          </div>`; }).join('') : '<p class="muted center">Todavía nadie ha respondido.</p>'}
      </div>
      <div class="row"><button class="btn small" data-a="withdraw" data-t="${mine.id}">Retirar oferta</button></div>`;
  } else if (p.offeredThisRound) body = '<p class="muted center">Ya has hecho tu oferta de esta ronda.</p>';
  else body = `
      <div class="trade-block">
        <h4>¿Qué ofreces?</h4>
        ${items.length ? `<div class="trade-grid">${items.map((it) => tradeTile(it, { selected: ui.trade.give.has(it.id), attrs: `data-a="tgive" data-id="${it.id}"` })).join('')}</div>` : '<p class="muted center">No tienes objetos para ofrecer.</p>'}
        <p class="muted small center">${finalFoeId() ? `Antes de la final no puedes comerciar con ${esc(byId(finalFoeId()).name)}.` : 'Los demás verán tu oferta.</p><p>Te dirán qué te dan a cambio.</p><p>Una oferta por ronda.'}</p>
      </div>
      <div class="row"><button class="btn primary" data-a="offer" ${ui.trade.give.size ? '' : 'disabled'}>Ofrecer</button></div>`;
  const others = unansweredTrades();
  return `
    <h3>Comerciar</h3>
    ${body}
    ${others.length ? `<div class="trade-block"><h4>Ofertas de los demás</h4>${others.map((t) => { const o = byId(t.from); return `
      <div class="trade-counter"><div class="who">${esc(o.name)} ofrece</div>
        <div class="trade-grid">${tradeItems(o, t.give).map((it) => tradeTile(it)).join('')}</div>
        <div class="row"><button class="btn" data-a="respondTo" data-t="${t.id}">Ofrecer algo a cambio</button></div></div>`; }).join('')}</div>` : ''}`;
}

// Ventanas emergentes del comercio: alguien responde a tu oferta o alguien ofrece algo.
function renderTradePopup() {
  if (!S || S.phase !== 'prep') return '';
  const p = me();
  const mine = myOpenTrade();
  const c = pendingCounters().find((x) => !(ui.seenCounters || new Set()).has(x.id));
  if (mine && c) {
    const o = byId(c.by);
    return `
      <div class="card prep-win trade-pop">
        <h3>${esc(o.name)} te ofrece</h3>
        <div class="trade-grid">${tradeItems(o, c.give).map((it) => tradeTile(it)).join('')}</div>
        <p class="center muted">a cambio de</p>
        <div class="trade-grid">${tradeItems(p, mine.give).map((it) => tradeTile(it)).join('')}</div>
        <div class="row"><button class="btn primary" data-a="answer" data-t="${mine.id}" data-c="${c.id}" data-ok="1">Aceptar</button><button class="btn" data-a="answer" data-t="${mine.id}" data-c="${c.id}" data-ok="0">Rechazar</button></div>
      </div>`;
  }
  const t = unansweredTrades().find((x) => !(ui.seenTrades || new Set()).has(x.id) || ui.counter.trade === x.id);
  if (t) {
    const o = byId(t.from);
    const items = allItems(p.hero);
    if (ui.counter.trade !== t.id) ui.counter = { trade: t.id, give: new Set() };
    return `
      <div class="card prep-win trade-pop">
        <h3>${esc(o.name)} ofrece</h3>
        <div class="trade-grid">${tradeItems(o, t.give).map((it) => tradeTile(it)).join('')}</div>
        <h4>¿Qué le das a cambio?</h4>
        ${items.length ? `<div class="trade-grid">${items.map((it) => tradeTile(it, { selected: ui.counter.give.has(it.id), attrs: `data-a="tcounter" data-id="${it.id}"` })).join('')}</div>` : '<p class="muted center">No tienes objetos para ofrecer.</p>'}
        <div class="row"><button class="btn primary" data-a="counterSend" ${ui.counter.give.size ? '' : 'disabled'}>Ofrecer a cambio</button><button class="btn" data-a="counterSkip">No me interesa</button></div>
      </div>`;
  }
  return '';
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

// Propuesta de qué relanzar según el monstruo (o rival) del centro: se conservan
// las esferas que le sirven y se marcan para relanzar las demás.
function suggestHold() {
  const p = me();
  const cb = p && p.combat;
  if (!cb || cb.status !== 'activo' || !cb.rolls) return;
  let keep = new Set();
  if (cb.kind === 'monstruo' && p.offers) {
    const st = bestTarget(cb).all[ui.foeIdx || 0];
    keep = st ? st.used : new Set();
  } else if (cb.kind === 'batalla' && S.tournament) {
    const r = battleRivals()[ui.foeIdx || 0];
    if (r) cb.dice.forEach((d, i) => { if (d.face === r.color || d.face === 'multicolor') keep.add(i); });
  } else return;
  ui.held = new Set();
  cb.dice.forEach((d, i) => { if (d.fixed || keep.has(i)) ui.held.add(i); });
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
      const { used, all } = bestTarget(cb);
      // Tras cada tirada, el carrusel se pone en el monstruo más grande que ya completas.
      if (cb.kind === 'monstruo' && cb.rolls > 0) {
        const done = all.map((x, i) => (x.ok ? i : -1)).filter((i) => i >= 0);
        if (done.length) { ui.foeKey = cb.label + S.round; ui.foeIdx = Math.max(...done); }
      }
      cb.dice.forEach((d, i) => { if (d.fixed || (cb.rolls > 0 && used.has(i))) ui.held.add(i); });
      if (cb.kind === 'monstruo' && p.offers) foeIndex(p, cb);
      if (cb.kind === 'batalla' && S.tournament) rivalIndex(battleRivals().length);
      if (cb.rolls > 0 && (cb.kind === 'monstruo' || cb.kind === 'batalla')) suggestHold();
    }
  }
}

function renderCombat(p, controllable) {
  const cb = p.combat;
  const mine = p.id === S.me;
  const faces = cb.dice.map((d, i) => (mine && ui.manaPick.has(i) ? ui.manaPick.get(i) : d.face));
  const monster = cb.kind === 'monstruo' && cb.targets && p.offers;
  const bt = bestTarget(cb, faces);
  const all = bt.all;
  // Contra monstruos, se iluminan las esferas que sirven al monstruo del centro del carrusel.
  const centerIdx = cb.kind === 'monstruo' && p.offers ? foeIndex(p, cb) : null;
  let used = centerIdx != null && all[centerIdx] ? all[centerIdx].used : bt.used;
  if (cb.kind === 'batalla' && S.tournament) {
    const r = battleRivals()[ui.foeIdx || 0];
    used = new Set(r ? cb.dice.map((d, i) => (d.face === r.color || d.face === 'multicolor' ? i : -1)).filter((i) => i >= 0) : []);
  }
  const fijables = mine ? p.hero.fijables : null;
  const diceHtml = cb.dice.length
    ? cb.dice.map((d, i) => {
      const cls = [
        used.has(i) ? 'success' : '',
        (cb.cursed || []).some((c) => c.index === i) ? 'cursed' : '',
        d.fixed ? 'fixed' : '',
        controllable && !ui.manaMode && cb.rolls > 0 && cb.rolls < cb.maxRolls && !ui.held.has(i) && !d.fixed ? 'reroll' : '',
        controllable && ui.manaMode && (ui.manaSel === i || ui.manaPick.has(i)) ? 'picking' : '',
      ].join(' ');
      const html = die(faces[i], { cls, shape: d.shape, attrs: controllable ? `data-a="die" data-i="${i}"` : '' });
      return html;
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
    const left = cb.maxRolls - cb.rolls;
    const rerollN = cb.dice.filter((d, i) => !d.fixed && !ui.held.has(i)).length;
    const manaPot = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'mana');
    controls = `<div class="controls">
      <div class="row">
        ${cb.rolls === 0 ? '<button class="btn primary" data-a="roll">Atacar</button>' : ''}
        ${cb.rolls > 0 && left > 0 && cb.dice.some((d) => !d.fixed) ? `<button class="btn primary" data-a="roll" ${rerollN ? '' : 'disabled'}>Relanzar ${rerollN}</button>` : ''}
      </div>
      <div class="rolls-left">${cb.rolls}/${cb.maxRolls}</div>
      ${cb.kind === 'batalla' && !p.battleCursed && p.hero.manaDisponible >= 5 ? '<div class="duel-curse"><button class="btn curse-btn" data-a="duelCursePick" data-t="b">Maldecir</button></div>' : ''}
      ${cb.kind === 'duelo' && S.tournament ? (() => { const m = S.tournament.matches.find((x) => x.started && !x.winner && (x.a === p.id || x.b === p.id)); return m ? duelCurseHtml(S.tournament, m) : ''; })() : ''}
      ${cb.kind !== 'duelo' && cb.rolls > 0 && left > 0 && cb.dice.some((d) => !d.fixed) && !(cb.cursed || []).length ? '<div class="muted small center">Toca una esfera para marcarla o desmarcarla: las marcadas se relanzan.</div>' : ''}
      ${manaPot ? `<div class="row"><button class="btn small" data-a="use" data-id="${manaPot.id}" data-efecto="mana">Beber ${esc(manaPot.nombre)}</button></div>` : ''}
      ${cb.rolls > 0 && cb.kind === 'duelo' ? `<div class="row"><button class="btn small" data-a="endAttack">${duelBtnText(p, duelDamage(cb, faces))}</button></div>` : ''}
      ${cb.rolls >= cb.maxRolls && cb.kind === 'monstruo' && !all.some((x) => x.ok) ? '<div class="row"><button class="btn small" data-a="concedeNow">Aceptar derrota</button></div>' : ''}</div>`;
  }

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
    ${monster ? foesHtml(p, cb, all, controllable) : cb.kind === 'batalla' ? '' : cb.kind === 'duelo' ? `<div class="duel-target">${comboHtml(cb.combo, false)}</div>` : `<h2 class="center" style="margin:0">${esc(cb.label)}</h2>`}
    ${controllable || cb.kind === 'duelo' || cb.kind === 'batalla' ? '' : `<div class="rolls-count">${cb.rolls}/${cb.maxRolls}</div>`}
    ${monster || cb.kind === 'duelo' || cb.kind === 'batalla' ? '' : `<div class="targetline"><span class="muted">Necesitas:</span>${comboHtml(cb.combo)}</div>`}
    <div class="dice-zone"><div class="dice">${diceHtml}</div></div>
        ${result}
    ${controls}
    ${cb.kind === 'duelo' ? '' : `<div class="events">${cb.events.slice().reverse().map((e) => `<div>${esc(e)}</div>`).join('')}</div>`}
  </div>`;
}

// Botón para acabar el ataque en un duelo: dice qué pasará.
function duelBtnText(p, dmg) {
  const m = S.tournament && S.tournament.matches.find((x) => !x.winner && (x.a === p.id || x.b === p.id));
  const foe = m && byId(m.a === p.id ? m.b : m.a);
  const name = foe ? esc(foe.name) : 'tu rival';
  return dmg ? `Terminar: quitas ${dmg} de Vida a ${name}` : 'Terminar sin hacer daño';
}



// Efecto de una recompensa en pocas palabras (sin nombre).
function rewardEffect(it) {
  if (it.tipo === 'equipo') return `${it.slot === 'tunica' ? 'Maná' : 'Fuerza'} +${it.bonus}`;
  if (it.efecto === 'mana') return `Maná +${it.valor}`;
  if (it.efecto === 'curacion') return `Curación +${it.valor}`;
  if (it.efecto === 'robo') return 'Robo';
  return it.nombre;
}

// Los dos monstruos de la ronda, cada uno con lo que pide y su botón para derrotarlo.
// Cinco monstruos en carrusel: uno en el centro y sus vecinos apagados a los lados.
const TIER_NAME = ['Trío + 1', 'Póker', 'Full', 'Póker + 1', 'Pleno'];
function foeIndex(p, cb) {
  const n = p.offers.length;
  if (ui.foeKey !== cb.label + S.round) { ui.foeKey = cb.label + S.round; ui.foeIdx = cb.aim != null ? cb.aim : Math.min(2, n - 1); }
  ui.foeIdx = Math.max(0, Math.min(n - 1, ui.foeIdx));
  return ui.foeIdx;
}
function foeCard(p, cb, all, controllable, i, pos) {
  const m = p.offers[i];
  if (!m) return `<div class="foe-card ghost ${pos}"></div>`;
  const done = cb.status !== 'activo';
  const st = all[i] || { missing: m.combo.length, ok: false };
  const isAim = cb.aim === i;
  const chosen = done && cb.chosen === i;
  const can = controllable && !done && cb.rolls > 0 && st.ok;
  const state = done
    ? (chosen ? '<div class="need ok">Derrotado</div>' : '')
    : '';
  return `
    <div class="foe-card ${pos} ${st.ok && !done && cb.rolls ? 'ready' : ''} ${isAim ? 'aim' : ''} ${chosen ? 'chosen' : ''}" ${pos !== 'center' ? `data-a="foeGo" data-i="${i}"` : ''}>
      <div class="foe-art">${monsterArt(m, 'duel-art')}</div>
      <div class="foe-title">${esc(m.nombre)} <span class="muted small">${esc(m.tamano || '')}</span></div>
      <div class="foe-dmg" title="Vida que pierdes si fallas">−${m.dano}</div>
      ${pos === 'center' ? coveredComboHtml(p, cb, m, i) : ''}
      ${pos === 'center' ? `<div class="foe-slot">${state}${can ? `<button class="btn primary defeat-btn" data-a="present" data-i="${i}">Derrotar a ${esc(m.nombre)}</button>` : ''}</div>
      <div class="rewards-sum">${m.rewards.map((it) => `<span>${shortName(it)}</span>`).join('')}</div>` : ''}
    </div>`;
}
function coveredComboHtml(p, cb, m, i) {
  if (!cb.rolls) return comboHtml(m.combo, false, m.tipo);
  const t = cb.targets[i];
  const key = t.tipo === 'forma' ? 'shape' : 'face';
  const vals = cb.dice.map((d) => d[key]);
  const cov = comboCovered(m.combo, vals, t.tipo === 'forma' ? 'espiral' : 'multicolor');
  return `<div class="dice ${m.combo.length >= 5 ? 'five' : ''}">${m.combo.map((c, k) => {
    const cls = `target ${cov[k] ? 'got' : 'miss'}`;
    return m.tipo === 'forma' ? die(null, { cls, shape: c }) : die(c, { cls });
  }).join('')}</div>`;
}
function foesHtml(p, cb, all, controllable) {
  const k = foeIndex(p, cb);
  const n = p.offers.length;
  const dots = p.offers.map((m, i) => `<button class="car-dot ${i === k ? 'on' : ''} ${(all[i] || {}).ok && cb.rolls ? 'ok' : ''} ${cb.aim === i ? 'aim' : ''}" data-a="foeGo" data-i="${i}" aria-label="${esc(m.nombre)}"></button>`).join('');
  return `
  <div class="car-dots">${dots}</div>
  <div class="carousel" data-swipe="foes">
    <button class="car-nav" data-a="foeGo" data-i="${k - 1}" ${k === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
    <div class="car-track">
      ${foeCard(p, cb, all, controllable, k - 1, 'side left')}
      ${foeCard(p, cb, all, controllable, k, 'center')}
      ${foeCard(p, cb, all, controllable, k + 1, 'side right')}
    </div>
    <button class="car-nav" data-a="foeGo" data-i="${k + 1}" ${k === n - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
  </div>`;
}

// Golpe graduado: con N exigidos, N → 3 daño, N−1 → 2, N−2 → 1.
function duelDamage(cb, faces) {
  const hits = cb.combo.length;
  const n = Math.min(hits, faces.filter((f) => f === cb.combo[0] || f === 'multicolor').length);
  return Math.max(0, 3 - (hits - n));
}

// Batalla final: los rivales en carrusel, como los monstruos. En el centro, el
// rival al que apuntas: lo que pide (5 esferas de su color) y el daño que le haces.
function battleRivals() {
  const t = S.tournament;
  return t.alive.filter((id) => id !== S.me).map(byId);
}
function rivalIndex(n) {
  ui.foeIdx = Math.max(0, Math.min(n - 1, ui.foeIdx || 0));
  return ui.foeIdx;
}
function rivalCard(r, cb, pos, i) {
  if (!r) return '<div class="foe-card ghost ' + pos + '"></div>';
  const pct = Math.max(0, Math.min(100, (r.hero.vida / (r.hero.vidaMax || r.hero.base.vida)) * 100));
  const center = pos === 'center';
  const n = cb && cb.rolls ? cb.dice.filter((d) => d.face === r.color || d.face === 'multicolor').length : 0;
  const dmg = battleDamage(n);
  const want = Array.from({ length: 5 }, (_, k) => die(r.color, { cls: `target ${cb && cb.rolls ? (k < n ? 'got' : 'miss') : ''}` })).join('');
  const st = r.combat && r.combat.status === 'activo' ? 'tirando…' : 'listo';
  return `
    <div class="foe-card ${pos} ${dmg && center ? 'ready' : ''}" ${!center ? `data-a="foeGo" data-i="${i}"` : ''}>
      ${!center && dmg ? `<div class="side-ok">−${dmg}</div>` : ''}
      <div class="foe-art">${heroPortrait(r, 'duel-art')}</div>
      <div class="foe-title">${esc(r.name)} <span class="sphere ${r.color}"></span></div>
      <div class="life duel-lifebar"><i style="width:${pct}%"></i><span>${r.hero.vida}</span></div>
      ${center ? `<div class="dice">${want}</div>
      <div class="muted small">${st}</div>
      ${cb && cb.rolls && cb.status === 'activo' ? `<div class="foe-slot"><button class="btn ${dmg ? 'primary defeat-btn' : ''}" data-a="strike" data-id="${r.id}">${dmg ? `Golpear a ${esc(r.name)} · −${dmg}` : `Golpear a ${esc(r.name)} · sin daño`}</button></div>` : ''}` : ''}
    </div>`;
}
// Daño de tu golpe en la batalla: 3/4/5 esferas de su color → 2/4/6, más el extra por Fuerza.
function battleDamage(n) {
  const base = ((DATA && DATA.batallaDano) || [0, 0, 0, 2, 4, 6])[Math.min(5, n)];
  const f = (me() && me().hero && me().hero.fuerza) || 0;
  return base ? base + golpeDe(f) : 0;
}
function renderBattle() {
  const t = S.tournament;
  const p = me();
  const alive = t.alive.includes(S.me);
  const rivals = battleRivals();
  const cb = alive && p.combat && p.combat.status === 'activo' ? p.combat : null;
  const k = rivalIndex(rivals.length);
  const hits = (r) => (cb && cb.rolls ? battleDamage(cb.dice.filter((d) => d.face === r.color || d.face === 'multicolor').length) : 0);
  const dots = rivals.map((r, i) => `<button class="car-dot ${i === k ? 'on' : ''} ${hits(r) ? 'ok' : ''}" data-a="foeGo" data-i="${i}" aria-label="${esc(r.name)}"></button>`).join('');
  const car = `
    <div class="car-dots">${dots}</div>
    <div class="carousel" data-swipe="foes">
      <button class="car-nav" data-a="foeGo" data-i="${k - 1}" ${k === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
      <div class="car-track">${rivalCard(rivals[k - 1], cb, 'side left', k - 1)}${rivalCard(rivals[k], cb, 'center', k)}${rivalCard(rivals[k + 1], cb, 'side right', k + 1)}</div>
      <button class="car-nav" data-a="foeGo" data-i="${k + 1}" ${k >= rivals.length - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
    </div>`;
  let mine = '';
  if (cb) mine = renderCombat(p, true);
  else if (alive) mine = '<p class="center muted">Esperando a que los demás terminen de tirar…</p>';
  else mine = '<p class="center muted">Has caído. Mira cómo acaba la batalla.</p>';
  return `
    <div class="card duel-card battle-card">
      <h2 class="duel-title">Batalla final · ronda ${t.round}</h2>
      ${car}
      ${mine}
    </div>`;
}

// Bajo tus esferas: tu escudo (esferas de tu color).
function battleStrikeHtml(p, cb) {
  if (!cb.rolls) return '';
  const shield = cb.dice.filter((d) => d.face === p.color).length;
  return `<div class="battle-strike muted small center">Tu escudo: <b>${shield}</b> <span class="sphere ${p.color}"></span> · 3 de su color → −1 · 4 → −2 · 5 → −3</div>`;
}

function renderTournament() {
  const t = S.tournament;
  if (t.stage === 'batalla') return renderBattle();
  if (t.stage === 'eleccion') {
    if (t.ranking[0] === S.me) {
      return `<div class="card duel-card"><h2>Elige rival para tu semifinal</h2><div class="row rival-pick">
        ${t.ranking.slice(1).map((id) => { const x = byId(id); return `<button class="rival-card" data-a="rival" data-id="${id}">${heroPortrait(x, 'duelist')}<b>${esc(x.name)}</b><span>${x.hero.vida} Vida · Fuerza ${x.hero.fuerza} · Maná ${x.hero.mana}</span></button>`; }).join('')}
      </div></div>`;
    }
    return `<div class="card duel-card"><h2>Torneo</h2><p class="muted center">${esc(byId(t.ranking[0]).name)} está eligiendo rival…</p></div>`;
  }
  if (t.stage === 'botin' && t.loot) {
    const w = byId(t.loot.winner);
    const l = byId(t.loot.loser);
    return `<div class="card duel-card"><h2>Botín</h2><p class="center muted">${esc(w.name)} elige un objeto de ${esc(l.name)}…</p></div>`;
  }
  // Un único duelo en el centro: el que se está jugando.
  const m = t.matches.find((x) => x.started && !x.winner);
  if (!m) return '<div class="card duel-card"><p class="muted center">Preparando el siguiente duelo…</p></div>';
  const a = byId(m.a);
  const b = byId(m.b);
  const att = byId(m.attacker);
  const fighter = (x) => `<div class="fighter big ${m.attacker === x.id ? 'attacking' : ''}">${heroPortrait(x, 'duelist')}<b>${esc(x.name)}</b>
    <div class="life duel-lifebar"><i style="width:${Math.max(0, Math.min(100, (x.hero.vida / (x.hero.vidaMax || x.hero.base.vida)) * 100))}%"></i><span>${x.hero.vida}</span></div></div>`;
  return `
    <div class="card duel-card">
      <h2 class="duel-title">${esc(m.label)}</h2>
      <div class="vs duel-pair">${fighter(a)}<span class="faceoff-vs">vs</span>${fighter(b)}</div>
      ${att.combat ? renderCombat(att, att.id === S.me) : ''}
      ${m.attacker === S.me ? '' : duelCurseHtml(t, m)}
    </div>`;
}

// Maleficio al rival en el torneo: uno por cada ataque suyo. Se puede lanzar en
// tu turno (afecta a su siguiente ataque) o mientras él ataca.
function duelCurseHtml(t, m) {
  if (m.a !== S.me && m.b !== S.me) return '';
  const p = me();
  const rival = byId(m.a === S.me ? m.b : m.a);
  const target = m.attacker === rival.id ? m.turns : m.turns + 1;
  if (p.duelCurseAt === target) return '<p class="muted small center">Maleficio lanzado.</p>';
  if (p.hero.manaDisponible < 5) return '';
  return `<div class="duel-curse"><button class="btn curse-btn" data-a="duelCursePick" data-t="${target}">Maldecir</button></div>`;
}

// Juego en un mismo dispositivo: cuando al jugador activo no le toca nada y a
// otro de este dispositivo sí, se le pasa la pantalla.
function nextLocalTurn() {
  if (!S || !S.local || S.phase === 'fin') return null;
  const mine = S.local.find((l) => l.id === S.me);
  if (mine && mine.needs) return null;
  return S.local.find((l) => l.needs && l.id !== S.me) || null;
}
function renderHandoff() {
  const n = nextLocalTurn();
  if (!n) return '';
  const x = byId(n.id);
  return `
    <div class="card outcome handoff">
      <div class="outcome-title">Turno de ${esc(n.name)}</div>
      ${x && x.raza ? heroPortrait(x, 'duelist') : ''}
      <p class="center muted">Pásale el dispositivo a <b>${esc(n.name)}</b>.</p>
      <div class="row center-row"><button class="btn primary" data-a="setActive" data-id="${n.id}">Soy ${esc(n.name)}, empezar</button></div>
    </div>`;
}

// Ventana flotante: cuántas calaveras lanzar (5 de Maná cada una).
function renderBattleCursePick() {
  const t = S.tournament;
  const p = me();
  const max = Math.floor(p.hero.manaDisponible / 5);
  if (max < 1 || p.battleCursed) { ui.duelCursePick = null; return ''; }
  const skull = '<img src="img/ui/calavera.webp" alt="">';
  const rows = t.alive.filter((id) => id !== S.me).map((id) => {
    const r = byId(id);
    const opts = [];
    for (let n = 1; n <= max; n++) opts.push(`<button class="btn dc-opt" data-a="battleCurse" data-id="${id}" data-n="${n * 5}"><span class="dc-skulls">${skull.repeat(n)}</span><small>${n * 5} Maná</small></button>`);
    return `<div class="dc-row"><div class="dc-who"><span class="sphere ${r.color}"></span> ${esc(r.name)}</div><div class="dc-opts">${opts.join('')}</div></div>`;
  }).join('');
  return `
    <div class="card outcome curse-pick">
      <button class="modal-close" data-a="duelCursePick" data-t="" aria-label="Cerrar" title="Cerrar">×</button>
      <div class="outcome-title">Maldecir</div>
      <div class="muted">${lines('Cada calavera anula una esfera.', 'Solo en su próxima tirada.')}</div>
      ${rows}
    </div>`;
}

function renderDuelCursePick() {
  const t = S && S.tournament;
  if (t && t.stage === 'batalla') return renderBattleCursePick();
  const m = t && t.matches.find((x) => x.started && !x.winner && (x.a === S.me || x.b === S.me));
  const p = me();
  if (!m || S.phase !== 'torneo') { ui.duelCursePick = null; return ''; }
  const rival = byId(m.a === S.me ? m.b : m.a);
  const target = m.attacker === rival.id ? m.turns : m.turns + 1;
  const max = Math.floor(p.hero.manaDisponible / 5);
  if (ui.duelCursePick !== target || max < 1 || p.duelCurseAt === target) { ui.duelCursePick = null; return ''; }
  const skull = '<img src="img/ui/calavera.webp" alt="">';
  const opts = [];
  for (let n = 1; n <= max; n++) {
    opts.push(`<button class="btn dc-opt" data-a="duelCurse" data-n="${n * 5}"><span class="dc-skulls">${skull.repeat(n)}</span><small>${n * 5} Maná</small></button>`);
  }
  return `
    <div class="card outcome curse-pick">
      <button class="modal-close" data-a="duelCursePick" data-t="" aria-label="Cerrar" title="Cerrar">×</button>
      <div class="outcome-title">Maldecir a ${esc(rival.name)}</div>
      <p class="center muted">Cada calavera le anula una esfera acertada.</p>
      <div class="dc-opts">${opts.join('')}</div>
    </div>`;
}

function renderEnd() {
  const w = byId(S.winner);
  return `
  <div class="card winner-banner end-card">
    <img class="end-logo" src="img/logo-tinta.webp" alt="Héroes">
    ${heroPortrait(w, 'end')}
    <div class="end-victory">Victoria</div>
    <p class="center"><b>${esc(w.name)}</b> · ${raceName(w)} ${className(w)}</p>
    <button class="btn primary" data-a="leave">Volver al inicio</button>
  </div>`;
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
          <b>${itemName(it)}</b><small>${itemDesc(it)}</small>
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
  if (ui.duelCursePick != null) {
    const v = renderDuelCursePick();
    if (v) return v;
  }
  if (ui.rewardsView != null) {
    const v = renderRewardsView(p);
    if (v) return v;
  }
  const pend = p && p.hero && p.hero.pending && p.hero.pending[0];
  if (!pend || !pend.item) {
    if (S && !ui.seenMatches) ui.seenMatches = new Set((S.tournament ? S.tournament.matches : []).filter((x) => x.winner).map((x) => x.id));
    const o = S && renderOutcome();
    if (o) return o;
    const hand = renderHandoff();
    if (hand) return hand;
    const tp = S && renderTradePopup();
    if (tp) return tp;
    const pw = S && renderPrepWin();
    if (pw) return pw;
    return renderItemDetail() || '';
  }
  return `
    <div class="card">
      <div class="big-item center">${itemIcon(pend.item)}</div>
      <h2>${itemName(pend.item)}</h2>
      <p class="muted center">${itemDesc(pend.item)}</p>
      ${lines('No tienes sitio para este objeto.', '¿Qué haces?')}
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
    case 'addLocal': {
      const used = new Set(S.players.map((x) => x.name));
      const def = ['Jugador 2', 'Jugador 3', 'Jugador 4'].find((n) => !used.has(n)) || 'Jugador';
      const name = (window.prompt('Nombre del jugador que juega en este dispositivo', def) || '').trim();
      if (name) socket.emit('addLocal', { name }, (res) => { if (res && !res.ok) toast(res.error); });
      break;
    }
    case 'setActive':
      Object.assign(ui, { detail: null, prepWin: null, duelCursePick: null, rewardsView: null, curse: { target: null, amount: 5 }, theft: null });
      ui.held = new Set(); ui.manaMode = false; ui.manaPick = new Map(); ui.manaSel = null;
      socket.emit('setActive', { playerId: d.id });
      break;
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
    case 'buy': act('buy', { itemId: d.id }); ui.prepWin = null; render(); break;
    case 'loot': act('takeLoot', { itemId: d.id }); break;
    case 'duelCurse': ui.duelCursePick = null; renderModal(); act('duelCurse', { amount: Number(d.n) }); break;
    case 'duelCursePick': ui.duelCursePick = d.t === '' ? null : d.t === 'b' ? 'b' : Number(d.t); renderModal(); break;
    case 'battleCurse': ui.duelCursePick = null; renderModal(); act('duelCurse', { amount: Number(d.n), targetId: d.id }); break;
    case 'strike': act('strike', { targetId: d.id }); break;
    case 'closeFuerza': ui.fuerzaMsg = null; renderModal(); break;
    case 'closeBattle': ui.battleSeen = S.tournament.last.round; renderModal(); break;
    case 'nextDuel': clearTimeout(ui.duelTimer); ui.duelTimer = null; ui.duelQueue.shift(); renderModal(); break;
    case 'closeCoins': ui.coinsMsg = null; renderModal(); break;
    case 'closePrep': ui.prepWin = null; ui.theft = null; render(); break;
    case 'closeSteal': ui.stealResult = null; renderModal(); break;
    case 'curseTarget': ui.curse.target = d.id; render(); break;
    case 'curseAmount': ui.curse.amount = Number(d.n); render(); break;
    case 'curse': act('curse', { targetId: ui.curse.target, amount: ui.curse.amount }); ui.prepWin = null; render(); break;
    case 'tgive': ui.trade.give.has(d.id) ? ui.trade.give.delete(d.id) : ui.trade.give.add(d.id); render(); break;
    case 'offer': act('offerTrade', { give: [...ui.trade.give] }); ui.trade.give = new Set(); render(); break;
    case 'tcounter': ui.counter.give.has(d.id) ? ui.counter.give.delete(d.id) : ui.counter.give.add(d.id); render(); break;
    case 'counterSend':
      act('counterTrade', { tradeId: ui.counter.trade, give: [...ui.counter.give] });
      ui.seenTrades.add(ui.counter.trade); ui.counter = { trade: null, give: new Set() }; render();
      break;
    case 'counterSkip': ui.seenTrades.add(ui.counter.trade); ui.counter = { trade: null, give: new Set() }; render(); break;
    case 'respondTo': ui.seenTrades.delete(d.t); ui.counter = { trade: d.t, give: new Set() }; ui.prepWin = null; render(); break;
    case 'answer': ui.seenCounters.add(d.c); act('answerTrade', { tradeId: d.t, counterId: d.c, accept: d.ok === '1' }); break;
    case 'withdraw': act('withdrawTrade', { tradeId: d.t }); break;
    case 'skip': act('skipRound'); break;
    case 'present': act('present', { index: Number(d.i) }); break;
    case 'reward': act('chooseReward', { index: Number(d.i) }); break;
    case 'die': {
      const i = Number(d.i);
      const cb = me().combat;
      if (!cb || cb.rolls === 0 || cb.dice[i].fixed || cb.dice[i].maldita) break;
      if (ui.manaMode) {
        if (ui.manaPick.has(i)) { ui.manaPick.delete(i); ui.manaSel = null; }
        else if (ui.manaPick.size < me().hero.fijables) ui.manaSel = i;
      } else if (cb.rolls < cb.maxRolls) {
        ui.held.has(i) ? ui.held.delete(i) : ui.held.add(i);
      }
      render();
      break;
    }
    case 'pick':
      if (ui.manaSel !== null) { ui.manaPick.set(ui.manaSel, d.f); ui.manaSel = null; render(); }
      break;
    case 'roll': Sounds.play('dados'); act('roll', d.aim != null ? { hold: [...ui.held], aim: Number(d.aim) } : { hold: [...ui.held] }); break;
    case 'foeGo': if (!el.disabled) { ui.foeIdx = Number(d.i); suggestHold(); render(); } break;
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

// Carrusel de monstruos: deslizar con el dedo para pasar al siguiente.
(() => {
  let x0 = null;
  document.addEventListener('touchstart', (e) => { x0 = e.target.closest('.carousel') ? e.touches[0].clientX : null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0;
    x0 = null;
    if (Math.abs(dx) < 40) return;
    ui.foeIdx = (ui.foeIdx || 0) + (dx < 0 ? 1 : -1);
    if (S && S.tournament && S.tournament.stage === 'batalla') rivalIndex(battleRivals().length);
    else if (me() && me().offers && me().combat) foeIndex(me(), me().combat);
    suggestHold();
    render();
  }, { passive: true });
})();
