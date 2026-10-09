'use strict';

const I = require('./items');

const C = require('./config');
const D = require('./dice');

// Cuánto mejora realmente un objeto al héroe: esferas y comodines que gana.
// La Fuerza deja de servir al llegar a 5 esferas; el Maná sigue sumando comodines.
function slotGain(h, it, clase) {
  const inv = h.inv;
  const b = (x) => I.effBonus(x, clase);
  if (['yelmo', 'armadura', 'botas', 'tunica'].includes(it.slot)) return b(it) - (inv[it.slot] ? b(inv[it.slot]) : 0);
  const hands = inv.manos;
  const sum = hands.reduce((s2, x) => s2 + b(x), 0);
  if (it.slot === 'dosManos') return b(it) - sum;
  if (hands.length < 2 && !(hands[0] && hands[0].slot === 'dosManos')) return b(it);
  if (hands[0] && hands[0].slot === 'dosManos') return b(it) - b(hands[0]);
  const shield = hands.find((x) => x.slot === 'escudo');
  if (it.slot === 'escudo' && shield) return b(it) - b(shield);
  return b(it) - Math.min(...hands.map(b));
}
function gainOf(game, p, it) {
  const h = p.hero;
  if (it.tipo !== 'equipo') {
    if (it.efecto === 'curacion') return h.vida < h.base.vida ? 1.5 : 0.8;
    if (it.efecto === 'mana') return 1;
    return 0.3;
  }
  const g = slotGain(h, it, p.clase);
  if (g <= 0) return 0;
  const f = game.effFuerza(p);
  const m = game.availableMana(p) + h.manaDebt;
  if (it.slot === 'tunica') {
    const dw = C.fixedDiceForMana(m + g) - C.fixedDiceForMana(m);
    return dw * 4 + g * 0.3;
  }
  const dd = C.rollsForFuerza(f + g) - C.rollsForFuerza(f);
  const db = C.fuerzaDamageBonus(f + g) - C.fuerzaDamageBonus(f);
  return dd * 4 + db * 2 + 0.4 * g;
}

