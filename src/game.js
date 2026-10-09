'use strict';

const C = require('./config');
const D = require('./dice');
const I = require('./items');

class GameError extends Error {}

function fail(msg) {
  throw new GameError(msg);
}

const COLOR_LABEL = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', amarillo: 'Amarillo' };

function baseStats(raza, clase) {
  const r = C.RACES[raza];
  const c = C.CLASSES[clase];
  const af = C.afinidad(raza, clase);
  const e = af ? C.AFINIDAD_EFECTO[af] : { vida: 0, mana: 0, fuerza: 0 };
  let vida = C.BASE_STATS.vida + r.vida + c.vida + e.vida;
  if (e.vidaMax) vida = Math.max(e.vidaMin, Math.min(e.vidaMax, vida));
  return {
    vida,
    mana: Math.min(C.MAX_MANA_INICIAL, Math.max(C.MIN_MANA_INICIAL, C.BASE_STATS.mana + r.mana + c.mana + e.mana)),
    fuerza: Math.max(C.MIN_FUERZA_INICIAL, C.BASE_STATS.fuerza + r.fuerza + c.fuerza + e.fuerza),
  };
}

class Game {
  constructor(code, opts = {}) {
    this.code = code;
    this.rng = opts.rng || Math.random;
    this.settings = { pvpHits: C.DEFAULT_PVP_HITS };
    this.phase = 'lobby';
    // Sala en dos pasos: primero se eligen los contrincantes y luego cada uno configura su héroe.
    this.lobbyStage = 'rivales';
    this.round = 0;
    this.roboLeft = 2;
    this.players = [];
    this.trades = [];
    this.tournament = null;
    this.winner = null;
    this.log = [];
    this.version = 0;
    this._id = 0;
  }

  nextId() {
    this._id += 1;
    return `o${this._id}`;
  }

  say(text) {
    this.log.push({ n: this.log.length, text });
    if (this.log.length > 300) this.log.splice(0, this.log.length - 300);
  }

