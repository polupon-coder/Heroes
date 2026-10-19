'use strict';

const C = require('./config');

class GameError extends Error {}

function fail(msg) {
  throw new GameError(msg);
}

const emptyIng = () => ({ eter: 0, umbra: 0, lumen: 0, raiz: 0 });
const total = (o) => C.ING.reduce((s, t) => s + (o[t] || 0), 0);
const isIng = (t) => C.ING.includes(t);
const N = (t) => C.ING_INFO[t].nombre;
const cardName = (id) => (C.CARTAS[id] || C.INICIALES[id]).nombre;

// Ingredientes que aún faltan en una receta en estudio.
function pendingOf(study) {
  const out = emptyIng();
  if (!study) return out;
  const req = C.CARTAS[study.card].req;
  for (const t of C.ING) out[t] = (req[t] || 0) - study.placed[t];
  return out;
}

function costText(coste) {
  return C.ING.filter((t) => coste[t]).map((t) => `${coste[t] > 1 ? `${coste[t]} ` : ''}${N(t)}`).join(' + ');
}

class Game {
  constructor(code, opts = {}) {
    this.code = code;
    this.rng = opts.rng || Math.random;
    this.now = opts.now || (() => Date.now());
    this.ventanaMs = opts.ventanaMs ?? C.VENTANA_MS;
    this.phase = 'lobby';
    this.players = [];
    this.log = [];
    this.version = 0;
    this._id = 0;
    this.round = 0;
    this.turnIndex = 0; // contador global de turnos (la magia se limita por turno)
    this.startIdx = 0;
    this.turnInRound = 0;
    this.turn = null;
    this.bag = emptyIng();
    this.claro = [];
    this.catalog = {};
    this.winners = null;
  }

  say(text) {
    this.log.push({ n: this.log.length ? this.log[this.log.length - 1].n + 1 : 0, text });
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
  }