// Lo que vale un objeto para el bot: lo que pierde al darlo o lo que gana al recibirlo.
function worth(game, p, it, owned) {
  if (!it) return 0;
  if (it.tipo !== 'equipo') {
    if (it.efecto === 'curacion') return p.hero.base.vida - p.hero.vida >= 3 ? 3 : 1.5;
    return it.efecto === 'robo' ? 2.5 : 2;
  }
  return owned ? I.effBonus(it, p.clase) : Math.max(0, slotGain(p.hero, it, p.clase));
}
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// Jugador automático muy sencillo. Hace como mucho una acción por llamada
// y devuelve true si ha actuado.
function botStep(game, p) {
  if (!p.hero || game.phase === 'lobby' || game.phase === 'fin') return false;
  const h = p.hero;

  if (h.pending.length) {
    const pend = h.pending[0];
    let choice = 'descartar';
    if (pend.item.tipo === 'equipo') {
      const others = pend.options.filter((o) => o.id !== 'descartar');
      const items = h.inv.manos.concat([h.inv.yelmo, h.inv.armadura, h.inv.tunica, h.inv.botas]).filter(Boolean);
      let best = null;
      for (const o of others) {
        const lost = o.id === 'todas' ? h.inv.manos.reduce((s, it) => s + it.bonus, 0) : (items.find((it) => it.id === o.id) || {}).bonus;
        if (lost !== undefined && lost < pend.item.bonus && (!best || lost < best.lost)) best = { id: o.id, lost };
      }
      if (best) choice = best.id;
    }
    game.act(p.id, 'resolvePending', { choice });
    return true;
  }

  if (game.phase === 'prep') {
    // Comercio: responde a ofertas ajenas dando su objeto menos valioso si sale ganando.
    p.botSeen = p.botSeen || new Set();
    const offer = !p.tradedThisRound && game.trades.find((t) => t.status === 'abierta' && t.from !== p.id && t.from !== game.finalFoe(p) && !p.botSeen.has(t.id));
    if (offer) {
      p.botSeen.add(offer.id);
      const owner = game.player(offer.from);
      const gain = sum(offer.give.map((id) => worth(game, p, I.findItem(owner.hero.inv, id), false)));
      const mine = I.allItems(h.inv).sort((a, b) => worth(game, p, a, true) - worth(game, p, b, true))[0];
      if (mine && worth(game, p, mine, true) < gain) {
        game.act(p.id, 'counterTrade', { tradeId: offer.id, give: [mine.id] });
        return true;
      }
    }
    // Sus propias ofertas: acepta la mejor respuesta si sale ganando; si no, la rechaza.
    const own = game.trades.find((t) => t.status === 'abierta' && t.from === p.id && t.counters.some((c) => c.status === 'pendiente'));
    if (own) {
      const cost = sum(own.give.map((id) => worth(game, p, I.findItem(h.inv, id), true)));
      const scored = own.counters.filter((c) => c.status === 'pendiente').map((c) => {
        const other = game.player(c.by);
        return { c, v: sum(c.give.map((id) => worth(game, p, I.findItem(other.hero.inv, id), false))) };
      }).sort((a, b) => b.v - a.v);
      const best = scored[0];
      try {
        game.act(p.id, 'answerTrade', { tradeId: own.id, counterId: best.c.id, accept: best.v > cost });
      } catch (e) {
        best.c.status = 'rechazada';
      }
      return true;
    }
    // A veces ofrece lo que menos le sirve.
    if (!p._triedTrade && !p.offeredThisRound && !p.tradedThisRound && game.round <= C.ROUNDS) {
      p._triedTrade = true;
      const spare = I.allItems(h.inv).sort((a, b) => worth(game, p, a, true) - worth(game, p, b, true))[0];
      if (spare && worth(game, p, spare, true) <= 2 && game.rng() < 0.1) {
        game.act(p.id, 'offerTrade', { give: [spare.id] });
        return true;
      }
    }
    // Robo: con Pergamino de Robo, siempre que haya algo que valga la pena; sin él, a veces.
    if (!p._triedSteal && !p.stoleThisRound && game.round >= 2 && game.round <= C.ROUNDS) {
      p._triedSteal = true;
      let best = null;
      for (const t of game.players) {
        if (t === p) continue;
        for (const it of I.allItems(t.hero.inv)) {
          const g = worth(game, p, it, false);
          if (!best || g > best.g) best = { t, it, g };
        }
      }
      const scroll = h.inv.pergaminos.find((it) => it.efecto === 'robo');
      try {
        if (best && scroll && best.g >= 1) {
          game.act(p.id, 'useItem', { itemId: scroll.id, targetId: best.t.id, targetItemId: best.it.id });
          return true;
        }
        if (best && best.g >= 2 && game.rng() < 0.1) {
          game.act(p.id, 'stealRoll', { targetId: best.t.id, targetItemId: best.it.id });
          return true;
        }
      } catch (e) { /* objetivo no válido: lo intenta otra ronda */ }
    }
    // Tienda: compra la mejora de equipo que más le aporte (una por ronda).
    if (!p.boughtThisRound && p.shop && p.shop.length) {
      const pickIt = p.shop.filter((it) => it.precio <= h.monedas && gainOf(game, p, it) >= 1)
        .sort((a2, b2) => gainOf(game, p, b2) / b2.precio - gainOf(game, p, a2) / a2.precio)[0];
      if (pickIt) {
        game.act(p.id, 'buy', { itemId: pickIt.id });
        return true;
      }
    }
    const heal0 = [...h.inv.pociones, ...h.inv.pergaminos].filter((it) => it.efecto === 'curacion').sort((a, b) => a.valor - b.valor)[0];
    if (heal0 && (h.base.vida - h.vida >= heal0.valor || h.vida <= 4)) {
      const heal = heal0;
      if (heal) {
        game.act(p.id, 'useItem', { itemId: heal.id });
        return true;
      }
    }
    // A partir de la ronda 5, a veces lanza un maleficio al rival más fuerte.
    if (!p.ready && !p._triedCurse && game.round >= 3 && game.round <= C.ROUNDS && game.availableMana(p) >= C.MANA_PER_CURSE) {
      p._triedCurse = true;
      if (game.rng() < 0.35) {
        // Prefiere a los jugadores humanos que van mejor.
        const targets = game.players.filter((x) => x !== p && !x.cursedThisRound)
          .sort((x, y) => (y.bot ? 0 : 5) - (x.bot ? 0 : 5) + game.tourneyScore(y) - game.tourneyScore(x));
        if (targets.length) {
          game.act(p.id, 'curse', { targetId: targets[0].id, amount: C.MANA_PER_CURSE });
          return true;
        }
      }
    }
    // Espera un poco a que respondan a su oferta antes de darse por listo.
    if (!p.ready && game.trades.some((t) => t.status === 'abierta' && t.from === p.id) && (p._waitTrade = (p._waitTrade || 0) + 1) <= 4) return false;
    if (!p.ready) {
      p._waitTrade = 0;
      p._triedCurse = false;
      p._triedTrade = false;
      p._triedSteal = false;
      game.act(p.id, 'ready', { value: true });
      return true;
    }
    return false;
  }

  if (game.phase === 'combat') {
    if (p.stage === 'combate') return fight(game, p);
    if (p.stage === 'recompensa') {
      let idx = 0;
      p.rewards.forEach((r, i) => { if (gainOf(game, p, r) > gainOf(game, p, p.rewards[idx])) idx = i; });
      game.act(p.id, 'chooseReward', { index: idx });
      return true;
    }
    return false;
  }

  if (game.phase === 'torneo' && game.tournament.stage === 'batalla') return battle(game, p);
  if (game.phase === 'torneo') {
    const t = game.tournament;
    if (t.stage === 'eleccion' && t.ranking[0] === p.id) {
      const rivals = t.ranking.slice(1).map((id) => game.player(id));
      rivals.sort((a, b) => game.tourneyScore(a) - game.tourneyScore(b));
      game.act(p.id, 'chooseRival', { rivalId: rivals[0].id });
      return true;
    }
    if (t.stage === 'botin' && t.loot && t.loot.winner === p.id) {
      const loser = game.player(t.loot.loser);
      const val = (it) => it.bonus || it.valor || 1;
      const best = I.allItems(loser.hero.inv).sort((a, b) => val(b) - val(a))[0];
      game.act(p.id, 'takeLoot', { itemId: best.id });
      return true;
    }
    const m0 = game.matchOf(p);
    if (m0 && m0.attacker !== p.id && p.duelCurseAt !== m0.turns && p.duelCurseAt !== m0.turns - 1
      && game.availableMana(p) >= C.MANA_PER_CURSE + 5 && game.rng() < 0.5) {
      try { game.act(p.id, 'duelCurse', { amount: C.MANA_PER_CURSE }); return true; } catch (e) { p.duelCurseAt = m0.turns; }
    }
    const m = game.matchOf(p);
    if (m && m.attacker === p.id && p.combat && p.combat.status === 'activo') return fight(game, p);
  }
  return false;
}