  player(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p) fail('Jugador desconocido');
    return p;
  }

  // ---------------------------------------------------------------- Lobby

  addPlayer(name, { bot = false } = {}) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (this.players.length >= 4) fail('La sala está llena (4 jugadores)');
    const free = C.COLORS.filter((c) => !this.players.some((p) => p.color === c));
    const n = this.players.length + 1;
    const p = {
      id: `p${this.nextId().slice(1)}`,
      name: String(name || `Jugador ${n}`).slice(0, 20),
      bot,
      connected: true,
      color: free[0],
      raza: null,
      clase: null,
      ready: false,
      hero: null,
      stage: null,
      offers: null,
      monster: null,
      combat: null,
      rewards: null,
    };
    if (bot) {
      const razas = Object.keys(C.RACES);
      const clases = Object.keys(C.CLASSES);
      p.raza = razas[Math.floor(this.rng() * razas.length)];
      p.clase = clases[Math.floor(this.rng() * clases.length)];
      p.ready = true;
    }
    this.players.push(p);
    this.say(`${p.name} se une a la partida.`);
    return p;
  }

  removePlayer(id) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    const p = this.player(id);
    this.players = this.players.filter((x) => x !== p);
    this.say(`${p.name} sale de la partida.`);
  }

  // ¿Tiene este jugador algo que hacer ahora? (para el juego en un mismo dispositivo)
  needsAction(id) {
    const p = this.players.find((x) => x.id === id);
    if (!p || p.bot) return false;
    if (p.hero && p.hero.pending && p.hero.pending.length) return true;
    if (this.phase === 'lobby') return this.lobbyStage === 'heroes' && !p.ready;
    if (this.phase === 'combat') return p.stage !== 'hecho';
    if (this.phase === 'prep') return !p.ready;
    if (this.phase === 'torneo') {
      const t = this.tournament;
      if (!t) return false;
      if (t.stage === 'batalla') return t.alive.includes(p.id) && !!p.combat && p.combat.status === 'activo';
      if (t.stage === 'eleccion') return t.ranking && t.ranking[0] === p.id;
      if (t.stage === 'botin') return !!t.loot && t.loot.winner === p.id;
      const m = t.matches.find((x) => x.started && !x.winner);
      return !!m && m.attacker === p.id && !!p.combat && p.combat.status === 'activo';
    }
    return false;
  }

  get hostId() {
    const h = this.players.find((p) => !p.bot);
    return h ? h.id : null;
  }

  // ---------------------------------------------------------------- Acciones

  act(playerId, type, data = {}) {
    const p = this.player(playerId);
    const handler = ACTIONS[type];
    if (!handler) fail('Acción desconocida');
    handler.call(this, p, data || {});
    this.version += 1;
  }

  // ---------------------------------------------------------------- Héroe

  // Antes de la final: el rival de la final (o null).
  finalFoe(p) {
    if (!this.pendingFinal || !this.pendingFinal.includes(p.id)) return null;
    return this.pendingFinal.find((id) => id !== p.id) || null;
  }

  requireFinalFoe(p, t, what) {
    const foe = this.finalFoe(p);
    if (foe && t.id !== foe) fail(`Antes de la final solo puedes ${what} a ${this.player(foe).name}`);
  }

  // Vida máxima: en la Batalla final cada trofeo suma 1.
  maxVida(p) {
    return p.hero.base.vida + (this.phase === 'torneo' ? p.hero.trofeos || 0 : 0);
  }

  effFuerza(p) {
    return p.hero.base.fuerza + I.equipmentFuerza(p.hero.inv, p.clase);
  }

  availableMana(p) {
    return Math.max(0, p.hero.base.mana + I.equipmentMana(p.hero.inv) - p.hero.manaDebt);
  }

  diceCount() {
    return C.DADOS;
  }

  maxRolls(p) {
    return C.rollsForFuerza(this.effFuerza(p));
  }

  combatMana(p) {
    const bonus = p.combat ? p.combat.manaBonus : 0;
    return this.availableMana(p) + bonus;
  }

  tourneyScore(p) {
    return this.effFuerza(p) + p.hero.base.mana;
  }

  createHero(p) {
    const base = baseStats(p.raza, p.clase);
    p.hero = {
      base,
      vida: base.vida,
      inv: I.emptyInventory(),
      manaDebt: 0,
      curses: 0,
      pending: [],
      caidas: 0,
      victorias: 0,
      trofeos: 0,
      monedas: C.MONEDAS_INICIALES,
    };
  }

  receiveItem(p, item, origin) {
    const conflicts = I.tryPlace(p.hero.inv, item);
    if (conflicts) {
      p.hero.pending.push({ item, options: I.conflictOptions(p.hero.inv, item, conflicts) });
      this.say(`${p.name} recibe ${item.nombre} (${origin}), pero debe decidir dónde guardarlo.`);
    } else {
      this.say(`${p.name} obtiene ${item.nombre} (${origin}).`);
    }
  }

  heal(p, amount) {
    const before = p.hero.vida;
    p.hero.vida = Math.min(this.maxVida(p), p.hero.vida + amount);
    return p.hero.vida - before;
  }

  knockout(p) {
    // Regla 9: al caer a 0 Vida pierde todos sus objetos y recupera la Vida inicial.
    p.hero.inv = I.emptyInventory();
    p.hero.pending = [];
    p.hero.monedas = 0;
    p.hero.vida = p.hero.base.vida;
    p.hero.caidas += 1;
    this.dropTradesOf(p.id);
    this.say(
      `💀 ${p.name} cae a 0 Vida: pierde todos sus objetos y sus monedas, y recupera su Vida inicial.`
    );
  }

  // ---------------------------------------------------------------- Fase 1

  startGame() {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (this.players.length < 1) fail('No hay jugadores');
    for (const p of this.players) {
      if (!p.raza || !p.clase) fail(`${p.name} todavía no ha elegido Raza y Clase`);
      if (!p.ready) fail(`${p.name} todavía no está listo`);
    }
    for (const p of this.players) this.createHero(p);
    this.round = 1;
    this.say('⚔️ ¡Comienza la aventura! Preparad a vuestros héroes para la ronda 1.');
    this.startPrep();
  }

  startPrep() {
    this.phase = 'prep';
    this.trades = [];
    for (const p of this.players) {
      // Un maleficio recibido y un comercio por jugador en cada ronda.
      p.cursedThisRound = false;
      p.tradedThisRound = false;
      p.offeredThisRound = false;
      p.stoleThisRound = false;
      p.boughtThisRound = false;
      p.shop = this.makeShop(p);
      // Antes de la final solo tienen que confirmar los finalistas.
      p.ready = !!this.pendingFinal && !this.pendingFinal.includes(p.id);
      p.stage = null;
      p.offers = null;
      p.monster = null;
      p.combat = null;
      p.rewards = null;
    }
  }

  checkPrepDone() {
    if (this.phase !== 'prep') return;
    if (!this.players.every((p) => p.ready)) return;
    this.trades = [];
    if (this.pendingFinal) {
      const [a, b] = this.pendingFinal;
      this.pendingFinal = null;
      this.phase = 'torneo';
      this.startFinal(a, b);
      return;
    }
    if (this.round > C.ROUNDS) {
      this.startTournament();
      return;
    }
    this.phase = 'combat';
    this.say(`— Ronda ${this.round} de ${C.ROUNDS} —`);
    for (const p of this.players) {
      p.ready = false;
      p.stage = 'combate';
      p.offers = this.makeOffers(p);
      p.monster = null;
      this.newCombat(p, {
        kind: 'monstruo',
        targets: p.offers.map((m) => ({ tipo: m.tipo, combo: m.combo })),
        label: 'Combate',
      });
    }
  }

  // Cinco monstruos por ronda, de pequeño a grande. Todos se juegan con las
  // mismas 5 esferas: derrotas el más grande que completes.
  makeOffers(p) {
    this._invHint = p && p.hero ? p.hero.inv : null;
    const r = Math.min(12, this.round);
    let lo = Math.max(1, Math.min(8, r - 2));
    const levels = [0, 1, 2, 3, 4].map((k) => lo + k);
    const FACES = ['rojo', 'azul', 'verde', 'amarillo'];
    const pick = () => FACES[Math.floor(this.rng() * 4)];
    const others = (c, n) => { const rest = FACES.filter((x) => x !== c); return Array.from({ length: n }, () => rest[Math.floor(this.rng() * rest.length)]); };
    const combos = [
      () => { const a = pick(); return [a, a, a, ...others(a, 1)]; },             // trío + 1   (~90 %)
      () => { const a = pick(); return [a, a, a, a]; },                           // póker      (~80 %)
      () => { const a = pick(); const b = others(a, 1)[0]; return [a, a, a, b, b]; }, // full    (~70 %)
      () => { const a = pick(); return [a, a, a, a, ...others(a, 1)]; },          // póker + 1  (~55 %)
      () => { const a = pick(); return [a, a, a, a, a]; },                        // pleno      (~35 %)
    ];
    const variantes = [1, 1, 2, 2, 3];
    const order = ['rojo', 'azul', 'verde', 'amarillo', 'circulo', 'cuadrado', 'rombo', 'triangulo'];
    return levels.map((level, k) => {
      const m = C.MONSTERS[level];
      const v = C.VARIANTS[variantes[k]];
      const tipo = this.rng() < 0.5 ? 'color' : 'forma';
      let combo = combos[k]();
      if (tipo === 'forma') combo = combo.map((c) => C.COLOR_TO_SHAPE[c]);
      combo.sort((a, b) => order.indexOf(a) - order.indexOf(b));
      // Premios según el tamaño: objetos de grado I (pequeños), II (medianos), III (grande).
      const bump = Math.floor((r - 1) / 4);
      const rewardLevel = Math.min(12, [1, 2, 4, 6, 9][k] + bump);
      return {
        tipo,
        level,
        tier: k,
        nombre: m.nombre,
        imagen: m.imagen,
        variante: variantes[k],
        tamano: v.nombre,
        combo,
        dano: [2, 3, 4, 5, 6][k] + Math.floor((r - 1) / 4),
        rewards: k === 4
          ? [I.makeEquipment(this.rng, rewardLevel, () => this.nextId(), this._invHint), I.makeEquipment(this.rng, rewardLevel, () => this.nextId(), this._invHint)]
          : [this.reward(rewardLevel, this._invHint), this.reward(rewardLevel, this._invHint)],
      };
    });
  }

  // El monstruo más fuerte (nivel y tamaño) que el héroe puede afrontar, sin pasar del máximo de la ronda.
  affordableOffer(dice, fromLevel, fromVariant = 3) {
    for (let level = fromLevel; level >= 1; level--) {
      for (let variante = level === fromLevel ? fromVariant : 3; variante >= 1; variante--) {
        if (C.variantCombo(C.MONSTERS[level].combo, variante).length <= dice) return this.makeOffer(level, variante);
      }
    }
    return this.makeOffer(1, 1);
  }

  rollOffers() {
    const levels = [...C.levelsForRound(this.round)];
    const chosen = [];
    for (let k = 0; k < 2; k++) {
      if (levels.length === 1) {
        chosen.push(levels[0]);
        continue;
      }
      const i = Math.floor(this.rng() * levels.length);
      chosen.push(levels.splice(i, 1)[0]);
    }
    chosen.sort((a, b) => a - b);
    return chosen.map((level) => {
      let r = this.rng();
      let variante = 1;
      for (const [k, v] of Object.entries(C.VARIANTS)) {
        if (r < v.peso) { variante = Number(k); break; }
        r -= v.peso;
      }
      return this.makeOffer(level, variante);
    });
  }

  makeOffer(level, variante, tipo) {
    const m = C.MONSTERS[level];
    const v = C.VARIANTS[variante];
    const rewardLevel = Math.min(12, level + v.recompensa);
    tipo = tipo || (this.rng() < 0.5 ? 'color' : 'forma');
    const base = tipo === 'forma' ? m.combo.map((c) => C.COLOR_TO_SHAPE[c]) : m.combo;
    return {
      tipo,
      level,
      nombre: m.nombre,
      imagen: m.imagen,
      variante,
      tamano: v.nombre,
      combo: C.variantCombo(base, variante),
      dano: C.monsterDamage(level) + v.dano,
      rewards: [
        this.reward(rewardLevel, this._invHint),
        this.reward(rewardLevel, this._invHint),
      ],
    };
  }

  checkRoundDone() {
    if (this.phase !== 'combat') return;
    if (!this.players.every((p) => p.stage === 'hecho')) return;
    this.round += 1;
    if (this.round > C.ROUNDS) {
      this.say('🏁 Fin de la aventura. Última preparación antes del Torneo.');
    } else {
      this.say(`Entre combates: preparad la ronda ${this.round}.`);
    }
    this.startPrep();
  }

  // ---------------------------------------------------------------- Combate

  newCombat(p, { kind, combo, targets, label }) {
    targets = targets || [{ tipo: 'color', combo }];
    const combat = {
      kind,
      label,
      targets,
      combo: targets[0].combo,
      diceCount: this.diceCount(p),
      maxRolls: this.maxRolls(p),
      dice: [],
      rolls: 0,
      manaUsed: false,
      manaBonus: p.hero.manaNext || 0,
      cursesLeft: p.hero.curses,
      status: 'activo',
      events: [],
    };
    p.hero.curses = 0;
    p.hero.manaNext = 0;
    p.combat = combat;
    // El Maná se convierte en esferas multicolor (comodín) ya fijadas desde el principio.
    combat.dice = Array.from({ length: combat.diceCount }, () => ({ face: null, shape: null, held: false, fixed: false }));
    this.applyWhites(p);
    if (combat.cursesLeft > 0) {
      combat.events.push(`Arrastra ${combat.cursesLeft} maldición(es): se le anularán esferas acertadas.`);
    }
    return combat;
  }

  fixableDice(p) {
    return C.fixedDiceForMana(this.combatMana(p));
  }

  // Estado de cada objetivo del combate (qué dados usa y cuántos faltan).
  targetStatus(cb) {
    return cb.targets.map((t) => {
      const r = D.matchDice(D.valuesOf(cb.dice, t.tipo), t.combo, D.WILD[t.tipo]);
      return { ...r, ok: r.missing === 0 };
    });
  }

  bestTarget(cb) {
    const st = this.targetStatus(cb);
    let best = 0;
    st.forEach((x, i) => { if (x.missing < st[best].missing) best = i; });
    return { ...st[best], index: best };
  }

  // Asegura tantas esferas multicolor fijadas como permita el Maná del combate.
  applyWhites(p) {
    const cb = p.combat;
    const want = Math.min(cb.diceCount, this.fixableDice(p));
    let have = cb.dice.filter((d) => d.fixed).length;
    if (have >= want) return;
    // Primero las que aún no se han tirado o no sirven; después cualquiera.
    const used = cb.rolls ? this.bestTarget(cb).used : new Set();
    const order = cb.dice.map((d, i) => i).filter((i) => !cb.dice[i].fixed && !cb.dice[i].maldita)
      .sort((a, b) => (used.has(a) ? 1 : 0) - (used.has(b) ? 1 : 0));
    for (const i of order) {
      if (have >= want) break;
      cb.dice[i] = { face: 'multicolor', shape: 'espiral', held: true, fixed: true };
      have += 1;
    }
    cb.manaUsed = true;
  }

  roll(p, hold, aim) {
    const cb = this.activeCombat(p);
    if (cb.rolls >= cb.maxRolls) fail(`Ya has hecho las ${cb.maxRolls} tiradas`);
    void aim; // ya no se fija objetivo: puedes derrotar a cualquiera que completes
    let newIdx;
    if (cb.rolls === 0) {
      newIdx = cb.dice.map((d, i) => (d.fixed ? -1 : i)).filter((i) => i >= 0);
    } else {
      const holdSet = new Set((hold || []).map(Number));
      cb.dice.forEach((d, i) => {
        // La esfera maldita no se puede guardar: hay que relanzarla.
        d.held = d.fixed || (holdSet.has(i) && !d.maldita);
      });
      newIdx = cb.dice.map((d, i) => (d.held ? -1 : i)).filter((i) => i >= 0);
      if (newIdx.length === 0) fail('Selecciona al menos un dado para volver a tirar');
    }
    const rollDie = (i) => {
      cb.dice[i].face = D.rollFace(this.rng);
      cb.dice[i].shape = D.rollShape(this.rng);
      delete cb.dice[i].maldita;
    };
    for (const i of newIdx) rollDie(i);
    cb.rolls += 1;
    cb.events.push(`Tirada ${cb.rolls}`);

    // Maleficio: cada uno anula una esfera acertada de esta tirada. Queda con la
    // calavera, no cuenta para nada y hay que relanzarla en la siguiente.
    cb.cursed = [];
    while (cb.cursesLeft > 0) {
      const succ = new Set();
      if (cb.kind === 'batalla') {
        // En la batalla, el maleficio anula una de las esferas nuevas del color que más tienes.
        const cnt = {};
        for (const d of cb.dice) if (d.face && d.face !== 'maldita') cnt[d.face] = (cnt[d.face] || 0) + 1;
        const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        for (const i of newIdx) if (cb.dice[i].face === top || cb.dice[i].face === 'multicolor') succ.add(i);
      }
      for (const t of cb.kind === 'batalla' ? [] : cb.targets) {
        for (const i of D.successfulNewDice(D.valuesOf(cb.dice, t.tipo), newIdx, t.combo, D.WILD[t.tipo])) succ.add(i);
      }
      if (succ.size === 0) break;
      const ci = [...succ][0];
      cb.cursed.push({ index: ci, face: cb.dice[ci].face, shape: cb.dice[ci].shape });
      cb.dice[ci].face = 'maldita';
      cb.dice[ci].shape = 'maldita';
      cb.dice[ci].maldita = true;
      cb.cursesLeft -= 1;
      cb.events.push('Maleficio: una esfera acertada se pierde; relánzala');
    }
    for (const d of cb.dice) d.held = d.fixed;
    this.afterCombatStep(p);
  }

  useMana(p, assign) {
    const cb = this.activeCombat(p);
    if (cb.rolls < 1) fail('Primero haz la primera tirada');
    if (cb.manaUsed) fail('Ya has usado el Maná en este combate');
    const k = this.fixableDice(p);
    if (k <= 0) fail('Tu Maná no es suficiente para fijar dados (mínimo 5)');
    if (!Array.isArray(assign) || assign.length === 0) fail('Elige qué dados fijar');
    if (assign.length > k) fail(`Solo puedes fijar ${k} dado(s)`);
    const seen = new Set();
    for (const a of assign) {
      const i = Number(a.index);
      if (!Number.isInteger(i) || i < 0 || i >= cb.dice.length || seen.has(i)) fail('Dado no válido');
      if (!C.FACES.includes(a.face)) fail('Color no válido');
      if (cb.dice[i].fixed) fail('Ese dado ya está fijado');
      seen.add(i);
    }
    for (const a of assign) {
      const d = cb.dice[Number(a.index)];
      d.face = a.face;
      d.fixed = true;
      d.held = true;
    }
    cb.manaUsed = true;
    cb.events.push(`✨ Maná: fija ${assign.map((a) => a.face).join(', ')}`);
    this.afterCombatStep(p);
  }

  activeCombat(p) {
    if (!p.combat || p.combat.status !== 'activo') fail('No estás en combate');
    if (this.phase === 'torneo' && this.tournament && this.tournament.stage === 'batalla') {
      if (!p.combat || p.combat.kind !== 'batalla' || p.combat.status !== 'activo') fail('No estás en combate');
      return p.combat;
    }
    if (this.phase === 'torneo') {
      const m = this.matchOf(p);
      if (!m || m.attacker !== p.id) fail('No es tu turno');
    } else if (p.stage !== 'combate') fail('No estás en combate');
    return p.combat;
  }

  canStillAct(p) {
    const cb = p.combat;
    if (cb.rolls < cb.maxRolls && cb.dice.some((d) => !d.fixed)) return true;
    if (cb.kind === 'monstruo' && this.targetStatus(cb).some((x) => x.ok)) return true; // falta presentarla
    if (cb.kind !== 'monstruo') return false;
    // Sin tiradas: solo una poción de Maná que añada comodines suficientes puede salvarle.
    const missing = this.bestTarget(cb).missing;
    const potential = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos]
      .filter((it) => it.efecto === 'mana')
      .reduce((s, it) => s + it.valor, 0);
    const extra = C.fixedDiceForMana(this.combatMana(p) + potential) - this.fixableDice(p);
    return potential > 0 && extra >= missing;
  }

  afterCombatStep(p) {
    const cb = p.combat;
    if (cb.kind === 'batalla') return;
    if (cb.kind !== 'monstruo' && D.isSatisfied(cb.dice.map((d) => d.face), cb.combo)) {
      this.endCombat(p, true);
    } else if (!this.canStillAct(p)) {
      this.endCombat(p, false);
    }
  }

  // Presenta la combinación contra uno de los dos monstruos.
  present(p, index) {
    const cb = this.activeCombat(p);
    if (cb.kind !== 'monstruo') fail('Solo contra monstruos');
    if (cb.rolls < 1) fail('Primero lanza las esferas');
    const st = this.targetStatus(cb)[Number(index)];
    if (!st) fail('Monstruo no válido');
    if (!st.ok) fail('Tus esferas no completan lo que pide este monstruo');
    p.monster = p.offers[Number(index)];
    cb.label = `${p.monster.nombre} ${p.monster.tamano.toLowerCase()}`;
    cb.chosen = Number(index);
    this.endCombat(p, true);
  }

  endCombat(p, won) {
    const cb = p.combat;
    cb.status = won ? 'victoria' : 'derrota';
    // El Maná de un maleficio lanzado durante este ataque cuenta para el siguiente.
    p.hero.manaDebt = p.hero.debtNext || 0;
    p.hero.debtNext = 0;
    if (cb.kind === 'monstruo') this.endMonsterCombat(p, won);
    else this.endDuelAttack(p);
  }

  endMonsterCombat(p, won) {
    if (!p.monster) p.monster = p.combat.aim != null ? p.offers[p.combat.aim] : [...p.offers].sort((a, b) => a.dano - b.dano)[0];
    const m = p.monster;
    if (won) {
      p.hero.victorias += 1;
      // Cada monstruo grande derrotado es un trofeo: +1 de Vida en la Batalla final.
      if (m.tier === 4) p.hero.trofeos = (p.hero.trofeos || 0) + 1;
      // Monedas solo según el monstruo (no según las tiradas que hayas usado).
      const coins = [1, 2, 4, 6, 9][m.tier ?? 2];
      p.coinsPending = { n: coins, rolls: p.combat.rolls };
      p.stage = 'recompensa';
      p.rewards = m.rewards;
      this.say(`🗡 ${p.name} derrota a ${m.nombre} ${m.tamano.toLowerCase()} (nivel ${m.level}).`);
    } else {
      p.hero.vida -= m.dano;
      this.say(`🩸 ${p.name} no consigue derrotar a ningún monstruo: ${m.nombre} le quita ${m.dano} de Vida.`);
      if (p.hero.vida <= 0) this.knockout(p);
      p.stage = 'hecho';
      this.checkRoundDone();
    }
  }

  // ---------------------------------------------------------------- Torneo

  // Batalla final: todos contra todos. Cada ronda todos tiran a la vez y, al
  // acabar, cada uno elige a quién golpea. Esferas del color de la víctima
  // (y comodines): 2 → 1 de daño, 3 → 2, 4 o más → 3. Cada esfera de tu propio
  // color quita 1 del daño que recibes esa ronda. Gana el último en pie.
  startTournament() {
    this.phase = 'torneo';
    for (const p of this.players) {
      p.hero.pending = [];
      p.hero.vida = this.maxVida(p);
    }
    this.tournament = { stage: 'batalla', round: 0, alive: this.players.map((p) => p.id), last: null, matches: [], champion: null };
    this.phase = 'torneo';
    this.say('⚔ ¡Comienza la Batalla final! Todos contra todos: el último en pie gana.');
    this.startBattleRound();
  }

  startBattleRound() {
    const t = this.tournament;
    t.round += 1;
    t.strikes = {};
    this.say(`— Batalla, ronda ${t.round} —`);
    for (const id of t.alive) {
      const p = this.player(id);
      p.battleCursed = false;
      p.combat = null;
      // El Maná gastado en maleficios la ronda anterior falta en esta.
      p.hero.manaDebt = p.hero.debtNext || 0;
      p.hero.debtNext = 0;
      this.newCombat(p, { kind: 'batalla', combo: [], label: 'Batalla final' });
    }
  }

  battleHits(attacker, target) {
    const n = attacker.combat.dice.filter((d) => d.face === target.color || d.face === 'multicolor').length;
    const base = Math.max(0, Math.min(3, n - 1));
    return base ? base + C.fuerzaDamageBonus(this.effFuerza(attacker)) : 0;
  }

  battleShield(p) {
    return p.combat.dice.filter((d) => d.face === p.color).length;
  }

  strike(p, targetId) {
    const t = this.tournament;
    if (this.phase !== 'torneo' || !t || t.stage !== 'batalla') fail('No hay batalla');
    const cb = p.combat;
    if (!cb || cb.kind !== 'batalla' || cb.status !== 'activo') fail('Ya has atacado esta ronda');
    if (cb.rolls < 1) fail('Primero lanza las esferas');
    if (!t.alive.includes(targetId) || targetId === p.id) fail('Elige a un rival en pie');
    t.strikes[p.id] = targetId;
    cb.status = 'hecho';
    if (t.alive.every((id) => t.strikes[id])) this.resolveBattleRound();
  }

  resolveBattleRound() {
    const t = this.tournament;
    const before = Object.fromEntries(t.alive.map((id) => [id, this.player(id).hero.vida]));
    const incoming = {};
    const hits = [];
    for (const id of t.alive) {
      const a = this.player(id);
      const v = this.player(t.strikes[id]);
      const dmg = this.battleHits(a, v);
      hits.push({ by: id, to: v.id, dmg, faces: a.combat.dice.map((d) => ({ face: d.face, shape: d.shape })) });
      incoming[v.id] = (incoming[v.id] || 0) + dmg;
    }
    const shields = {};
    for (const id of t.alive) {
      const p = this.player(id);
      const raw = incoming[id] || 0;
      const shield = Math.min(raw, this.battleShield(p));
      shields[id] = shield;
      p.hero.vida = Math.max(0, p.hero.vida - (raw - shield));
    }
    for (const h of hits) this.say(`⚔ ${this.player(h.by).name} golpea a ${this.player(h.to).name}: ${h.dmg ? `−${h.dmg}` : 'falla'}.`);
    for (const id of t.alive) if (shields[id]) this.say(`🛡 ${this.player(id).name} para ${shields[id]} de daño con su color.`);
    t.last = { round: t.round, hits, shields, vida: Object.fromEntries(t.alive.map((id) => [id, this.player(id).hero.vida])) };
    const standing = t.alive.filter((id) => this.player(id).hero.vida > 0);
    for (const id of t.alive) if (!standing.includes(id)) this.say(`💀 ${this.player(id).name} cae en la Batalla final.`);
    for (const id of t.alive) this.player(id).combat = null;
    if (standing.length === 1) return this.finish(standing[0]);
    if (standing.length === 0) {
      // Caen todos a la vez: gana quien tenía más Vida antes del golpe.
      const best = [...t.alive].sort((a, b) => before[b] - before[a] || this.tourneyScore(this.player(b)) - this.tourneyScore(this.player(a)))[0];
      return this.finish(best);
    }
    t.alive = standing;
    this.startBattleRound();
  }

  chooseRival(p, rivalId) {
    const t = this.tournament;
    if (this.phase !== 'torneo' || t.stage !== 'eleccion') fail('No es momento de elegir rival');
    if (t.ranking[0] !== p.id) fail('Solo el primer clasificado elige rival');
    if (rivalId === p.id || !t.ranking.includes(rivalId)) fail('Rival no válido');
    const others = t.ranking.filter((id) => id !== p.id && id !== rivalId);
    t.stage = 'semis';
    this.say(`${p.name} elige enfrentarse a ${this.player(rivalId).name}.`);
    // Las semifinales se juegan una detrás de otra para poder verlas enteras.
    const m1 = this.addMatch('Semifinal 1', p.id, rivalId);
    this.addMatch('Semifinal 2', others[0], others[1]);
    this.startAttack(m1);
  }

  addMatch(label, a, b) {
    const pa = this.player(a);
    const pb = this.player(b);
    // Ataca primero quien tenga menos Fuerza + Maná (compensa al más débil;
    // el más fuerte ya tuvo la ventaja de elegir rival). Empate: menos Vida.
    const weaker = this.tourneyScore(pa) - this.tourneyScore(pb) || pa.hero.vida - pb.hero.vida;
    const first = weaker <= 0 ? a : b;
    const m = { id: this.tournament.matches.length, label, a, b, attacker: first, winner: null, turns: 0, started: false };
    this.tournament.matches.push(m);
    this.say(`⚔ ${label}: ${pa.name} contra ${pb.name}. Empieza atacando ${this.player(first).name}.`);
    return m;
  }

  matchOf(p) {
    if (!this.tournament) return null;
    return this.tournament.matches.find((m) => m.started && !m.winner && (m.a === p.id || m.b === p.id)) || null;
  }

  startAttack(m) {
    m.started = true;
    const att = this.player(m.attacker);
    const def = this.player(m.attacker === m.a ? m.b : m.a);
    const hits = this.settings.pvpHits;
    const min = C.pvpMinResults(hits);
    const attCan = this.diceCount(att) >= min;
    const defCan = this.diceCount(def) >= min;
    if (!attCan && !defCan) {
      // Ninguno puede hacer daño: el duelo no terminaría nunca.
      const pick = [att, def].sort(
        (x, y) => y.hero.vida - x.hero.vida || this.tourneyScore(y) - this.tourneyScore(x)
      )[0];
      this.say(
        `Ningún héroe tiene dados suficientes para hacer daño (${min}). Gana ${pick.name} por tener más Vida.`
      );
      this.endMatch(m, pick.id);
      return;
    }
    m.turns += 1;
    if (!attCan) {
      this.say(`${att.name} no tiene dados suficientes para atacar (necesita ${min}) y pierde el turno.`);
      m.attacker = def.id;
      this.startAttack(m);
      return;
    }
    att.combat = null;
    this.newCombat(att, {
      kind: 'duelo',
      combo: Array(hits).fill(def.color),
      label: `Ataque contra ${def.name}`,
    });
  }

  duelResults(p) {
    const color = p.combat.combo[0];
    return p.combat.dice.filter((d) => d.face === color || d.face === 'multicolor').length;
  }

  endDuelAttack(p) {
    const m = this.matchOf(p);
    const def = this.player(m.attacker === m.a ? m.b : m.a);
    const n = this.duelResults(p);
    const dmg = C.pvpDamage(n, this.settings.pvpHits);
    p.combat.damage = dmg;
    p.combat.status = dmg > 0 ? 'victoria' : 'derrota';
    // Último ataque, para que se pueda ver qué ha pasado.
    m.last = { by: p.id, to: def.id, dmg, faces: p.combat.dice.map((d) => ({ face: d.face, shape: d.shape })), color: def.color };
    if (dmg > 0) {
      def.hero.vida = Math.max(0, def.hero.vida - dmg);
      this.say(`💥 ${p.name} saca ${Math.min(n, this.settings.pvpHits)} resultado(s) ${def.color} y golpea a ${def.name}: −${dmg} Vida (le quedan ${def.hero.vida}).`);
      if (def.hero.vida <= 0) {
        this.endMatch(m, p.id);
        return;
      }
    } else {
      this.say(`🛡 ${p.name} falla su ataque contra ${def.name}.`);
    }
    m.attacker = def.id;
    this.startAttack(m);
  }

  endMatch(m, winnerId) {
    m.winner = winnerId;
    for (const id of [m.a, m.b]) {
      const pl = this.player(id);
      if (pl.combat && pl.combat.status === 'activo') pl.combat.status = 'cancelado';
    }
    const w = this.player(winnerId);
    this.say(`🏅 ${w.name} gana ${m.label}.`);
    const vencido = this.player(winnerId === m.a ? m.b : m.a);
    const premio = this.tournament.stage === 'final' ? C.PREMIO_FINAL : C.PREMIO_SEMIFINAL;
    const botin = vencido.hero.monedas;
    vencido.hero.monedas = 0;
    w.hero.monedas += botin + premio;
    this.say(`💰 ${w.name} se lleva ${botin} monedas de ${vencido.name} y ${premio} de premio.`);
    const t = this.tournament;
    if (t.stage === 'final') {
      this.finish(winnerId);
      return;
    }
    // Botín: el ganador de la semifinal elige un objeto del vencido.
    const loser = this.player(winnerId === m.a ? m.b : m.a);
    if (I.allItems(loser.hero.inv).length) {
      t.loot = { match: m.id, winner: winnerId, loser: loser.id };
      t.stage = 'botin';
      this.say(`${w.name} puede quedarse con un objeto de ${loser.name}.`);
      return;
    }
    this.continueTournament();
  }

  // Siguiente semifinal pendiente o, si ya se jugaron todas, la final.
  continueTournament() {
    const t = this.tournament;
    t.stage = 'semis';
    const next = t.matches.find((x) => !x.started && !x.winner);
    if (next) { this.startAttack(next); return; }
    if (t.matches.every((x) => x.winner)) {
      const finalists = t.bye ? [t.bye, t.matches[0].winner] : t.matches.map((x) => x.winner);
      // Antes de la final, una ronda de preparación como en la aventura.
      this.pendingFinal = finalists;
      t.stage = 'prefinal';
      this.startPrep();
      this.say('Antes de la final: podéis comerciar, comprar, robar o lanzar maleficios.');
    }
  }

  takeLoot(p, itemId) {
    const t = this.tournament;
    if (this.phase !== 'torneo' || t.stage !== 'botin' || !t.loot) fail('No hay botín que repartir');
    if (t.loot.winner !== p.id) fail('El botín no es tuyo');
    const loser = this.player(t.loot.loser);
    const it = I.findItem(loser.hero.inv, itemId);
    if (!it) fail('Ese objeto ya no existe');
    I.removeItem(loser.hero.inv, it.id);
    this.say(`💰 ${p.name} se queda con ${it.nombre} de ${loser.name}.`);
    t.loot = null;
    this.receiveItem(p, it, 'botín');
    this.continueTournament();
  }

  startFinal(a, b) {
    this.tournament.stage = 'final';
    // Antes de la final, los dos finalistas recuperan toda su Vida.
    for (const id of [a, b]) { const pl = this.player(id); pl.hero.vida = pl.hero.base.vida; }
    this.say('Los finalistas recuperan toda su Vida.');
    this.startAttack(this.addMatch('Final', a, b));
  }

  finish(id) {
    this.phase = 'fin';
    this.winner = id;
    this.tournament.champion = id;
    this.say(`🏆 ¡${this.player(id).name} GANA LA PARTIDA!`);
  }

  // ---------------------------------------------------------------- Vista

  // Recompensa de monstruo: los Pergaminos de Robo son raros (2 como mucho por partida, contando la tienda).
  reward(level, inv) {
    const it = I.makeReward(this.rng, level, () => this.nextId(), inv, { robo: this.roboLeft > 0 });
    if (it.efecto === 'robo') this.roboLeft -= 1;
    return it;
  }

  // Tienda de cada jugador para esta ronda: objetos de su nivel con su precio.
  makeShop(p) {
    if (!p.hero) return [];
    const lvl = Math.min(12, Math.max(1, this.round));
    const lv = () => Math.max(1, Math.min(12, lvl + Math.floor(this.rng() * 4) - 1));
    const id = () => this.nextId();
    // Siempre una poción y un pergamino, y al menos uno de los dos cura.
    const cura = this.rng() < 0.5 ? 'pocion' : 'pergamino';
    const pot = I.makeConsumable(this.rng, lv(), 'pocion', id, cura === 'pocion' ? { efecto: 'curacion' } : {});
    const scroll = I.makeConsumable(this.rng, lv(), 'pergamino', id, cura === 'pergamino' ? { efecto: 'curacion' } : { robo: this.roboLeft > 0 });
    if (scroll.efecto === 'robo') this.roboLeft -= 1;
    const items = [pot, scroll];
    while (items.length < C.TIENDA_OBJETOS) items.push(I.makeEquipment(this.rng, lv(), id, p.hero.inv));
    for (const it of items) it.precio = C.itemPrice(it);
    return items.sort((a, b) => a.precio - b.precio);
  }

  // Quita ofertas cerradas y respuestas de quien ya ha comerciado.
  cleanTrades() {
    this.trades = this.trades.filter((t) => t.status === 'abierta' && !this.player(t.from).tradedThisRound);
    for (const t of this.trades) t.counters = t.counters.filter((c) => !this.player(c.by).tradedThisRound);
  }

  dropTradesOf(id) {
    this.trades = this.trades.filter((t) => t.from !== id);
    for (const t of this.trades) t.counters = t.counters.filter((c) => c.by !== id);
  }

  view(forId) {
    const pub = (p) => {
      const h = p.hero;
      return {
        id: p.id,
        name: p.name,
        bot: p.bot,
        local: !!p.local,
        connected: p.connected,
        color: p.color,
        raza: p.raza,
        clase: p.clase,
        ready: p.ready,
        cursedThisRound: !!p.cursedThisRound,
        tradedThisRound: !!p.tradedThisRound,
        stoleThisRound: !!p.stoleThisRound,
        offeredThisRound: !!p.offeredThisRound,
        boughtThisRound: !!p.boughtThisRound,
        duelCurseAt: p.duelCurseAt ?? null,
        battleCursed: !!p.battleCursed,
        shop: p.id === forId ? p.shop || [] : undefined,
        stage: p.stage,
        offers: p.offers,
        monster: p.monster,
        rewards: p.rewards,
        combat: p.combat,
        hero: h && {
          base: h.base,
          vida: h.vida,
          fuerza: this.effFuerza(p),
          mana: h.base.mana,
          manaDisponible: this.availableMana(p),
          manaNext: p.hero.manaNext || 0,
          manaCombate: this.combatMana(p),
          dados: this.diceCount(p),
          fijables: C.fixedDiceForMana(this.combatMana(p)),
          inv: h.inv,
          curses: h.curses,
          pending: p.id === forId ? h.pending : h.pending.map(() => ({})),
          caidas: h.caidas,
          victorias: h.victorias,
          trofeos: h.trofeos || 0,
          vidaMax: this.maxVida(p),
          monedas: h.monedas,
          puntuacion: this.tourneyScore(p),
        },
      };
    };
    return {
      code: this.code,
      me: forId,
      host: this.hostId,
      phase: this.phase,
      lobbyStage: this.lobbyStage,
      round: this.round,
      rounds: C.ROUNDS,
      settings: this.settings,
      players: this.players.map(pub),
      trades: this.trades,
      pendingFinal: this.pendingFinal || null,
      tournament: this.tournament,
      winner: this.winner,
      log: this.log.slice(-80),
      version: this.version,
    };
  }
}

