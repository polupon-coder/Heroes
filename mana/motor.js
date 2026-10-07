'use strict';
// MANA — motor de reglas y bot para simular partidas completas.
// Las opciones de VARIANTE permiten comparar el reglamento provisional con cambios.
const { ELEMENTOS, UMBRAL, INICIAL } = require('./cartas');

const BASE = {
  acciones: 1, // Elementales jugables como Acción por turno (regla 14). Infinity = cada carta, Acción o Maná.
  compras: 1, // vinculaciones por turno
  rondas: 5, // rondas por Era
  eras: [1, 2, 3], // valor de cada Santuario por Era
  segundo: 0, // Fragmentos del segundo puesto como fracción del valor (0 = nada)
  empate: 'nadie', // 'nadie' (regla 23) | 'reparto' (cada empatado recibe valor-1, mínimo 0)
  proteccion: 'turno', // 'turno' (regla 19) | 'era'
  rotacion: 'ronda', // 'ronda' (regla 21) | 'era' (empieza la Era quien va primero en Fragmentos)
  cartas: UMBRAL,
  copias: 3,
  inicial: INICIAL,
};

function rngFrom(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Fuerza estimada de una carta para el bot (no es parte de las reglas).
function fuerza(c, v) {
  const multi = v.acciones > 1;
  let p = c.mana * 0.6;
  for (const e of c.accion) {
    if (e.add) p += e.add + (e.prot ? 0.3 : 0);
    if (e.remove) p += 0.9 * e.remove;
    if (e.ifBehind) p += 1.4;
    if (e.ifAny) p += 1.7;
    if (e.protect) p += 0.2 * e.protect;
    if (e.draw) p += (multi ? 0.9 : 0.45) * e.draw;
    if (e.discard) p -= multi ? 0.35 : 0;
    if (e.topFromDiscard) p += 0.5;
    if (e.handToTop) p += 0.2;
    if (e.recover) p += multi ? 1 : 0.6;
    if (e.moveRival) p += 0.8 * e.moveRival;
    if (e.moveOwnTo) p += 0.5;
    if (e.disrupt) p += 0.2;
    if (e.refresh) p += 0.1;
  }
  return p;
}

class Partida {
  constructor(n, opciones = {}) {
    this.v = { ...BASE, ...opciones };
    this.rng = rngFrom(opciones.seed || 1);
    this.n = n;
    this.jug = [];
    for (let i = 0; i < n; i++) {
      const mazo = shuffle(this.v.inicial.slice(), this.rng);
      this.jug.push({ i, mazo, mano: [], desc: [], jugadas: [], frag: 0, fragEra: [], vinculadas: 0, gusto: ELEMENTOS[Math.floor(this.rng() * 4)] });
    }
    this.jug.forEach((j) => this.robar(j, 5));
    this.pila = shuffle(this.v.cartas.flatMap((c) => Array(this.v.copias).fill(c)), this.rng);
    this.umbral = [];
    this.reponer();
    this.pres = {}; // pres[santuario][jugador] = { n, prot }
    this.limpiar();
    this.era = 0;
    this.ronda = 0;
    this.inicio = 0;
    this.restantes = 0; // turnos que quedan en la Era (de todos)
    this.st = { manaGen: 0, manaGastado: 0, turnos: 0, compras: 0, usoAccion: {}, usoMana: {}, vinculadas: {}, sinObjetivo: 0, retiradas: 0, movidas: 0, puestas: 0, empates: 0, puntuaciones: 0, vacios: 0, desperdicio: [0, 0, 0], turnosEra: [0, 0, 0], ultimoEra: [], accionesTurno: 0 };
  }

  limpiar() {
    for (const s of ELEMENTOS) this.pres[s] = this.jug.map(() => ({ n: 0, prot: 0 }));
  }

  reponer() {
    while (this.umbral.length < 5 && this.pila.length) this.umbral.push(this.pila.pop());
  }

  robar(j, k) {
    for (let t = 0; t < k; t++) {
      if (!j.mazo.length) {
        if (!j.desc.length) return;
        j.mazo = shuffle(j.desc, this.rng);
        j.desc = [];
      }
      j.mano.push(j.mazo.pop());
    }
  }

  // Valoración del tablero para el jugador i (Fragmentos esperados de esta Era).
  valor(i) {
    const val = this.v.eras[this.era];
    const t = this.restantes;
    let total = 0;
    for (const s of ELEMENTOS) {
      const mine = this.pres[s][i].n;
      let otro = 0;
      for (let k = 0; k < this.n; k++) if (k !== i) otro = Math.max(otro, this.pres[s][k].n);
      const m = mine - otro;
      let p;
      if (t <= 0) p = m > 0 ? 1 : 0;
      else p = 1 / (1 + Math.exp(-(m - 0.5) * (2.2 / Math.sqrt(1 + t / this.n))));
      total += val * p;
    }
    return total;
  }

  clonar() {
    const c = Object.create(Partida.prototype);
    c.v = this.v;
    c.n = this.n;
    const r = rngFrom(Math.floor(this.rng() * 2 ** 32));
    c.rng = r;
    c.jug = this.jug.map((j) => ({ ...j, mazo: j.mazo.slice(), mano: j.mano.slice(), desc: j.desc.slice(), jugadas: j.jugadas.slice() }));
    c.pila = this.pila.slice();
    c.umbral = this.umbral.slice();
    c.pres = {};
    for (const s of ELEMENTOS) c.pres[s] = this.pres[s].map((x) => ({ ...x }));
    c.era = this.era;
    c.restantes = this.restantes;
    c.st = null;
    return c;
  }

  // Elige, entre varias variantes del tablero, la mejor para i.
  mejor(i, opciones) {
    let best = null;
    let bv = -Infinity;
    for (const f of opciones) {
      const c = this.clonar();
      if (f(c) === false) continue;
      const val = c.valor(i);
      if (val > bv + 1e-9) {
        bv = val;
        best = f;
      }
    }
    return best;
  }

  quitar(s, k) {
    const p = this.pres[s][k];
    if (p.n - p.prot <= 0) return false;
    p.n--;
    return true;
  }

  efecto(i, e, accionUsada) {
    const j = this.jug[i];
    const st = this.st || {};
    if (e.add) {
      this.pres[e.s][i].n += e.add;
      if (e.prot) this.pres[e.s][i].prot += e.add;
      st.puestas = (st.puestas || 0) + e.add;
    }
    if (e.ifBehind) {
      const mine = this.pres[e.s][i].n;
      const behind = this.pres[e.s].some((p, k) => k !== i && p.n > mine);
      const k = behind ? e.ifBehind[0] : e.ifBehind[1];
      this.pres[e.s][i].n += k;
      st.puestas = (st.puestas || 0) + k;
    }
    if (e.ifAny && this.pres[e.s][i].n > 0) {
      this.pres[e.s][i].n += e.ifAny;
      st.puestas = (st.puestas || 0) + e.ifAny;
    }
    if (e.remove) {
      for (let t = 0; t < e.remove; t++) {
        const rivales = this.jug.map((x) => x.i).filter((k) => k !== i && this.pres[e.s][k].n - this.pres[e.s][k].prot > 0);
        if (!rivales.length) {
          if (this.st) this.st.sinObjetivo++;
          break;
        }
        const f = this.mejor(i, rivales.map((k) => (c) => c.quitar(e.s, k)));
        f(this);
        if (this.st) this.st.retiradas++;
      }
    }
    if (e.moveRival) {
      for (let t = 0; t < e.moveRival; t++) {
        const ops = [() => true];
        for (let k = 0; k < this.n; k++) {
          if (k === i) continue;
          for (const d of ELEMENTOS) {
            if (d === e.s) continue;
            ops.push((c) => {
              if (!c.quitar(e.s, k)) return false;
              c.pres[d][k].n++;
            });
          }
        }
        const f = this.mejor(i, ops);
        if (f === ops[0]) break;
        f(this);
        if (this.st) this.st.movidas++;
      }
    }
    if (e.moveOwnTo) {
      const ops = [() => true];
      for (const o of ELEMENTOS) {
        if (o === e.moveOwnTo) continue;
        ops.push((c) => {
          if (!c.quitar(o, i)) return false;
          c.pres[e.moveOwnTo][i].n++;
        });
      }
      const f = this.mejor(i, ops);
      f(this);
    }
    if (e.protect) {
      const p = this.pres[e.s][i];
      p.prot = Math.min(p.n, p.prot + e.protect);
    }
    if (e.draw) this.robar(j, e.draw);
    const clave = accionUsada ? (c) => c.mana : (c) => fuerza(c, this.v);
    if (e.discard) {
      for (let t = 0; t < e.discard && j.mano.length; t++) {
        j.mano.sort((a, b) => clave(a) - clave(b));
        j.desc.push(j.mano.shift());
      }
    }
    if (e.handToTop && j.mano.length) {
      // lo mejor para el próximo turno: la carta con mejor Acción
      j.mano.sort((a, b) => fuerza(b, this.v) - fuerza(a, this.v));
      j.mazo.push(j.mano.shift());
    }
    if (e.topFromDiscard && j.desc.length) {
      j.desc.sort((a, b) => fuerza(a, this.v) - fuerza(b, this.v));
      j.mazo.push(j.desc.pop());
    }
    if (e.recover && j.desc.length) {
      j.desc.sort((a, b) => clave(a) - clave(b));
      j.mano.push(j.desc.pop());
    }
    if (e.disrupt) {
      const rivales = this.jug.filter((x) => x.i !== i && x.mano.length);
      if (rivales.length) {
        const r = rivales[Math.floor(this.rng() * rivales.length)];
        const idx = Math.floor(this.rng() * r.mano.length);
        r.desc.push(r.mano.splice(idx, 1)[0]);
        this.robar(r, 1);
      }
    }
    if (e.refresh && this.umbral.length) {
      this.umbral.sort((a, b) => a.coste - b.coste);
      this.umbral.pop();
      this.reponer();
    }
  }

  jugarAccion(i, idx) {
    const j = this.jug[i];
    const c = j.mano.splice(idx, 1)[0];
    j.jugadas.push(c);
    if (this.st) this.st.usoAccion[c.nombre] = (this.st.usoAccion[c.nombre] || 0) + 1;
    for (const e of c.accion) this.efecto(i, e, true);
  }

  // Valor de vincular lo mejor posible con 'mana' (para el bot).
  compra(i, mana) {
    const turnosMios = Math.max(0, Math.ceil(this.turnosPartida / this.n) - 1);
    const coef = 0.07 * turnosMios;
    let best = -1;
    let bv = 0;
    this.umbral.forEach((c, k) => {
      if (c.coste > mana) return;
      const val = coef * (fuerza(c, this.v) + (c.el === this.jug[i].gusto ? 0.4 : 0));
      if (val > bv) {
        bv = val;
        best = k;
      }
    });
    return { idx: best, val: bv };
  }

  // Mejor siguiente Acción mirando hasta 'prof' Acciones por delante (k = -1: dejar de jugar Acciones).
  plan(i, quedan, prof) {
    const j = this.jug[i];
    const base = this.valor(i);
    let best = { k: -1, val: this.compra(i, j.mano.reduce((a, c) => a + c.mana, 0)).val };
    if (quedan <= 0 || prof <= 0) return best;
    j.mano.forEach((c, k) => {
      if (!c.accion.length) return;
      const cl = this.clonar();
      cl.turnosPartida = this.turnosPartida;
      cl.jugarAccion(i, k);
      const val = cl.valor(i) - base + cl.plan(i, quedan - 1, prof - 1).val;
      if (val > best.val + 1e-9) best = { k, val };
    });
    return best;
  }

  turnoBot(i) {
    const j = this.jug[i];
    if (this.v.proteccion === 'turno') for (const s of ELEMENTOS) this.pres[s][i].prot = 0;
    const manaDe = (cs) => cs.reduce((a, c) => a + c.mana, 0);
    let usadas = 0;
    while (usadas < this.v.acciones) {
      const { k } = this.plan(i, this.v.acciones - usadas, 2);
      if (k < 0) break;
      this.jugarAccion(i, k);
      usadas++;
    }
    this.st.accionesTurno += usadas;
    const mana = manaDe(j.mano);
    for (const c of j.mano) this.st.usoMana[c.nombre] = (this.st.usoMana[c.nombre] || 0) + 1;
    this.st.manaGen += mana;
    let gastado = 0;
    for (let b = 0; b < this.v.compras; b++) {
      const { idx } = this.compra(i, mana - gastado);
      if (idx < 0) break;
      const c = this.umbral.splice(idx, 1)[0];
      gastado += c.coste;
      j.desc.push(c);
      j.vinculadas++;
      this.st.vinculadas[c.nombre] = (this.st.vinculadas[c.nombre] || 0) + 1;
      this.st.compras++;
      this.reponer();
    }
    this.st.manaGastado += gastado;
    this.st.desperdicio[this.era] += mana - gastado;
    this.st.turnosEra[this.era]++;
    this.st.turnos++;
    j.desc.push(...j.jugadas, ...j.mano);
    j.jugadas = [];
    j.mano = [];
    this.robar(j, 5);
  }

  puntuar() {
    const val = this.v.eras[this.era];
    const gan = this.jug.map(() => 0);
    for (const s of ELEMENTOS) {
      const ns = this.pres[s].map((p) => p.n);
      const orden = [...new Set(ns)].sort((a, b) => b - a);
      const top = orden[0];
      this.st.puntuaciones++;
      if (top === 0) {
        this.st.vacios++;
        continue;
      }
      const primeros = ns.map((x, k) => (x === top ? k : -1)).filter((k) => k >= 0);
      if (primeros.length > 1) {
        this.st.empates++;
        if (this.v.empate === 'reparto') primeros.forEach((k) => (gan[k] += Math.max(0, val - 1)));
        continue;
      }
      gan[primeros[0]] += val;
      if (this.v.segundo && orden[1] > 0) {
        const seg = ns.map((x, k) => (x === orden[1] ? k : -1)).filter((k) => k >= 0);
        if (seg.length === 1) gan[seg[0]] += Math.floor(val * this.v.segundo);
      }
    }
    this.jug.forEach((j, k) => {
      j.frag += gan[k];
      j.fragEra.push(gan[k]);
    });
  }

  jugar() {
    const N = this.n;
    const R = this.v.rondas;
    this.turnosPartida = N * R * this.v.eras.length;
    let ronda = 0;
    for (this.era = 0; this.era < this.v.eras.length; this.era++) {
      let inicioEra = 0;
      if (this.v.rotacion === 'era') {
        // empieza el que va primero (así no tiene la última palabra)
        const orden = this.jug.slice().sort((a, b) => b.frag - a.frag || a.i - b.i);
        inicioEra = orden[0].i;
      }
      this.restantes = N * R;
      let ultimo = -1;
      for (let r = 0; r < R; r++, ronda++) {
        const ini = this.v.rotacion === 'ronda' ? ronda % N : inicioEra;
        for (let t = 0; t < N; t++) {
          const i = (ini + t) % N;
          this.restantes--;
          this.turnoBot(i);
          this.turnosPartida--;
          ultimo = i;
        }
      }
      this.st.ultimoEra.push(ultimo);
      this.puntuar();
      this.limpiar();
      this.umbral = [];
      this.reponer();
    }
    const max = Math.max(...this.jug.map((j) => j.frag));
    this.ganadores = this.jug.filter((j) => j.frag === max).map((j) => j.i);
    return this;
  }
}

module.exports = { Partida, BASE, fuerza, rngFrom };
