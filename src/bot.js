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
  const dd = C.diceForFuerza(f + g) - C.diceForFuerza(f);
  return dd * 4 + (C.diceForFuerza(f) >= 5 ? 0.05 : 0.4) * g;
}

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
      const val = (it) => (it ? it.bonus || it.valor || 1 : 0);
      const gain = offer.give.reduce((s, id) => s + val(I.findItem(owner.hero.inv, id)), 0);
      const mine = [...I.equippedItems(h.inv), ...h.inv.pociones, ...h.inv.pergaminos].sort((a, b) => val(a) - val(b))[0];
      if (mine && val(mine) < gain) {
        game.act(p.id, 'counterTrade', { tradeId: offer.id, give: [mine.id] });
        return true;
      }
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
    if (heal0 && game.round <= C.ROUNDS && !game.pendingFinal && (h.base.vida - h.vida >= heal0.valor || h.vida <= 4)) {
      const heal = heal0;
      if (heal) {
        game.act(p.id, 'useItem', { itemId: heal.id });
        return true;
      }
    }
    // A partir de la ronda 5, a veces lanza un maleficio al rival más fuerte.
    if (!p.ready && !p._triedCurse && game.round >= 3 && game.round <= C.ROUNDS && game.availableMana(p) >= C.MANA_PER_CURSE) {
      p._triedCurse = true;
      if (game.rng() < 0.7) {
        // Prefiere a los jugadores humanos que van mejor.
        const targets = game.players.filter((x) => x !== p && !x.cursedThisRound)
          .sort((x, y) => (y.bot ? 0 : 5) - (x.bot ? 0 : 5) + game.tourneyScore(y) - game.tourneyScore(x));
        if (targets.length) {
          game.act(p.id, 'curse', { targetId: targets[0].id, amount: C.MANA_PER_CURSE });
          return true;
        }
      }
    }
    if (!p.ready) {
      p._triedCurse = false;
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

// Probabilidad (simulada) de completar un objetivo con las tiradas que quedan,
// conservando las esferas útiles y relanzando el resto.
function chance(cb, t, rollsLeft, trials = 160) {
  const wild = D.WILD[t.tipo];
  const key = t.tipo === 'forma' ? 'shape' : 'face';
  const roll = () => (t.tipo === 'forma' ? C.SHAPES : C.FACES)[Math.floor(Math.random() * (t.tipo === 'forma' ? C.SHAPES.length : C.FACES.length))];
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