  player(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p) fail('Jugador desconocido');
    return p;
  }

  get hostId() {
    const h = this.players.find((p) => !p.bot);
    return h ? h.id : null;
  }

  get active() {
    return this.turn ? this.player(this.turn.pid) : null;
  }

  // ---------------------------------------------------------------- Sala

  addPlayer(name, { bot = false } = {}) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (this.players.length >= 4) fail('La sala está llena (4 jugadores)');
    this._id += 1;
    const p = {
      id: `p${this._id}`,
      name: String(name || '').trim().slice(0, 20) || `Druida ${this.players.length + 1}`,
      bot,
      connected: true,
      druida: Object.keys(C.DRUIDAS).find((d) => !this.players.some((x) => x.druida === d)),
      mascota: Object.keys(C.MASCOTAS).find((m) => !this.players.some((x) => x.mascota === m)),
    };
    if (bot) p.name = `${C.MASCOTAS[p.mascota].nombre} (bot)`;
    this.players.push(p);
    this.say(`${p.name} entra en la escuela.`);
    return p;
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    const p = this.player(id);
    this.players = this.players.filter((x) => x !== p);
    this.say(`${p.name} sale de la escuela.`);
  }

  // ---------------------------------------------------------------- Acciones

  act(playerId, type, data = {}) {
    const p = this.player(playerId);
    const handler = ACTIONS[type];
    if (!handler) fail('Acción desconocida');
    handler.call(this, p, data || {});
    this.version += 1;
  }

  // Plazos de la ventana de ataque y de la defensa. Devuelve true si algo cambió.
  tick() {
    const t = this.turn;
    if (this.phase !== 'juego' || !t || !t.deadline || this.now() < t.deadline) return false;
    if (t.paso === 'ventana') {
      for (const q of this.opponents()) if (t.ventana[q.id] === undefined) t.ventana[q.id] = 'pasar';
      this.resolveWindow();
    } else if (t.paso === 'defensa') {
      this.applyAttack();
    } else {
      return false;
    }
    this.version += 1;
    return true;
  }

  // ---------------------------------------------------------------- Bolsa y Claro

  draw() {
    const n = total(this.bag);
    if (!n) return null;
    let r = Math.floor(this.rng() * n);
    for (const t of C.ING) {
      if (r < this.bag[t]) {
        this.bag[t] -= 1;
        return t;
      }
      r -= this.bag[t];
    }
    return null;
  }

  refill() {
    for (let i = 0; i < C.CLARO; i += 1) if (!this.claro[i]) this.claro[i] = this.draw();
  }

  toBag(t, n = 1) {
    this.bag[t] += n;
  }

  // ---------------------------------------------------------------- Comienzo

  start() {
    if (this.players.length < 2) fail('Hacen falta al menos 2 druidas');
    const ds = this.players.map((p) => p.druida);
    const ms = this.players.map((p) => p.mascota);
    if (ds.some((d) => !d) || new Set(ds).size !== ds.length) fail('Cada jugador necesita un druida diferente');
    if (ms.some((m) => !m) || new Set(ms).size !== ms.length) fail('Cada jugador necesita una mascota diferente');
    for (const t of C.ING) this.bag[t] = C.POR_TIPO;
    this.claro = new Array(C.CLARO).fill(null);
    this.refill();
    this.catalog = {};
    for (const id of Object.keys(C.CARTAS)) this.catalog[id] = C.COPIAS;
    for (const p of this.players) {
      Object.assign(p, {
        reserva: emptyIng(),
        estudio: null,
        aprendidas: [],
        pociones: [],
        usos: C.MASCOTAS[p.mascota].usos,
        magiaTurno: -1,
        cervTurno: -1,
        suenoTurno: -1,
      });
    }
    this.phase = 'juego';
    this.round = 1;
    this.turnInRound = 0;
    this.startIdx = Math.floor(this.rng() * this.players.length);
    this.say(`Empieza el aprendizaje. Abre la ronda ${this.players[this.startIdx].name}.`);
    this.beginTurn();
  }

  beginTurn() {
    const idx = (this.startIdx + this.turnInRound) % this.players.length;
    const p = this.players[idx];
    this.turn = {
      pid: p.id,
      paso: 'recoger',
      estudiadas: 0, // ingredientes del estudio normal
      idea: false,
      completada: false, // ya aprendió algo en esta fase de estudio
      tocado: false, // ya hizo algo en la fase de estudio (no puede abandonar)
      lechuza: false,
      preparada: false,
      chispa: false,
      atacado: false,
      ventana: {},
      ataque: null,
      deadline: null,
    };
    this.say(`— Ronda ${this.round}: turno de ${p.name}.`);
  }

  nextTurn() {
    this.turnIndex += 1;
    this.turnInRound += 1;
    if (this.turnInRound >= this.players.length) {
      this.turnInRound = 0;
      this.round += 1;
      this.startIdx = (this.startIdx + 1) % this.players.length;
      if (this.round > C.RONDAS) return this.finish();
    }
    this.beginTurn();
  }

  finish() {
    this.phase = 'fin';
    this.turn = null;
    const best = Math.max(...this.players.map((p) => this.points(p)));
    this.winners = this.players.filter((p) => this.points(p) === best).map((p) => p.id);
    const names = this.winners.map((id) => this.player(id).name).join(' y ');
    this.say(this.winners.length > 1 ? `Empate con ${best} de Prestigio: ganan ${names}.` : `¡${names} gana con ${best} de Prestigio!`);
  }

  // ---------------------------------------------------------------- Consultas

  points(p) {
    return (p.aprendidas || []).reduce((s, id) => s + C.CARTAS[id].puntos, 0);
  }

  // Rivales del jugador activo, en orden de juego a partir de él.
  opponents() {
    const n = this.players.length;
    const idx = this.players.findIndex((p) => p.id === this.turn.pid);
    const out = [];
    for (let k = 1; k < n; k += 1) out.push(this.players[(idx + k) % n]);
    return out;
  }

  magicFree(p) {
    return p.magiaTurno !== this.turnIndex;
  }

  knows(p, id) {
    return p.aprendidas.includes(id);
  }

  canPay(p, coste) {
    return C.ING.every((t) => p.reserva[t] >= (coste[t] || 0));
  }

  pay(p, coste) {
    if (!this.canPay(p, coste)) fail(`Necesitas ${costText(coste)}`);
    for (const t of C.ING) {
      const n = coste[t] || 0;
      p.reserva[t] -= n;
      this.toBag(t, n);
    }
  }

  canDefend(p) {
    return this.magicFree(p) && this.canPay(p, C.BURBUJA_COSTE);
  }

  studyLimit(p) {
    if (p.suenoTurno === this.turnIndex) return C.ESTUDIO_SUENO;
    return this.turn.idea ? C.ESTUDIO_IDEA : C.ESTUDIO_NORMAL;
  }

  // Lío: pares (ingrediente que el activo necesita, espacio de El Claro que no le sirve).
  lioSwaps(target) {
    if (!target.estudio) return [];
    const pend = pendingOf(target.estudio);
    const out = [];
    for (const t of C.ING) {
      if (!(target.reserva[t] > 0 && pend[t] > 0)) continue;
      this.claro.forEach((c, i) => { if (c && pend[c] <= 0) out.push({ tipo: t, slot: i }); });
    }
    return out;
  }

  // Ataques que q puede lanzar ahora contra el jugador activo.
  attacksFor(q) {
    const t = this.turn;
    if (this.phase !== 'juego' || !t || t.paso !== 'ventana' || q.id === t.pid || !this.magicFree(q)) return [];
    const target = this.active;
    const out = [];
    if (this.knows(q, 'robo') && this.canPay(q, C.CARTAS.robo.coste) && total(target.reserva) > 0) out.push('robo');
    if (this.knows(q, 'lio') && this.canPay(q, C.CARTAS.lio.coste) && this.lioSwaps(target).length) out.push('lio');
    if (q.pociones.includes('sueno')) out.push('sueno');
    return out;
  }

  // ---------------------------------------------------------------- Estudio

  requireStudy(p) {
    if (!p.estudio) fail('No tienes ninguna receta en estudio');
  }

  // Coloca un ingrediente de la reserva (tipo) en el espacio "como".
  place(p, tipo, como = tipo) {
    this.requireStudy(p);
    if (!isIng(tipo) || !isIng(como)) fail('Ingrediente no válido');
    if (!(p.reserva[tipo] > 0)) fail(`No tienes ${N(tipo)} en tu reserva`);
    if (!(pendingOf(p.estudio)[como] > 0)) fail(`Tu receta no necesita ${N(como)}`);
    p.reserva[tipo] -= 1;
    this.addToStudy(p, como, tipo === como ? N(tipo) : `${N(tipo)} como ${N(como)}`);
  }

  addToStudy(p, como, label) {
    p.estudio.placed[como] += 1;
    this.say(`${p.name} coloca ${label} en ${cardName(p.estudio.card)}.`);
    if (total(pendingOf(p.estudio)) === 0) this.learn(p);
  }

  learn(p) {
    const id = p.estudio.card;
    const card = C.CARTAS[id];
    for (const t of C.ING) this.toBag(t, p.estudio.placed[t]);
    p.estudio = null;
    p.aprendidas.push(id);
    let extra = '';
    if (card.tipo === 'pocion') {
      if (p.pociones.length < C.MAX_POCIONES) {
        p.pociones.push(id);
        extra = ' y recibe una preparación gratis';
      } else {
        extra = ' (no tiene sitio para la preparación gratis)';
      }
    }
    this.say(`✦ ${p.name} aprende ${card.nombre}: +${card.puntos} de Prestigio${extra}.`);
    if (this.turn && this.turn.pid === p.id && this.turn.paso === 'estudiar') this.turn.completada = true;
  }

  // Comprueba una lista de colocaciones sin cambiar nada. wild = cuántas pueden ser comodín.
  checkPlacements(p, list, { wild = 0, reserva = p.reserva } = {}) {
    if (!Array.isArray(list)) fail('Colocaciones no válidas');
    this.requireStudy(p);
    const res = { ...reserva };
    const pend = pendingOf(p.estudio);
    let wilds = 0;
    let left = total(pend);
    for (const pl of list) {
      const tipo = pl && pl.tipo;
      const como = (pl && pl.como) || tipo;
      if (!isIng(tipo) || !isIng(como)) fail('Ingrediente no válido');
      if (left === 0) fail('Tu receta ya estaría completa');
      if (tipo !== como) wilds += 1;
      if (wilds > wild) fail(wild ? 'Solo un ingrediente puede ser comodín' : 'Los ingredientes deben coincidir con la receta');
      if (!(res[tipo] > 0)) fail(`No tienes ${N(tipo)} suficiente`);
      if (!(pend[como] > 0)) fail(`Tu receta no necesita ${N(como)}`);
      res[tipo] -= 1;
      pend[como] -= 1;
      left -= 1;
    }
  }

  // ---------------------------------------------------------------- Magia

  // Ventana de ataque: resuelve el primer ataque por prioridad, o pasa al estudio.
  resolveWindow() {
    const t = this.turn;
    for (const q of this.opponents()) {
      if (!this.attacksFor(q).length) {
        if (t.ventana[q.id] === undefined) t.ventana[q.id] = 'pasar';
        if (t.ventana[q.id] !== 'pasar') this.say(`${q.name} ya no puede atacar.`);
        t.ventana[q.id] = 'pasar';
        continue;
      }
      const r = t.ventana[q.id];
      if (r === undefined) return; // esperamos a quien tiene prioridad
      if (r === 'pasar') continue;
      try {
        this.validateAttack(q, r);
      } catch (e) {
        if (!(e instanceof GameError)) throw e;
        this.say(`El ataque de ${q.name} ya no es posible.`);
        t.ventana[q.id] = 'pasar';
        continue;
      }
      return this.beginAttack(q, r);
    }
    this.toStudy();
  }

  openWindow() {
    const t = this.turn;
    t.paso = 'ventana';
    t.ventana = {};
    t.deadline = this.now() + this.ventanaMs;
    this.resolveWindow();
  }

  toStudy() {
    const t = this.turn;
    t.paso = 'estudiar';
    t.deadline = null;
    t.ataque = null;
  }

  validateAttack(q, r) {
    const target = this.active;
    if (!this.attacksFor(q).includes(r.carta)) fail('No puedes lanzar ese ataque');
    if (r.carta === 'robo') {
      if (!isIng(r.tipo) || !(target.reserva[r.tipo] > 0)) fail(`${target.name} no tiene ese ingrediente`);
    } else if (r.carta === 'lio') {
      if (!this.lioSwaps(target).some((s) => s.tipo === r.tipo && s.slot === Number(r.slot))) fail('Ese cambio no perjudica al rival');
      if (r.bonus) {
        const res = { ...q.reserva };
        res.umbra -= 1;
        this.checkPlacements(q, [r.bonus], { wild: 1, reserva: res });
      }
    } else if (r.carta === 'sueno') {
      if (r.bonus) this.checkPlacements(q, [{ tipo: r.bonus.tipo }]);
    }
  }

  beginAttack(q, r) {
    const t = this.turn;
    const target = this.active;
    if (r.carta === 'sueno') q.pociones = q.pociones.filter((x) => x !== 'sueno');
    else this.pay(q, C.CARTAS[r.carta].coste);
    q.magiaTurno = this.turnIndex;
    q.cervTurno = this.turnIndex;
    t.atacado = true;
    t.ataque = { from: q.id, ...r };
    this.say(`⚡ ${q.name} lanza ${cardName(r.carta)} contra ${target.name}.`);
    if (this.canDefend(target)) {
      t.paso = 'defensa';
      t.deadline = this.now() + this.ventanaMs;
    } else {
      this.applyAttack();
    }
  }

  defend() {
    const t = this.turn;
    const target = this.active;
    const q = this.player(t.ataque.from);
    this.pay(target, C.BURBUJA_COSTE);
    target.magiaTurno = this.turnIndex;
    target.cervTurno = this.turnIndex;
    this.say(`🫧 ${target.name} se protege con Burbuja: el ${cardName(t.ataque.carta)} de ${q.name} no tiene efecto.`);
    this.toStudy();
  }

  applyAttack() {
    const t = this.turn;
    const a = t.ataque;
    const target = this.active;
    const q = this.player(a.from);
    if (a.carta === 'robo') {
      target.reserva[a.tipo] -= 1;
      this.say(`${q.name} roba ${N(a.tipo)} a ${target.name}.`);
      if (a.colocar && q.estudio && pendingOf(q.estudio)[a.tipo] > 0) this.addToStudy(q, a.tipo, `el ${N(a.tipo)} robado`);
      else q.reserva[a.tipo] += 1;
    } else if (a.carta === 'lio') {
      const slot = Number(a.slot);
      const c = this.claro[slot];
      target.reserva[a.tipo] -= 1;
      target.reserva[c] += 1;
      this.claro[slot] = a.tipo;
      this.say(`${q.name} cambia el ${N(a.tipo)} de ${target.name} por ${N(c)} de El Claro.`);
      if (a.bonus) this.tryPlace(q, a.bonus.tipo, a.bonus.como || a.bonus.tipo);
    } else if (a.carta === 'sueno') {
      target.suenoTurno = this.turnIndex;
      this.say(`💤 ${target.name} solo podrá estudiar 1 ingrediente este turno.`);
      if (a.bonus) this.tryPlace(q, a.bonus.tipo);
    }
    this.toStudy();
  }

  // Colocación extra de un efecto: si la situación cambió, simplemente no se hace.
  tryPlace(p, tipo, como = tipo) {
    try {
      this.place(p, tipo, como);
    } catch (e) {
      if (!(e instanceof GameError)) throw e;
    }
  }

  // ¿Puede p usar ahora magia que no es un ataque?
  requireMagicMoment(p) {
    if (this.phase !== 'juego') fail('La partida no está en marcha');
    const t = this.turn;
    if (t.paso === 'defensa') fail('Espera a que se resuelva el ataque');
    if (t.pid === p.id && t.paso === 'ventana') fail('Espera a que tus rivales decidan si te atacan');
  }

  castPersonal(p, d) {
    const id = d.carta;
    const t = this.turn;
    this.requireMagicMoment(p);
    if (id === 'chispa') {
      if (t.pid !== p.id) fail('Chispa solo se usa en tu turno');
      if (t.chispa) fail('Ya has usado Chispa en este turno');
      const slot = Number(d.slot);
      if (!isIng(d.tipo) || !(p.reserva[d.tipo] > 0)) fail('Elige un ingrediente de tu reserva');
      if (!this.claro[slot]) fail('Elige un ingrediente de El Claro');
      const c = this.claro[slot];
      this.claro[slot] = d.tipo;
      p.reserva[d.tipo] -= 1;
      p.reserva[c] += 1;
      t.chispa = true;
      this.say(`✧ ${p.name} usa Chispa: cambia ${N(d.tipo)} por ${N(c)}.`);
      return;
    }
    if (id === 'burbuja') fail('Burbuja solo sirve para defenderte de un ataque');
    const card = C.CARTAS[id];
    if (!card) fail('Magia desconocida');
    if (card.ataque) fail('Los ataques se lanzan cuando el rival termina de recoger');
    if (!this.magicFree(p)) fail('Ya has usado tu magia en este turno');
    const potion = card.tipo === 'pocion';
    if (potion ? !p.pociones.includes(id) : !this.knows(p, id)) fail(potion ? 'No tienes esa poción preparada' : 'No conoces ese hechizo');
    const reserva = { ...p.reserva };
    if (!potion) {
      if (!this.canPay(p, card.coste)) fail(`${card.nombre} cuesta ${costText(card.coste)}`);
      for (const k of C.ING) reserva[k] -= card.coste[k] || 0;
    }
    let apply;
    if (id === 'cambio' || id === 'memoria') {
      const list = (d.colocar || []).slice(0, 2);
      if (!list.length) fail('Elige qué ingredientes colocar');
      this.checkPlacements(p, list, { wild: id === 'cambio' ? 1 : 0, reserva });
      apply = () => list.forEach((pl) => this.place(p, pl.tipo, pl.como || pl.tipo));
    } else if (id === 'idea') {
      if (t.pid !== p.id || t.paso !== 'estudiar') fail('Idea se lanza en tu fase de estudio');
      if (t.estudiadas > 0 || t.lechuza) fail('Idea se lanza antes de empezar a colocar ingredientes');
      if (t.idea) fail('Ya has lanzado Idea');
      apply = () => { t.idea = true; };
    } else if (id === 'pensar') {
      this.requireStudy(p);
      const slot = Number(d.slot);
      const c = this.claro[slot];
      if (!c) fail('Elige un ingrediente de El Claro');
      if (!(pendingOf(p.estudio)[c] > 0)) fail(`Tu receta no necesita ${N(c)}`);
      apply = () => {
        this.claro[slot] = null;
        this.addToStudy(p, c, `${N(c)} de El Claro`);
        this.refill();
      };
    } else if (id === 'suerte') {
      const avail = this.claro.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
      const slots = [...new Set((d.slots || []).map(Number))];
      const need = Math.min(3, avail.length);
      if (slots.length !== need || !slots.every((i) => this.claro[i])) fail(`Elige ${need} ingredientes de El Claro`);
      apply = () => {
        const got = slots.map((i) => this.claro[i]);
        for (const i of slots) this.claro[i] = null;
        for (const c of got) p.reserva[c] += 1;
        this.say(`${p.name} recoge ${got.map(N).join(', ')} con Suerte.`);
        if (d.colocar && p.estudio) this.tryPlace(p, d.colocar);
        this.refill();
      };
    } else {
      fail('Magia desconocida');
    }
    if (potion) p.pociones = p.pociones.filter((x) => x !== id);
    else this.pay(p, card.coste);
    p.magiaTurno = this.turnIndex;
    p.cervTurno = this.turnIndex;
    this.say(`✦ ${p.name} ${potion ? 'bebe la poción' : 'lanza'} ${card.nombre}.`);
    apply();
    if (t.paso === 'ventana') this.resolveWindow();
  }

  requireActive(p, paso) {
    if (this.phase !== 'juego') fail('La partida no está en marcha');
    if (this.turn.pid !== p.id) fail('No es tu turno');
    if (paso && ![].concat(paso).includes(this.turn.paso)) fail('Ahora no puedes hacer eso');
  }

  // ---------------------------------------------------------------- Vista

  view(forId) {
    const t = this.turn;
    const me = this.players.find((p) => p.id === forId);
    const pub = (p) => {
      const base = { id: p.id, name: p.name, bot: p.bot, connected: p.connected, druida: p.druida, mascota: p.mascota };
      if (this.phase === 'lobby') return base;
      return {
        ...base,
        reserva: p.reserva,
        estudio: p.estudio ? { card: p.estudio.card, placed: p.estudio.placed, pend: pendingOf(p.estudio) } : null,
        aprendidas: p.aprendidas,
        pociones: p.pociones,
        usos: p.usos,
        puntos: this.points(p),
        magiaLibre: this.phase === 'juego' && this.magicFree(p),
        dormido: this.phase === 'juego' && p.suenoTurno === this.turnIndex,
        cervatillo: this.phase === 'juego' && p.mascota === 'cervatillo' && p.usos > 0 && p.cervTurno === this.turnIndex && !!p.estudio,
      };
    };
    let turn = null;
    if (t) {
      turn = {
        pid: t.pid,
        paso: t.paso,
        estudiadas: t.estudiadas,
        limite: this.studyLimit(this.active),
        idea: t.idea,
        completada: t.completada,
        tocado: t.tocado,
        lechuza: t.lechuza,
        preparada: t.preparada,
        chispa: t.chispa,
        atacado: t.atacado,
        restante: t.deadline ? Math.max(0, t.deadline - this.now()) : null,
        // De la ventana solo se sabe quién ha decidido, no qué.
        decididos: Object.keys(t.ventana),
        miRespuesta: me && t.ventana[me.id] !== undefined ? t.ventana[me.id] : null,
        ataque: t.ataque,
      };
    }
    return {
      code: this.code,
      phase: this.phase,
      me: forId,
      hostId: this.hostId,
      round: this.round,
      rondas: C.RONDAS,
      startId: this.phase === 'juego' ? this.players[this.startIdx].id : null,
      players: this.players.map(pub),
      claro: this.claro,
      bolsa: this.bag,
      catalogo: this.catalog,
      turn,
      ataques: me && this.phase === 'juego' ? this.attacksFor(me) : [],
      lio: me && this.phase === 'juego' && t && t.paso === 'ventana' && me.id !== t.pid ? this.lioSwaps(this.active) : [],
      winners: this.winners,
      log: this.log.slice(-80),
      version: this.version,
    };
  }

  needsAction(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p || this.phase !== 'juego') return false;
    const t = this.turn;
    if (t.paso === 'ventana') return p.id !== t.pid && t.ventana[p.id] === undefined && this.attacksFor(p).length > 0;
    if (t.paso === 'defensa') return p.id === t.pid;
    return p.id === t.pid;
  }
}