// ------------------------------------------------------------------ Acciones

function requirePrep(game) {
  if (game.phase !== 'prep') fail('Solo puedes hacer esto entre combates');
}

function requireNoPending(p) {
  if (p.hero.pending.length) fail('Primero decide qué hacer con el objeto pendiente');
}

function useConsumable(game, p, data) {
  const it = I.findItem(p.hero.inv, data.itemId);
  if (!it || (it.tipo !== 'pocion' && it.tipo !== 'pergamino')) fail('No tienes ese consumible');
  const inCombat = p.combat && p.combat.status === 'activo';
  if (inCombat) game.activeCombat(p);
  const myDuel = game.phase === 'torneo' && inCombat;
  if (it.efecto === 'mana') {
    if (!inCombat) {
      // Fuera de tu combate: el Maná se guarda para el próximo.
      if (game.phase !== 'prep' && game.phase !== 'torneo' && game.phase !== 'combat') fail('Ahora no puedes usarla');
      p.hero.manaNext = (p.hero.manaNext || 0) + it.valor;
      I.removeItem(p.hero.inv, it.id);
      game.say(`${p.name} usa ${it.nombre}: +${it.valor} de Maná en su próximo combate.`);
      return;
    }
    p.combat.manaBonus += it.valor;
    p.combat.events.push(`${it.nombre}: Maná ${game.combatMana(p)} en este combate`);
    I.removeItem(p.hero.inv, it.id);
    game.say(`${p.name} usa ${it.nombre}.`);
    game.applyWhites(p);
    game.afterCombatStep(p);
    return;
  }
  if (it.efecto === 'curacion') {
    if (!inCombat && game.phase !== 'prep' && game.phase !== 'combat') fail('Ahora no puedes curarte');
    if (game.phase === 'torneo' && !myDuel) fail('En el torneo solo puedes curarte en tu turno');
    if (p.hero.vida >= game.maxVida(p)) fail('Ya tienes la Vida al máximo');
    // Antes del Torneo y antes de la final todos recuperan la Vida: curarse ahí sería tirar la poción.
    if (game.phase === 'prep' && (game.round > C.ROUNDS || game.pendingFinal)) fail('Vas a recuperar toda la Vida antes de luchar: guarda la curación');
    const healed = game.heal(p, it.valor);
    I.removeItem(p.hero.inv, it.id);
    game.say(`💚 ${p.name} usa ${it.nombre} y recupera ${healed} de Vida.`);
    if (inCombat) p.combat.events.push(`💚 Recupera ${healed} de Vida`);
    return;
  }
  if (it.efecto === 'robo') {
    requirePrep(game);
    const target = game.player(data.targetId);
    if (target === p) fail('No puedes robarte a ti mismo');
    game.requireFinalFoe(p, target, 'robar');
    const stolen = I.findItem(target.hero.inv, data.targetItemId);
    if (!stolen) fail('Ese objeto ya no existe');
    I.removeItem(p.hero.inv, it.id);
    I.removeItem(target.hero.inv, stolen.id);
    game.dropTradesOf(target.id);
    game.say(`🦝 ${p.name} usa ${it.nombre} y roba ${stolen.nombre} a ${target.name}.`);
    game.receiveItem(p, stolen, 'robo');
    return;
  }
  fail('Efecto desconocido');
}