// Batalla final: elige víctima (el más débil al que puede hacer daño), guarda
// las esferas de su color y del propio (escudo) y relanza el resto.
function battle(game, p) {
  const t = game.tournament;
  if (!t.alive.includes(p.id)) return false;
  const cb = p.combat;
  const rivals = t.alive.filter((id) => id !== p.id).map((id) => game.player(id));
  if (!cb || cb.status !== 'activo' || !rivals.length) return false;
  // A veces maldice al rival más peligroso antes de tirar.
  if (cb.rolls === 0 && !p.battleCursed && game.availableMana(p) >= C.MANA_PER_CURSE + 5 && game.rng() < 0.4) {
    const target = [...rivals].sort((a, b) => b.hero.vida - a.hero.vida)[0];
    try { game.act(p.id, 'duelCurse', { amount: C.MANA_PER_CURSE, targetId: target.id }); return true; } catch (e) { p.battleCursed = true; }
  }
  const heal = cb.rolls === 0 && [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'curacion' && game.maxVida(p) - p.hero.vida >= it.valor);
  if (heal) {
    try { game.act(p.id, 'useItem', { itemId: heal.id }); return true; } catch (e) { /* sigue */ }
  }
  if (cb.rolls === 0) {
    game.act(p.id, 'roll', {});
    return true;
  }
  const faces = cb.dice.map((d) => d.face);
  const count = (c) => faces.filter((f) => f === c || f === 'multicolor').length;
  // Víctima: más daño posible; a igualdad, la de menos Vida.
  const victim = [...rivals].sort((a, b) => count(b.color) - count(a.color) || a.hero.vida - b.hero.vida)[0];
  const n = count(victim.color);
  if (n >= 5 || cb.rolls >= cb.maxRolls) {
    game.act(p.id, 'strike', { targetId: victim.id });
    return true;
  }
  const hold = cb.dice.map((d, i) => i).filter((i) => cb.dice[i].fixed || faces[i] === victim.color || faces[i] === 'multicolor' || (faces[i] === p.color && game.rng() < 0.5));
  const free = cb.dice.map((d, i) => i).filter((i) => !hold.includes(i));
  if (!free.length) {
    game.act(p.id, 'strike', { targetId: victim.id });
    return true;
  }
  game.act(p.id, 'roll', { hold });
  return true;
}

