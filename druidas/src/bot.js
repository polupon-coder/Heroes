'use strict';

// Bots sencillos: estudian la receta que mejor encaja con lo que tienen y lo que hay en El Claro,
// usan su magia para avanzar y atacan al líder cuando les sale a cuenta.

const C = require('./config');
const { pendingOf, total } = require('./game');

const VALOR = { idea: 1, cambio: 1.5, memoria: 1.5, pensar: 1.5, suerte: 1, robo: 1, lio: 1, sueno: 0.5 };

function act(g, p, type, data) {
  g.act(p.id, type, data);
  return true;
}

// Receta que conviene estudiar ahora.
function planCard(g, p) {
  const left = C.RONDAS - g.round + 1;
  let best = null;
  for (const [id, card] of Object.entries(C.CARTAS)) {
    if (p.aprendidas.includes(id) || !(g.catalog[id] > 0)) continue;
    let missing = 0;
    let inClaro = 0;
    const claro = g.claro.filter(Boolean);
    for (const t of C.ING) {
      const m = Math.max(0, (card.req[t] || 0) - p.reserva[t]);
      missing += m;
      inClaro += Math.min(m, claro.filter((c) => c === t).length);
    }
    const score = card.puntos * 2 + (left > 3 ? VALOR[id] : 0) - missing * 1.5 + inClaro * 0.5 + g.rng() * 0.3;
    if (!best || score > best.score) best = { id, score };
  }
  return best && best.id;
}

// Cuántos ingredientes de cada tipo le vendría bien tener.
function wants(g, p) {
  const w = { eter: 0, umbra: 0, lumen: 0, raiz: 0 };
  const plan = p.estudio ? pendingOf(p.estudio) : (() => {
    const id = planCard(g, p);
    return id ? { ...C.CARTAS[id].req } : {};
  })();
  for (const t of C.ING) w[t] = Math.max(0, (plan[t] || 0) - p.reserva[t]) * 3;
  for (const id of p.aprendidas) {
    const card = C.CARTAS[id];
    if (card.tipo === 'pocion' && !p.pociones.includes(id) && p.pociones.length < C.MAX_POCIONES) {
      for (const t of C.ING) if (card.coste[t] && p.reserva[t] < card.coste[t]) w[t] += 1.5;
    } else if (card.tipo === 'hechizo') {
      for (const t of C.ING) if (card.coste[t] && p.reserva[t] < 1) w[t] += 0.8;
    }
  }
  if (p.reserva.lumen < 2) w.lumen += 0.6;
  return w;
}

function pickSlots(g, p, n) {
  const w = wants(g, p);
  const taken = { eter: 0, umbra: 0, lumen: 0, raiz: 0 };
  const slots = g.claro.map((c, i) => ({ c, i })).filter((x) => x.c);
  const out = [];
  while (out.length < Math.min(n, slots.length)) {
    let best = null;
    for (const s of slots) {
      if (out.includes(s.i)) continue;
      const v = w[s.c] - taken[s.c] * 1.2 + g.rng() * 0.2;
      if (!best || v > best.v) best = { i: s.i, v };
    }
    out.push(best.i);
    taken[g.claro[best.i]] += 1;
  }
  return out;
}

// Ingredientes de la reserva que encajan en la receta (en orden).
function placeable(p, reserva = p.reserva) {
  if (!p.estudio) return [];
  const pend = pendingOf(p.estudio);
  const out = [];
  for (const t of C.ING) for (let k = 0; k < Math.min(pend[t], reserva[t]); k += 1) out.push(t);
  return out;
}

// Tipo de la reserva que menos falta hace (para cambiarlo o devolverlo).
function spare(g, p) {
  const w = wants(g, p);
  let best = null;
  for (const t of C.ING) {
    if (!(p.reserva[t] > 0)) continue;
    const v = w[t] - p.reserva[t] * 0.5;
    if (!best || v < best.v) best = { t, v };
  }
  return best && best.t;
}