const ACTIONS = {
  // Lobby
  lobbyStage(p, { stage }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (p.id !== this.hostId) fail('Solo el anfitrión decide cuándo seguir');
    if (!['rivales', 'heroes'].includes(stage)) fail('Paso no válido');
    this.lobbyStage = stage;
  },
  lobbyReady(p, { value = true }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (value && (!p.raza || !p.clase)) fail('Elige Raza y Clase primero');
    p.ready = !!value;
    // Cuando todos están listos, la partida empieza sola.
    if (this.players.every((x) => x.ready && x.raza && x.clase)) this.startGame();
  },
  setHero(p, { raza, clase }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (!p.bot) p.ready = false;
    if (raza !== undefined) {
      if (!C.RACES[raza]) fail('Raza no válida');
      p.raza = raza;
    }
    if (clase !== undefined) {
      if (!C.CLASSES[clase]) fail('Clase no válida');
      p.clase = clase;
    }
  },
  setColor(p, { color }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (!C.COLORS.includes(color)) fail('Color no válido');
    const other = this.players.find((x) => x.color === color && x !== p);
    if (other) {
      other.color = p.color; // intercambio
    }
    p.color = color;
  },
  setName(p, { name }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    const n = String(name || '').trim().slice(0, 20);
    if (n) p.name = n;
  },
  setSettings(p, { pvpHits }) {
    if (this.phase !== 'lobby') fail('La partida ya ha empezado');
    if (p.id !== this.hostId) fail('Solo el anfitrión puede cambiar las opciones');
    if (pvpHits !== undefined) {
      if (![4, 5].includes(Number(pvpHits))) fail('Valor no válido');
      this.settings.pvpHits = Number(pvpHits);
    }
  },
  addBot(p) {
    if (p.id !== this.hostId) fail('Solo el anfitrión puede añadir bots');
    const names = ['Aldric', 'Brina', 'Corvus', 'Dalia', 'Edmund', 'Fiora'];
    const name = names.find((n) => !this.players.some((x) => x.name === n)) || 'Errante';
    this.addPlayer(name, { bot: true });
  },
  kick(p, { playerId }) {
    if (p.id !== this.hostId) fail('Solo el anfitrión puede expulsar');
    if (playerId === p.id) fail('No puedes expulsarte');
    this.removePlayer(playerId);
  },
  start(p) {
    if (p.id !== this.hostId) fail('Solo el anfitrión puede empezar');
    this.startGame();
  },

  // Entre combates
  ready(p, { value = true }) {
    requirePrep(this);
    if (value) requireNoPending(p);
    p.ready = !!value;
    this.checkPrepDone();
  },
  curse(p, { targetId, amount }) {
    requirePrep(this);
    if (this.round <= 1) fail('Todavía no ha habido combates');
    const t = this.player(targetId);
    if (t === p) fail('No puedes maldecirte a ti mismo');
    this.requireFinalFoe(p, t, 'lanzar un maleficio');
    if (t.cursedThisRound) fail(`${t.name} ya ha recibido un maleficio esta ronda`);
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < C.MANA_PER_CURSE || amt % C.MANA_PER_CURSE !== 0) {
      fail(`El Maná se usa en bloques de ${C.MANA_PER_CURSE}`);
    }
    if (amt > this.availableMana(p)) fail('No tienes tanto Maná disponible');
    const n = amt / C.MANA_PER_CURSE;
    p.hero.manaDebt += amt;
    t.hero.curses += n;
    t.cursedThisRound = true;
    this.say(`${p.name} gasta ${amt} de Maná y lanza un maleficio a ${t.name}: se le anulará(n) ${n} esfera(s) acertada(s).`);
  },
  // Tienda: una compra por ronda.
  buy(p, { itemId }) {
    requirePrep(this);
    if (p.boughtThisRound) fail('Ya has comprado esta ronda');
    const it = (p.shop || []).find((x) => x.id === itemId);
    if (!it) fail('Ese objeto ya no está a la venta');
    if (p.hero.monedas < it.precio) fail('No tienes monedas suficientes');
    p.hero.monedas -= it.precio;
    p.shop = p.shop.filter((x) => x !== it);
    p.boughtThisRound = true;
    const item = { ...it };
    delete item.precio;
    this.say(`🛒 ${p.name} compra ${item.nombre} por ${it.precio} monedas.`);
    this.receiveItem(p, item, 'compra');
  },
  // Robo sin pergamino: tirada de 1d6. 1-2 roba el objeto, 3-5 pierde su Maná
  // en el próximo combate, 6 no pasa nada. Un intento por ronda.
  stealRoll(p, { targetId, targetItemId }) {
    requirePrep(this);
    if (p.stoleThisRound) fail('Ya has intentado robar esta ronda');
    const t = this.player(targetId);
    if (t === p) fail('No puedes robarte a ti mismo');
    this.requireFinalFoe(p, t, 'robar');
    const it = I.findItem(t.hero.inv, targetItemId);
    if (!it) fail('Ese objeto ya no existe');
    p.stoleThisRound = true;
    const d = 1 + Math.floor(this.rng() * 6);
    if (d <= 2) {
      I.removeItem(t.hero.inv, it.id);
      this.dropTradesOf(t.id);
      this.say(`🦝 ${p.name} saca un ${d} y roba ${it.nombre} a ${t.name}.`);
      this.receiveItem(p, it, 'robo');
    } else if (d <= 5) {
      p.hero.manaDebt = 999;
      this.say(`🪤 ${p.name} saca un ${d} intentando robar a ${t.name}: le pillan y pierde su Maná en el próximo combate.`);
    } else {
      this.say(`🎲 ${p.name} saca un 6 intentando robar a ${t.name}: no pasa nada.`);
    }
  },
  discard(p, { itemId }) {
    if (this.phase !== 'prep' && this.phase !== 'combat') fail('Ahora no puedes descartar objetos');
    const it = I.removeItem(p.hero.inv, itemId);
    if (!it) fail('No tienes ese objeto');
    this.say(`${p.name} descarta ${it.nombre}.`);
  },
  undoReward(p) {
    const pend = p.hero.pending[0];
    if (!pend || !pend.fromReward || p.stage !== 'recompensa') fail('No hay nada que deshacer');
    p.hero.pending.shift();
  },
  resolvePending(p, { choice }) {
    const pend = p.hero.pending[0];
    if (!pend) fail('No hay nada pendiente');
    const finishReward = () => {
      if (pend.fromReward && p.stage === 'recompensa') {
        p.rewards = null;
        p.stage = 'hecho';
        this.checkRoundDone();
      }
    };
    if (!pend.options.some((o) => o.id === choice)) fail('Opción no válida');
    // Las opciones pudieron quedar obsoletas (comercio, robo...): recalcular.
    const conflicts = I.tryPlace(p.hero.inv, pend.item);
    p.hero.pending.shift();
    if (!conflicts) {
      this.say(`${p.name} guarda ${pend.item.nombre}.`);
      finishReward();
      return;
    }
    const opts = I.conflictOptions(p.hero.inv, pend.item, conflicts);
    if (!opts.some((o) => o.id === choice)) {
      p.hero.pending.unshift({ item: pend.item, options: opts });
      fail('La situación ha cambiado, vuelve a elegir');
    }
    const { discarded } = I.resolveConflict(p.hero.inv, pend.item, choice);
    this.say(`${p.name} se queda con ${choice === 'descartar' ? 'su equipo' : pend.item.nombre} y descarta ${discarded.map((d) => d.nombre).join(', ')}.`);
    finishReward();
  },
  useItem(p, data) {
    useConsumable(this, p, data);
  },
  // Comercio: publicas lo que ofreces; los demás responden con lo que te darían
  // a cambio y tú aceptas una respuesta o las rechazas. Una oferta por ronda.
  offerTrade(p, { give = [] }) {
    requirePrep(this);
    if (!give.length) fail('Elige qué ofreces');
    if (p.tradedThisRound) fail('Ya has comerciado esta ronda');
    if (p.offeredThisRound) fail('Ya has hecho tu oferta de esta ronda');
    for (const id of give) if (!I.findItem(p.hero.inv, id)) fail('No tienes ese objeto');
    const t = { id: this.nextId(), from: p.id, give: [...give], counters: [], status: 'abierta' };
    this.trades.push(t);
    p.offeredThisRound = true;
    const names = give.map((id) => I.findItem(p.hero.inv, id).nombre).join(', ');
    this.say(`🤝 ${p.name} ofrece ${names}. ¿Qué le das a cambio?`);
  },
  counterTrade(p, { tradeId, give = [] }) {
    requirePrep(this);
    const t = this.trades.find((x) => x.id === tradeId && x.status === 'abierta');
    if (!t) fail('Esa oferta ya no existe');
    if (t.from === p.id) fail('Es tu propia oferta');
    if (this.finalFoe(p) === t.from) fail('No puedes comerciar con tu rival de la final');
    if (p.tradedThisRound) fail('Ya has comerciado esta ronda');
    if (t.counters.some((c) => c.by === p.id)) fail('Ya has respondido a esta oferta');
    if (!give.length) fail('Elige qué ofreces a cambio');
    for (const id of give) if (!I.findItem(p.hero.inv, id)) fail('No tienes ese objeto');
    t.counters.push({ id: this.nextId(), by: p.id, give: [...give], status: 'pendiente' });
    this.say(`🤝 ${p.name} responde a la oferta de ${this.player(t.from).name}.`);
  },
  answerTrade(p, { tradeId, counterId, accept }) {
    requirePrep(this);
    const t = this.trades.find((x) => x.id === tradeId && x.status === 'abierta');
    if (!t) fail('Esa oferta ya no existe');
    if (t.from !== p.id) fail('Esa oferta no es tuya');
    const c = t.counters.find((x) => x.id === counterId && x.status === 'pendiente');
    if (!c) fail('Esa respuesta ya no existe');
    const other = this.player(c.by);
    if (!accept) {
      c.status = 'rechazada';
      this.say(`${p.name} rechaza lo que le ofrece ${other.name}.`);
      return;
    }
    if (other.tradedThisRound) fail(`${other.name} ya ha comerciado esta ronda`);
    requireNoPending(p);
    requireNoPending(other);
    const mine = t.give.map((id) => I.findItem(p.hero.inv, id));
    const theirs = c.give.map((id) => I.findItem(other.hero.inv, id));
    if (mine.some((x) => !x) || theirs.some((x) => !x)) {
      c.status = 'rechazada';
      fail('Algún objeto ya no está disponible');
    }
    for (const it of mine) I.removeItem(p.hero.inv, it.id);
    for (const it of theirs) I.removeItem(other.hero.inv, it.id);
    t.status = 'cerrada';
    p.tradedThisRound = true;
    other.tradedThisRound = true;
    this.say(`🤝 ${p.name} y ${other.name} cierran un intercambio.`);
    for (const it of theirs) this.receiveItem(p, it, 'comercio');
    for (const it of mine) this.receiveItem(other, it, 'comercio');
    this.cleanTrades();
  },
  withdrawTrade(p, { tradeId }) {
    const t = this.trades.find((x) => x.id === tradeId && x.status === 'abierta');
    if (!t || t.from !== p.id) fail('Esa oferta no es tuya');
    t.status = 'cerrada';
    this.say(`${p.name} retira su oferta.`);
    this.cleanTrades();
  },

  // Combate contra monstruos
  present(p, { index }) {
    this.present(p, index);
  },
  roll(p, { hold, aim }) {
    this.roll(p, hold, aim);
  },
  mana(p, { assign }) {
    this.useMana(p, assign);
  },
  concede(p) {
    const cb = this.activeCombat(p);
    if (cb.rolls < 1) fail('Primero haz la primera tirada');
    if (cb.kind === 'monstruo' && cb.rolls < cb.maxRolls) fail('Aún te quedan tiradas');
    this.endCombat(p, false);
  },
  chooseReward(p, { index }) {
    if (p.stage !== 'recompensa') fail('No hay recompensa que elegir');
    if (p.hero.pending.length) fail('Primero decide qué hacer con el objeto pendiente');
    const it = p.rewards[Number(index)];
    if (!it) fail('Recompensa no válida');
    this.receiveItem(p, it, 'recompensa');
    if (p.coinsPending) {
      const c = p.coinsPending;
      p.coinsPending = null;
      p.hero.monedas += c.n;
      this.say(`💰 ${p.name} gana ${c.n} monedas.`);
    }
    // Si no cabe, la elección queda abierta: se puede deshacer y escoger la otra.
    if (p.hero.pending.length) {
      p.hero.pending[p.hero.pending.length - 1].fromReward = true;
      return;
    }
    p.rewards = null;
    p.stage = 'hecho';
    this.checkRoundDone();
  },

  // Torneo
  // En semifinales y final, cada jugador puede lanzar un maleficio a su rival
  // una vez por cada ataque de este: durante su propio turno (afecta al
  // siguiente ataque del rival) o mientras el rival ataca (le afecta ya si aún
  // no ha tirado). El Maná gastado no estará en su propio ataque.
  duelCurse(p, { amount, targetId }) {
    const t = this.tournament;
    if (this.phase !== 'torneo' || !t || t.stage !== 'batalla') fail('Solo en la Batalla final');
    if (!t.alive.includes(p.id)) fail('Ya has caído');
    if (p.battleCursed) fail('Ya has lanzado un maleficio esta ronda');
    const rival = this.player(targetId);
    if (rival === p || !t.alive.includes(rival.id)) fail('Elige a un rival en pie');
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt < C.MANA_PER_CURSE || amt % C.MANA_PER_CURSE !== 0) fail(`El Maná se usa en bloques de ${C.MANA_PER_CURSE}`);
    if (amt > this.availableMana(p)) fail('No tienes tanto Maná disponible');
    const n = amt / C.MANA_PER_CURSE;
    p.hero.manaDebt += amt;
    p.hero.debtNext = (p.hero.debtNext || 0) + amt;
    p.battleCursed = true;
    if (rival.combat && rival.combat.status === 'activo' && rival.combat.rolls === 0) rival.combat.cursesLeft += n;
    else rival.hero.curses += n;
    this.say(`${p.name} gasta ${amt} de Maná y lanza un maleficio a ${rival.name}: se le anulará(n) ${n} esfera(s) acertada(s).`);
  },
  strike(p, { targetId }) {
    this.strike(p, targetId);
  },
  takeLoot(p, { itemId }) {
    this.takeLoot(p, itemId);
  },
  chooseRival(p, { rivalId }) {
    this.chooseRival(p, rivalId);
  },
};

module.exports = { Game, GameError, baseStats, COLOR_LABEL };
