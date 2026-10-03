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
      const items = h.inv.manos.concat([h.inv.yelmo, h.inv.armadura, h.inv.botas]).filter(Boolean);
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
    if (!p.ready) {
      game.act(p.id, 'ready', { value: true });
      return true;
    }
    return false;
  }

  if (game.phase === 'combat') {
    if (p.stage === 'elegir') {
      const dice = game.diceCount(p);
      const doable = p.offers.map((m, i) => ({ m, i })).filter((x) => x.m.combo.length <= dice);
      const pick = doable.length ? doable[doable.length - 1].i : 0;
      game.act(p.id, 'chooseMonster', { index: pick });
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

function fight(game, p) {
  const cb = p.combat;
  if (cb.rolls === 0) {
    game.act(p.id, 'roll', {});
    return true;
  }
  const faces = cb.dice.map((d) => d.face);
  const { used } = D.matchDice(faces, cb.combo);
  const missing = D.missingColors(faces, cb.combo);
  const free = cb.dice.map((d, i) => i).filter((i) => !used.has(i) && !cb.dice[i].fixed);

  if (!cb.manaUsed) {
    let k = game.fixableDice(p);
    if (missing.length > k) {
      const pot = [...p.hero.inv.pociones, ...p.hero.inv.pergaminos].find((it) => it.efecto === 'mana');
      if (pot && C.fixedDiceForMana(game.combatMana(p) + pot.valor) >= missing.length && cb.rolls === C.MAX_ROLLS) {
        game.act(p.id, 'useItem', { itemId: pot.id });
        return true;
      }
    }
    k = game.fixableDice(p);
    if (k > 0 && missing.length <= k && missing.length <= free.length) {
      const assign = missing.map((face, j) => ({ index: free[j], face }));
      game.act(p.id, 'mana', { assign });
      return true;
    }
  }
  if (cb.rolls < C.MAX_ROLLS) {
    const hold = cb.dice.map((d, i) => i).filter((i) => used.has(i) || cb.dice[i].fixed);
    if (hold.length === cb.dice.length) hold.pop();
    game.act(p.id, 'roll', { hold });
    return true;
  }
  game.act(p.id, 'concede', {});
  return true;
}

module.exports = { botStep };
