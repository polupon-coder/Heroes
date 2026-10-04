'use strict';

const C = require('./config');
const D = require('./dice');

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
    const offer = game.trades.find((t) => t.to === p.id);
    if (offer) {
      game.act(p.id, 'respondTrade', { tradeId: offer.id, accept: false });
      return true;
    }
    if (h.vida <= h.base.vida / 2) {
      const heal = [...h.inv.pociones, ...h.inv.pergaminos].find((it) => it.efecto === 'curacion');
      if (heal) {
        game.act(p.id, 'useItem', { itemId: heal.id });
        return true;
      }
    }
    // A partir de la ronda 5, a veces lanza un maleficio al rival más fuerte.
    if (!p.ready && !p._triedCurse && game.round >= 5 && game.round <= C.ROUNDS && game.availableMana(p) >= C.MANA_PER_CURSE) {
      p._triedCurse = true;
      if (game.rng() < 0.45) {
        const targets = game.players.filter((x) => x !== p && !x.cursedThisRound)
          .sort((x, y) => game.tourneyScore(y) - game.tourneyScore(x));
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
    if (p.stage === 'elegir') {
      // Valora cada monstruo: probabilidad de ganar × calidad de la recompensa,
      // menos el riesgo de perder Vida (mucho más si podría tumbarle).
      const dice = game.diceCount(p);
      const fix = C.fixedDiceForMana(game.availableMana(p));
      if (!p.offers.some((m) => m.combo.length <= dice)) {
        game.act(p.id, 'skipRound', {});
        return true;
      }
      let best = 0;
      let bestScore = -Infinity;
      p.offers.forEach((m, i) => {
        if (m.combo.length > dice) return;
        const pWin = winChance(dice, fix, m.combo, game.rng);
        const reward = C.equipmentBonus(Math.min(12, m.level + C.VARIANTS[m.variante].recompensa));
        const ko = h.vida <= m.dano ? 6 : 1;
        const score = pWin * reward - (1 - pWin) * m.dano * 0.5 * ko;
        if (score > bestScore) { bestScore = score; best = i; }
      });
      game.act(p.id, 'chooseMonster', { index: best });
      return true;
    }
    if (p.stage === 'combate') return fight(game, p);
    if (p.stage === 'recompensa') {
      let idx = 0;
      p.rewards.forEach((r, i) => {
        if (r.tipo === 'equipo' && (p.rewards[idx].tipo !== 'equipo' || r.bonus > p.rewards[idx].bonus)) idx = i;
      });
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
    const m = game.matchOf(p);
    if (m && m.attacker === p.id && p.combat && p.combat.status === 'activo') return fight(game, p);
  }
  return false;
}

// Estimación rápida por simulación de la probabilidad de ganar un combate.
function winChance(dice, fix, combo, rng, trials = 120) {
  if (combo.length > dice) return 0;
  let wins = 0;
  for (let t = 0; t < trials; t++) {
    let faces = Array.from({ length: dice }, () => D.rollFace(rng));
    for (let r = 1; r < C.MAX_ROLLS && !D.isSatisfied(faces, combo); r++) {
      const { used } = D.matchDice(faces, combo);
      faces = faces.map((f, i) => (used.has(i) ? f : D.rollFace(rng)));
    }
    if (D.isSatisfied(faces, combo) || D.matchDice(faces, combo).missing <= fix) wins++;
  }
  return wins / trials;
}

function fight(game, p) {
  const cb = p.combat;
  if (cb.rolls === 0) {
    game.act(p.id, 'roll', {});
    return true;
  }
  const faces = cb.dice.map((d) => d.face);
  const { used, missing } = D.matchDice(faces, cb.combo);
  // Poción de Maná si con ella se completan las esferas que faltan
  if (missing > 0) {
    const pot = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'mana');
    if (pot && C.fixedDiceForMana(game.combatMana(p) + pot.valor) - game.fixableDice(p) >= missing) {
      game.act(p.id, 'useItem', { itemId: pot.id });
      return true;
    }
  }
  if (cb.rolls < C.MAX_ROLLS && cb.dice.some((d) => !d.fixed)) {
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