function ownStudy(g, p) {
  const t = g.turn;
  if (p.estudio && !t.tocado && t.estudiadas === 0 && g.round >= C.RONDAS - 1) {
    // Al final, abandonar una receta que ya no da tiempo a terminar.
    const pend = total(pendingOf(p.estudio));
    if (pend - placeable(p).length > 2 * (C.RONDAS - g.round)) return act(g, p, 'abandonar');
  }
  if (!p.estudio && !t.completada) {
    const id = planCard(g, p);
    if (id) return act(g, p, 'elegir', { carta: id });
  }
  if (p.estudio) {
    const pend = pendingOf(p.estudio);
    // Chispa: cambiar algo que sobra por algo que falta.
    if (!t.chispa) {
      const slot = g.claro.findIndex((c) => c && pend[c] > p.reserva[c]);
      const s = spare(g, p);
      if (slot >= 0 && s && !(pend[s] > 0)) return act(g, p, 'magia', { carta: 'chispa', tipo: s, slot });
    }
    const free = g.magicFree(p);
    const lim = g.studyLimit(p);
    if (free && !t.idea && t.estudiadas === 0 && !t.lechuza && lim === C.ESTUDIO_NORMAL && p.aprendidas.includes('idea') && p.reserva.lumen >= 1) {
      const res = { ...p.reserva, lumen: p.reserva.lumen - 1 };
      if (placeable(p, res).length >= 3) return act(g, p, 'magia', { carta: 'idea' });
    }
    if (!t.lechuza && t.estudiadas < lim) {
      const can = placeable(p);
      if (can.length) return act(g, p, 'colocar', { tipo: can[0] });
      // Liebre: transformar lo que sobra en lo que falta.
      if (p.mascota === 'liebre' && p.usos > 0 && (g.round > 3 || total(pend) <= 2)) {
        const need = C.ING.find((x) => pend[x] > 0);
        const s = spare(g, p);
        if (need && s) return act(g, p, 'colocar', { tipo: s, como: need });
      }
    }
    // Lechuza: guardarla para terminar una receta o para el final.
    if (!t.lechuza && p.mascota === 'lechuza' && p.usos > 0) {
      const can = placeable(p);
      if (can.length && (total(pend) === 1 || g.round >= C.RONDAS - 1)) return act(g, p, 'lechuza', { tipo: can[0] });
    }
    if (p.mascota === 'cervatillo' && p.usos > 0 && p.cervTurno === g.turnIndex) {
      const can = placeable(p);
      if (can.length) return act(g, p, 'cervatillo', { tipo: can[0] });
    }
    if (free && total(pend) > 0) {
      const slot = g.claro.findIndex((c) => c && pend[c] > 0);
      if (p.pociones.includes('pensar') && slot >= 0) return act(g, p, 'magia', { carta: 'pensar', slot });
      const can = placeable(p);
      if (p.pociones.includes('memoria') && can.length) return act(g, p, 'magia', { carta: 'memoria', colocar: can.slice(0, 2).map((x) => ({ tipo: x })) });
      if (p.aprendidas.includes('cambio') && p.reserva.eter >= 1) {
        const res = { ...p.reserva, eter: p.reserva.eter - 1 };
        const ok = placeable(p, res);
        const list = ok.slice(0, 1).map((x) => ({ tipo: x }));
        const rest = { ...res };
        for (const x of list) rest[x.tipo] -= 1;
        const pend2 = { ...pend };
        for (const x of list) pend2[x.tipo] -= 1;
        const need = C.ING.find((x) => pend2[x] > 0);
        const wild = C.ING.find((x) => rest[x] > 0 && !(pend2[x] > 0));
        if (need && wild) list.push({ tipo: wild, como: need });
        if (list.length >= 2 || (list.length && total(pend) === 1)) return act(g, p, 'magia', { carta: 'cambio', colocar: list });
      }
      if (p.pociones.includes('suerte') && g.claro.filter(Boolean).length >= 3 && g.claro.some((c) => c && pend[c] > 0)) {
        return act(g, p, 'magia', { carta: 'suerte', slots: pickSlots(g, p, 3), colocar: null });
      }
    }
  }
  return act(g, p, 'fin_estudio');
}