// Probabilidad (simulada) de completar un objetivo con las tiradas que quedan,
// conservando las esferas útiles y relanzando el resto.
function chance(cb, t, rollsLeft, trials = 160) {
  const wild = D.WILD[t.tipo];
  const key = t.tipo === 'forma' ? 'shape' : 'face';
  const roll = () => (t.tipo === 'forma' ? D.rollShape(Math.random) : D.rollFace(Math.random));
  let ok = 0;
  for (let k = 0; k < trials; k++) {
    let vals = cb.dice.map((d) => d[key]);
    const fixed = cb.dice.map((d) => d.fixed);
    for (let r = 0; r < rollsLeft; r++) {
      const { used, missing } = D.matchDice(vals, t.combo, wild);
      if (missing === 0) break;
      vals = vals.map((v, i) => (fixed[i] || used.has(i) ? v : roll()));
    }
    if (D.matchDice(vals, t.combo, wild).missing === 0) ok++;
  }
  return ok / trials;
}

function fight(game, p) {
  const cb = p.combat;
  let used;
  let missing;
  if (cb.kind === 'monstruo') {
    const value = (m) => [3, 6, 10, 15, 24][m.tier ?? 2];
    if (cb.rolls === 0) {
      game.act(p.id, 'roll', {});
      return true;
    }
    const st = game.targetStatus(cb);
    const left = cb.maxRolls - cb.rolls;
    const ok = st.map((x, i) => i).filter((i) => st[i].ok).sort((a, b) => value(p.offers[b]) - value(p.offers[a]));
    // Persigue el objetivo con mejor esperanza: probabilidad × valor.
    let best = -1;
    let bestScore = -1;
    if (left > 0) st.forEach((x, i) => {
      const sc = chance(cb, cb.targets[i], left) * value(p.offers[i]);
      if (sc > bestScore) { bestScore = sc; best = i; }
    });
    const cur = ok.length ? value(p.offers[ok[0]]) : 0;
    if (ok.length && (best < 0 || bestScore <= cur * 1.15 || st[best].ok)) {
      game.act(p.id, 'present', { index: ok[0] });
      return true;
    }
    if (best < 0) best = st.reduce((bi, x, i) => (x.missing < st[bi].missing ? i : bi), 0);
    ({ used, missing } = st[best]);
  } else {
    if (cb.rolls === 0) {
      game.act(p.id, 'roll', {});
      return true;
    }
    ({ used, missing } = D.matchDice(cb.dice.map((d) => d.face), cb.combo));
  }
  // Poción de Maná si con ella se completan las esferas que faltan
  if (missing > 0) {
    const pot = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'mana');
    if (pot && C.fixedDiceForMana(game.combatMana(p) + pot.valor) - game.fixableDice(p) >= missing) {
      game.act(p.id, 'useItem', { itemId: pot.id });
      return true;
    }
  }
  if (cb.rolls < cb.maxRolls && cb.dice.some((d) => !d.fixed)) {
    const hold = cb.dice.map((d, i) => i).filter((i) => used.has(i) || cb.dice[i].fixed);
    const free = cb.dice.map((d, i) => i).filter((i) => !cb.dice[i].fixed && !hold.includes(i));
    if (!free.length) hold.splice(hold.indexOf(cb.dice.findIndex((d) => !d.fixed)), 1);
    game.act(p.id, 'roll', { hold });
    return true;
  }
  game.act(p.id, 'concede', {});
  return true;
}

module.exports = { botStep };