const ACTIONS = {
  // ---------------- sala
  configurar(p, d) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (d.druida !== undefined) {
      if (!C.DRUIDAS[d.druida]) fail('Druida no válido');
      if (this.players.some((x) => x !== p && x.druida === d.druida)) fail('Ese druida ya está elegido');
      p.druida = d.druida;
    }
    if (d.mascota !== undefined) {
      if (!C.MASCOTAS[d.mascota]) fail('Mascota no válida');
      if (this.players.some((x) => x !== p && x.mascota === d.mascota)) fail('Esa mascota ya está elegida');
      p.mascota = d.mascota;
    }
    if (d.name !== undefined) p.name = String(d.name).trim().slice(0, 20) || p.name;
  },
  bot(p) {
    if (p.id !== this.hostId) fail('Solo el anfitrión puede añadir bots');
    this.addPlayer('', { bot: true });
  },
  expulsar(p, d) {
    if (p.id !== this.hostId) fail('Solo el anfitrión puede expulsar');
    if (d.id === p.id) fail('No puedes expulsarte');
    this.removePlayer(d.id);
  },
  empezar(p) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (p.id !== this.hostId) fail('Solo el anfitrión puede empezar');
    this.start();
  },

  // ---------------- fase 1: recoger
  recoger(p, d) {
    this.requireActive(p, 'recoger');
    const zorro = !!d.zorro;
    if (zorro && (p.mascota !== 'zorro' || p.usos <= 0)) fail('No puedes usar el Zorro');
    const avail = this.claro.filter(Boolean).length;
    const need = Math.min(zorro ? C.RECOGER_ZORRO : C.RECOGER, avail);
    const slots = [...new Set((d.slots || []).map(Number))];
    if (slots.length !== need || !slots.every((i) => this.claro[i])) fail(`Elige ${need} ingredientes de El Claro`);
    const got = slots.map((i) => this.claro[i]);
    for (const i of slots) this.claro[i] = null;
    for (const c of got) p.reserva[c] += 1;
    if (zorro) p.usos -= 1;
    this.say(`${p.name} recoge ${got.map(N).join(', ')}${zorro ? ' gracias al Zorro' : ''}.`);
    this.refill();
    this.openWindow();
  },

  // ---------------- ataques (rivales del activo)
  atacar(p, d) {
    if (this.phase !== 'juego' || this.turn.paso !== 'ventana') fail('Ahora no se puede atacar');
    if (p.id === this.turn.pid) fail('No puedes atacarte a ti mismo');
    if (this.turn.ventana[p.id] !== undefined) fail('Ya has decidido');
    const r = { carta: d.carta };
    if (d.carta === 'robo') Object.assign(r, { tipo: d.tipo, colocar: !!d.colocar });
    if (d.carta === 'lio') Object.assign(r, { tipo: d.tipo, slot: Number(d.slot), bonus: d.bonus && d.bonus.tipo ? { tipo: d.bonus.tipo, como: d.bonus.como || d.bonus.tipo } : null });
    if (d.carta === 'sueno') Object.assign(r, { bonus: d.bonus && d.bonus.tipo ? { tipo: d.bonus.tipo } : null });
    this.validateAttack(p, r);
    this.turn.ventana[p.id] = r;
    this.resolveWindow();
  },
  pasar(p) {
    if (this.phase !== 'juego' || this.turn.paso !== 'ventana') fail('Ahora no hay nada que pasar');
    if (p.id === this.turn.pid) fail('Espera a tus rivales');
    if (this.turn.ventana[p.id] === undefined) this.turn.ventana[p.id] = 'pasar';
    this.resolveWindow();
  },
  defender(p) {
    this.requireActive(p, 'defensa');
    if (!this.canDefend(p)) fail('Necesitas 2 Lumen y tener tu magia libre');
    this.defend();
  },
  no_defender(p) {
    this.requireActive(p, 'defensa');
    this.applyAttack();
  },

  // ---------------- fase 2: estudiar
  abandonar(p) {
    this.requireActive(p, 'estudiar');
    const t = this.turn;
    this.requireStudy(p);
    if (t.tocado || t.estudiadas > 0) fail('Solo puedes abandonar al principio de tu fase de estudio');
    for (const k of C.ING) this.toBag(k, p.estudio.placed[k]);
    this.catalog[p.estudio.card] += 1;
    this.say(`${p.name} abandona ${cardName(p.estudio.card)}.`);
    p.estudio = null;
    t.tocado = true;
  },
  elegir(p, d) {
    this.requireActive(p, 'estudiar');
    const t = this.turn;
    if (p.estudio) fail('Ya tienes una receta en estudio');
    if (t.completada) fail('Ya has aprendido algo en esta fase: elige receta en tu próximo turno');
    const card = C.CARTAS[d.carta];
    if (!card) fail('Conocimiento no válido');
    if (this.knows(p, d.carta)) fail('Ya conoces ese conocimiento');
    if (!(this.catalog[d.carta] > 0)) fail('No quedan copias de esa carta');
    this.catalog[d.carta] -= 1;
    p.estudio = { card: d.carta, placed: emptyIng() };
    t.tocado = true;
    this.say(`${p.name} empieza a estudiar ${card.nombre}.`);
  },
  colocar(p, d) {
    this.requireActive(p, 'estudiar');
    const t = this.turn;
    if (t.lechuza) fail('Ya has terminado tu estudio normal');
    if (t.estudiadas >= this.studyLimit(p)) fail(`Ya has colocado ${this.studyLimit(p)} ingrediente(s) este turno`);
    const como = d.como || d.tipo;
    if (como !== d.tipo) {
      if (p.mascota !== 'liebre' || p.usos <= 0) fail('Los ingredientes deben coincidir con la receta');
      this.place(p, d.tipo, como);
      p.usos -= 1;
      this.say(`(La Liebre transforma el ingrediente.)`);
    } else {
      this.place(p, d.tipo);
    }
    t.estudiadas += 1;
    t.tocado = true;
  },
  lechuza(p, d) {
    this.requireActive(p, 'estudiar');
    if (p.mascota !== 'lechuza' || p.usos <= 0) fail('No puedes usar la Lechuza');
    if (this.turn.lechuza) fail('Ya has usado la Lechuza');
    this.place(p, d.tipo);
    p.usos -= 1;
    this.turn.lechuza = true;
    this.turn.tocado = true;
    this.say('(Ayuda de la Lechuza.)');
  },
  fin_estudio(p) {
    this.requireActive(p, 'estudiar');
    this.turn.paso = 'preparar';
  },

  // ---------------- fase 3: preparar
  preparar(p, d) {
    this.requireActive(p, ['estudiar', 'preparar']);
    const t = this.turn;
    if (t.preparada) fail('Ya has preparado una poción este turno');
    const card = C.CARTAS[d.carta];
    if (!card || card.tipo !== 'pocion' || !this.knows(p, d.carta)) fail('No conoces esa receta de poción');
    if (p.pociones.includes(d.carta)) fail('Ya tienes esa poción preparada');
    if (p.pociones.length >= C.MAX_POCIONES) fail('Ya tienes 2 pociones preparadas');
    this.pay(p, card.coste);
    p.pociones.push(d.carta);
    t.preparada = true;
    t.paso = 'preparar';
    this.say(`${p.name} prepara ${card.nombre}.`);
  },
  fin_turno(p) {
    this.requireActive(p, ['estudiar', 'preparar']);
    if (total(p.reserva) > C.LIMITE_RESERVA) {
      this.turn.paso = 'descartar';
      return;
    }
    this.nextTurn();
  },
  descartar(p, d) {
    this.requireActive(p, 'descartar');
    const out = emptyIng();
    for (const k of C.ING) out[k] = Math.max(0, Math.floor(Number((d.ings || {})[k]) || 0));
    const extra = total(p.reserva) - C.LIMITE_RESERVA;
    if (total(out) !== extra) fail(`Devuelve exactamente ${extra} ingrediente(s)`);
    if (!C.ING.every((k) => p.reserva[k] >= out[k])) fail('No tienes esos ingredientes');
    for (const k of C.ING) {
      p.reserva[k] -= out[k];
      this.toBag(k, out[k]);
    }
    this.say(`${p.name} devuelve ${extra} ingrediente(s) a la bolsa.`);
    this.nextTurn();
  },

  // ---------------- magia en cualquier turno
  magia(p, d) {
    this.castPersonal(p, d);
  },
  cervatillo(p, d) {
    this.requireMagicMoment(p);
    if (p.mascota !== 'cervatillo' || p.usos <= 0) fail('No puedes usar el Cervatillo');
    if (p.cervTurno !== this.turnIndex) fail('El Cervatillo se usa justo después de una magia que no sea gratis');
    this.place(p, d.tipo);
    p.usos -= 1;
    p.cervTurno = -1;
    this.say('(Energía del Cervatillo.)');
  },
};

module.exports = { Game, GameError, pendingOf, total, emptyIng, costText };