function prepare(g, p) {
  const t = g.turn;
  if (!t.preparada && p.pociones.length < C.MAX_POCIONES) {
    const order = ['pensar', 'memoria', 'sueno', 'suerte'];
    for (const id of order) {
      if (p.aprendidas.includes(id) && !p.pociones.includes(id) && g.canPay(p, C.CARTAS[id].coste)) {
        return act(g, p, 'preparar', { carta: id });
      }
    }
  }
  return act(g, p, 'fin_turno');
}

function discard(g, p) {
  const extra = total(p.reserva) - C.LIMITE_RESERVA;
  const res = { ...p.reserva };
  const out = { eter: 0, umbra: 0, lumen: 0, raiz: 0 };
  const w = wants(g, p);
  for (let k = 0; k < extra; k += 1) {
    let best = null;
    for (const t of C.ING) {
      if (!(res[t] > 0)) continue;
      const v = w[t] - res[t];
      if (!best || v < best.v) best = { t, v };
    }
    res[best.t] -= 1;
    out[best.t] += 1;
  }
  return act(g, p, 'descartar', { ings: out });
}

function attack(g, p) {
  const opts = g.attacksFor(p);
  const target = g.active;
  const me = g.points(p);
  const them = g.points(target);
  const close = target.estudio && total(pendingOf(target.estudio)) <= 3;
  if (!opts.length || !(them >= me - 1 || close) || g.rng() < 0.25) return act(g, p, 'pasar');
  if (opts.includes('lio')) {
    const s = g.lioSwaps(target)[0];
    const res = { ...p.reserva, umbra: p.reserva.umbra - 1 };
    let bonus = null;
    if (p.estudio) {
      const pend = pendingOf(p.estudio);
      const need = C.ING.find((x) => pend[x] > 0);
      const have = C.ING.find((x) => res[x] > 0 && pend[x] > 0) || C.ING.find((x) => res[x] > 0);
      if (need && have) bonus = { tipo: have, como: pend[have] > 0 ? have : need };
    }
    return act(g, p, 'atacar', { carta: 'lio', tipo: s.tipo, slot: s.slot, bonus });
  }
  if (opts.includes('sueno') && target.estudio) {
    const can = placeable(p);
    return act(g, p, 'atacar', { carta: 'sueno', bonus: can.length ? { tipo: can[0] } : null });
  }
  if (opts.includes('robo')) {
    const pend = p.estudio ? pendingOf(p.estudio) : {};
    const tp = target.estudio ? pendingOf(target.estudio) : {};
    const tipo = C.ING.find((x) => target.reserva[x] > 0 && pend[x] > 0)
      || C.ING.find((x) => target.reserva[x] > 0 && tp[x] > 0)
      || C.ING.find((x) => target.reserva[x] > 0);
    return act(g, p, 'atacar', { carta: 'robo', tipo, colocar: !!(pend[tipo] > 0) });
  }
  return act(g, p, 'pasar');
}

// Una acción del bot p, si le toca hacer algo. Devuelve true si actuó.
function botStep(g, p) {
  if (g.phase !== 'juego' || !p.bot) return false;
  const t = g.turn;
  if (t.paso === 'ventana') {
    if (t.pid !== p.id && t.ventana[p.id] === undefined && g.attacksFor(p).length) return attack(g, p);
    return false;
  }
  if (t.paso === 'defensa') {
    if (t.pid === p.id) return act(g, p, g.canDefend(p) ? 'defender' : 'no_defender');
    return false;
  }
  if (t.pid !== p.id) return false;
  if (t.paso === 'recoger') {
    const useZorro = p.mascota === 'zorro' && p.usos > 0 && (() => {
      const w = wants(g, p);
      return g.claro.filter((c) => c && w[c] >= 3).length >= 4 || g.round >= C.RONDAS - 1;
    })();
    return act(g, p, 'recoger', { slots: pickSlots(g, p, useZorro ? C.RECOGER_ZORRO : C.RECOGER), zorro: useZorro });
  }
  if (t.paso === 'estudiar') return ownStudy(g, p);
  if (t.paso === 'preparar') return prepare(g, p);
  if (t.paso === 'descartar') return discard(g, p);
  return false;
}

module.exports = { botStep };
