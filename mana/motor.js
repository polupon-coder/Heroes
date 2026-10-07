'use strict';
// MANA — motor de reglas y bot para simular partidas completas.
// Las opciones de VARIANTE permiten comparar el reglamento provisional con cambios.
const { ELEMENTOS, UMBRAL, UMBRAL_V01, INICIAL } = require('./cartas');

// Reglamento v0.2 (por defecto).
const BASE = {
  acciones: Infinity, // cada carta jugada: Acción o Maná, sin límite de Acciones
  compras: 1, // vinculaciones por turno
  rondas: 5, // rondas por Era
  eras: [1, 2, 3], // Sellos de cada Santuario por Era
  segundo: 0, // Sellos del segundo puesto como fracción del valor (0 = nada)
  empate: 'nadie', // empate en cabeza de un Santuario: 'nadie' puntúa | 'reparto' (valor-1 a cada uno)
  proteccion: 'era', // 'era': dura hasta el final de la Era | 'turno': hasta el siguiente turno del propietario
  rotacion: 'era', // 'era': orden fijo; empieza cada Era quien va primero en Sellos | 'ronda': el inicial rota cada ronda
  liberar: true, // una vez por turno, devolver a la caja una carta inicial usada ese turno
  liberarCoste: 2, // Maná que cuesta liberar (con 1, liberar todo lo posible es siempre lo mejor)
  liberarEnLugar: false, // true: liberar solo en lugar de vincular
  liberarMax: 1, // cartas iniciales que se liberan cada vez
  botLiberar: 0.08, // (bot) valor de liberar por turno que le queda; puede ser una lista por jugador
  mano: 5, // cartas que se roban al final de cada turno
  manoPrimero: 5, // cartas de la primera mano del jugador inicial (con 4 se compensa demasiado)
  desorden: 'rival', // quién elige la carta que descarta el rival en Desorden
  afinidad: ['mazo'], // Guardianes de color: lista con 'mazo', 'empate', 'descuento' y/o 'presencia' ([] = solo color, null = sin color)
  desempate: 'eraIII', // empate final: más Sellos en la Era III | 'compartir'
  cartas: UMBRAL,
  copias: 3,
  inicial: INICIAL,
};

// Reglamento provisional v0.1, para comparar.
const V01 = { afinidad: null, acciones: 1, proteccion: 'turno', rotacion: 'ronda', liberar: false, desempate: 'compartir', cartas: UMBRAL_V01 };

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
    if (e.remove) p += (e.s === '*' ? 1.1 : 0.9) * e.remove;
    if (e.ifBehind) p += 1.4;
    if (e.ifAny) p += 1.7;
    if (e.protect) p += (e.s === '*' ? 0.4 : 0.2) * (e.all ? 3 : e.protect);
    if (e.draw) p += (multi ? 0.9 : 0.45) * e.draw;
    if (e.discard) p -= multi ? 0.35 : 0;
    if (e.topFromDiscard) p += 0.5;
    if (e.handToTop) p += 0.2;
    if (e.recover) p += multi ? 1 : 0.6;
    if (e.moveRival) p += (e.s === '*' ? 1 : 0.8) * e.moveRival;
    if (e.moveOwnTo) p += 0.5;
    if (e.disrupt) p += e.modo === 'todos' ? 0.6 : 0.2;
    if (e.swap) p += 1.6;
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
    // Guardianes de color: cada jugador es de un elemento distinto (por sorteo)
    const colores = this.v.afinidad ? shuffle(ELEMENTOS.slice(), this.rng) : null;
    for (let i = 0; i < n; i++) {
      const ini = this.v.inicial.slice();
      if (colores && this.v.afinidad.includes('mazo')) ini[ini.findIndex((c) => c.nombre === 'Mota de Maná')] = ini.find((c) => c.el === colores[i]);
      // pruebas de fuerza: ese jugador cambia Motas de Maná por la carta indicada
      if (this.v.injertar && this.v.injertar.jugador === i) {
        for (let t = 0; t < (this.v.injertar.copias || 1); t++) ini[ini.findIndex((c) => c.nombre === 'Mota de Maná')] = this.v.injertar.carta;
      }
      const mazo = shuffle(ini, this.rng);
      this.jug.push({ i, mazo, mano: [], desc: [], jugadas: [], sellos: 0, selloEra: [], vinculadas: 0, liberadas: 0, gusto: ELEMENTOS[Math.floor(this.rng() * 4)], color: colores ? colores[i] : null });
      if (colores) this.jug[i].gusto = colores[i];
    }
    this.jug.forEach((j) => this.robar(j, j.i === 0 ? this.v.manoPrimero : this.v.mano));
    this.pila = shuffle(this.v.cartas.flatMap((c) => Array(this.v.copias).fill(c)), this.rng);
    this.umbral = [];
    this.reponer();
    this.pres = {}; // pres[santuario][jugador] = { n, prot }
    this.limpiar();
    this.extra = this.jug.map(() => 0);
    this.registro = opciones.registro ? [] : null;
    this.era = 0;
    this.ronda = 0;
    this.inicio = 0;
    this.restantes = 0; // turnos que quedan en la Era (de todos)
    this.st = { manaGen: 0, manaGastado: 0, turnos: 0, compras: 0, usoAccion: {}, usoMana: {}, vinculadas: {}, sinObjetivo: 0, liberadas: 0, retiradas: 0, movidas: 0, puestas: 0, empates: 0, puntuaciones: 0, vacios: 0, desperdicio: [0, 0, 0], turnosEra: [0, 0, 0], ultimoEra: [], accionesTurno: 0 };
  }

  limpiar() {
    for (const s of ELEMENTOS) this.pres[s] = this.jug.map(() => ({ n: 0, prot: 0 }));
    // afinidad 'presencia': cada Guardián empieza la Era con 1 Presencia en su Santuario
    if (this.v.afinidad && this.v.afinidad.includes('presencia')) for (const j of this.jug) this.pres[j.color][j.i].n = 1;
  }

  // Coste de vincular para el jugador i (afinidad 'descuento': los de su color cuestan 1 menos)
  coste(i, c) {
    return this.v.afinidad && this.v.afinidad.includes('descuento') && c.el === this.jug[i].color ? Math.max(1, c.coste - 1) : c.coste;
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
      if (this.captura && this.captura.j === j) this.captura.robadas.push(j.mano[j.mano.length - 1]);
    }
  }

  // Valoración del tablero para el jugador i (Sellos esperados de esta Era).
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
      // Presencias protegidas: valen más cuanto más quede de Era (no se pueden retirar ni mover)
      if (t > 0) total += 0.06 * val * Math.min(this.pres[s][i].prot, 3) * Math.min(1, t / this.n / 2);
    }
    return total + this.extra[i];
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
    c.extra = this.extra.slice();
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
      const santuarios = e.s === '*' ? ELEMENTOS : [e.s];
      const retirar = (c, sa) => {
        for (let t = 0; t < e.remove; t++) {
          const rivales = c.jug.map((x) => x.i).filter((k) => k !== i && c.pres[sa][k].n - c.pres[sa][k].prot > 0);
          if (!rivales.length) return t > 0;
          c.mejor(i, rivales.map((k) => (cc) => cc.quitar(sa, k)))(c);
          if (c.st) c.st.retiradas++;
        }
      };
      const f = this.mejor(i, santuarios.map((sa) => (c) => retirar(c, sa)));
      if (f) f(this);
      else if (this.st) this.st.sinObjetivo++;
    }
    if (e.swap) {
      // retira 1 Presencia rival de un Santuario y pon 1 tuya en ese mismo Santuario
      const ops = [];
      for (const sa of e.s === '*' ? ELEMENTOS : [e.s]) {
        for (let k = 0; k < this.n; k++) {
          if (k === i) continue;
          ops.push((c) => {
            if (!c.quitar(sa, k)) return false;
            c.pres[sa][i].n++;
          });
        }
      }
      const f = this.mejor(i, ops);
      if (f) {
        f(this);
        if (this.st) this.st.retiradas++;
      }
    }
    if (e.moveRival) {
      for (let t = 0; t < e.moveRival; t++) {
        const ops = [() => true];
        for (let k = 0; k < this.n; k++) {
          if (k === i) continue;
          for (const o of e.s === '*' ? ELEMENTOS : [e.s]) {
            for (const d of ELEMENTOS) {
              if (d === o) continue;
              ops.push((c) => {
                if (!c.quitar(o, k)) return false;
                c.pres[d][k].n++;
              });
            }
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
      const santuarios = e.s === '*' ? ELEMENTOS : [e.s];
      const proteger = (c, sa, k) => {
        const p = c.pres[sa][i];
        if (p.prot >= p.n) return false;
        p.prot = Math.min(p.n, p.prot + k);
      };
      if (e.all) {
        const f = this.mejor(i, santuarios.map((sa) => (c) => proteger(c, sa, Infinity)));
        if (f) f(this);
      } else {
        for (let t = 0; t < e.protect; t++) {
          const f = this.mejor(i, santuarios.map((sa) => (c) => proteger(c, sa, 1)));
          if (!f) break;
          f(this);
        }
      }
    }
    if (e.draw) this.robar(j, e.draw);
    const clave = accionUsada && this.v.acciones <= 1 ? (c) => c.mana : (c) => fuerza(c, this.v);
    // Valor (en Sellos) de una carta mejor que la media en el próximo robo; solo lo usa el bot al planificar.
    const w = 0.15 * this.v.eras[this.era];
    const media = (cs) => (cs.length ? cs.reduce((a, c) => a + fuerza(c, this.v), 0) / cs.length : 1);
    if (e.discard) {
      for (let t = 0; t < e.discard && j.mano.length; t++) {
        j.mano.sort((a, b) => clave(a) - clave(b));
        j.desc.push(j.mano.shift());
        this.nota('descarta', j.desc[j.desc.length - 1]);
      }
    }
    if (e.handToTop && j.mano.length) {
      // con 1 Acción: la mejor carta (ya no se puede jugar); con Acciones ilimitadas: la más floja
      const m = media([...j.mazo, ...j.desc]);
      j.mano.sort((a, b) => fuerza(b, this.v) - fuerza(a, this.v));
      const c = this.v.acciones <= 1 ? j.mano.shift() : j.mano.pop();
      j.mazo.push(c);
      this.nota('encima', c);
      this.extra[i] += w * (fuerza(c, this.v) - m);
    }
    if (e.topFromDiscard && j.desc.length) {
      const m = media([...j.mazo, ...j.desc]);
      j.desc.sort((a, b) => fuerza(a, this.v) - fuerza(b, this.v));
      const c = j.desc.pop();
      j.mazo.push(c);
      this.nota('encima', c);
      this.extra[i] += w * Math.max(0, fuerza(c, this.v) - m);
    }
    if (e.recover && j.desc.length) {
      j.desc.sort((a, b) => clave(a) - clave(b));
      j.mano.push(j.desc.pop());
      this.nota('recupera', j.mano[j.mano.length - 1]);
    }
    if (e.disrupt) {
      // el jugador activo elige al rival (el que va primero en Sellos); el rival elige qué descarta
      // modo 'rival': el rival elige su descarte y roba 1 | 'activo': lo eliges tú y roba 1 | 'sinRobo': lo eliges tú y no roba | 'todos'
      const modo = e.modo || this.v.desorden;
      const rivales = this.jug.filter((x) => x.i !== i && x.mano.length).sort((a, b) => b.sellos - a.sellos);
      // 'todos': cada rival descarta 1 carta que elige él, sin robar
      for (const r of modo === 'todos' ? rivales : rivales.slice(0, 1)) {
        const m = media([...r.mazo, ...r.desc]);
        r.mano.sort((a, b) => fuerza(a, this.v) - fuerza(b, this.v));
        const c = modo === 'rival' || modo === 'todos' ? r.mano.shift() : r.mano.pop();
        r.desc.push(c);
        const robo = modo === 'rival' || modo === 'activo';
        // lo que pierde el rival, repartido entre los rivales
        this.extra[i] += (w * (fuerza(c, this.v) - (robo ? m : 0))) / (this.n - 1);
        if (robo) this.robar(r, 1);
      }
    }
    if (e.refresh && this.umbral.length) {
      // descarta el Elemental que menos le interesa (para ver otro)
      const g = this.jug[i].gusto;
      this.umbral.sort((a, b) => fuerza(b, this.v) + (b.el === g ? 0.4 : 0) - fuerza(a, this.v) - (a.el === g ? 0.4 : 0));
      this.umbral.pop();
      this.reponer();
    }
  }

  // Foto de la Presencia para describir lo que ha cambiado (registro de la partida)
  foto() {
    const f = {};
    for (const s of ELEMENTOS) f[s] = this.pres[s].map((p) => ({ ...p }));
    return f;
  }

  cambios(antes) {
    const lista = [];
    for (const s of ELEMENTOS) {
      this.pres[s].forEach((p, k) => {
        const dn = p.n - antes[s][k].n;
        const dp = Math.max(0, p.prot - antes[s][k].prot);
        if (dn || dp) lista.push({ s, k, dn, dp });
      });
    }
    return lista;
  }

  nota(tipo, carta) {
    if (this.captura) this.captura.notas.push({ tipo, carta: carta.nombre });
  }

  anotar(entrada) {
    if (this.registro) this.registro.push({ era: this.era, ronda: this.rondaEra, ...entrada });
  }

  // Una Acción se juega en tres pasos: empezar (la carta sale de la mano), aplicar sus efectos
  // y terminar (se apunta en el registro). Así una persona puede elegir entre efecto y efecto.
  empezarAccion(i, idx) {
    const j = this.jug[i];
    const c = j.mano.splice(idx, 1)[0];
    j.jugadas.push(c);
    this.accionEnCurso = { c, antes: this.registro ? this.foto() : null };
    // Con registro, se apunta qué cartas se roban, descartan, recuperan o se ponen encima del mazo
    if (this.registro) this.captura = { j, robadas: [], notas: [] };
    if (this.st) {
      this.st.usoAccion[c.nombre] = (this.st.usoAccion[c.nombre] || 0) + 1;
      const inter = c.accion.some((e) => e.remove || e.moveRival || e.moveOwnTo || e.protect || e.disrupt || e.refresh);
      const robo = c.accion.some((e) => e.draw || e.recover || e.topFromDiscard || e.handToTop);
      this.st.acc = this.st.acc || { simple: 0, inter: 0, robo: 0 };
      this.st.acc[inter ? 'inter' : robo ? 'robo' : 'simple']++;
    }
    return c;
  }

  terminarAccion(i) {
    const { c, antes } = this.accionEnCurso;
    this.accionEnCurso = null;
    if (!antes) return;
    const { robadas, notas } = this.captura;
    this.captura = null;
    const pedidas = c.accion.reduce((a, e) => a + (e.draw || 0), 0);
    this.anotar({ i, tipo: 'accion', carta: c.nombre, cambios: this.cambios(antes), robadas: robadas.map((x) => x.nombre),
      cartasRobadas: robadas, sinCartas: robadas.length < pedidas, notas });
  }

  jugarAccion(i, idx) {
    const c = this.empezarAccion(i, idx);
    for (const e of c.accion) this.efecto(i, e, true);
    this.terminarAccion(i);
  }

  // --- Efectos en los que una persona elige -------------------------------------------------
  static necesitaEleccion(e) {
    return !!(e.remove || e.swap || e.moveRival || e.moveOwnTo || e.protect || e.discard || e.handToTop || e.topFromDiscard || e.recover || e.refresh);
  }

  // Presencias rivales que se pueden quitar (no protegidas) en un Santuario
  quitables(s, k) {
    return this.pres[s][k].n - this.pres[s][k].prot;
  }

  elegirRetirar(s, k) { return this.quitar(s, k); }

  elegirIntercambio(i, s, k) {
    if (!this.quitar(s, k)) return false;
    this.pres[s][i].n++;
    return true;
  }

  elegirMover(origen, k, destino) {
    if (origen === destino || !this.quitar(origen, k)) return false;
    this.pres[destino][k].n++;
    return true;
  }

  elegirProteger(i, s, todas) {
    const p = this.pres[s][i];
    if (p.prot >= p.n) return false;
    p.prot = todas ? p.n : p.prot + 1;
    return true;
  }

  elegirDescartar(i, idx) {
    const j = this.jug[i];
    const [c] = j.mano.splice(idx, 1);
    j.desc.push(c);
    this.nota('descarta', c);
  }

  elegirManoEncima(i, idx) {
    const j = this.jug[i];
    const [c] = j.mano.splice(idx, 1);
    j.mazo.push(c);
    this.nota('encima', c);
  }

  elegirDescarteEncima(i, idx) {
    const j = this.jug[i];
    const [c] = j.desc.splice(idx, 1);
    j.mazo.push(c);
    this.nota('encima', c);
  }

  elegirRecuperar(i, idx) {
    const j = this.jug[i];
    const [c] = j.desc.splice(idx, 1);
    j.mano.push(c);
    this.nota('recupera', c);
    return c;
  }

  elegirCambioUmbral(u) {
    const [c] = this.umbral.splice(u, 1);
    this.reponer();
    return c;
  }


  // Valor de vincular lo mejor posible con 'mana' (para el bot).
  compra(i, mana) {
    const turnosMios = Math.max(0, Math.ceil(this.turnosPartida / this.n) - 1);
    const coef = 0.07 * turnosMios;
    const j = this.jug[i];
    // Liberar: el bot le da un valor proporcional a los turnos que le quedan.
    const k = Array.isArray(this.v.botLiberar) ? this.v.botLiberar[i] : this.v.botLiberar;
    const puedeLiberar = this.v.liberar && (j.jugadas.some((c) => c.inicial) || j.mano.some((c) => c.inicial));
    const valLib = k * turnosMios;
    let best = { idx: -1, val: 0, liberar: false };
    const probar = (idx, val, coste) => {
      if (coste > mana) return;
      if (val > best.val) best = { idx, val, liberar: false };
      if (puedeLiberar && valLib > 0 && (idx < 0 || !this.v.liberarEnLugar) && coste + this.v.liberarCoste <= mana && val + valLib > best.val) best = { idx, val: val + valLib, liberar: true };
    };
    probar(-1, 0, 0);
    this.umbral.forEach((c, idx) => probar(idx, coef * (fuerza(c, this.v) + (c.el === j.gusto ? 0.4 : 0)), this.coste(i, c)));
    return best;
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
      const { idx, liberar } = this.compra(i, mana - gastado);
      if (idx >= 0) {
        const c = this.umbral.splice(idx, 1)[0];
        gastado += this.coste(i, c);
        j.desc.push(c);
        j.vinculadas++;
        this.anotar({ i, tipo: 'vincula', carta: c.nombre });
        this.st.vinculadas[c.nombre] = (this.st.vinculadas[c.nombre] || 0) + 1;
        this.st.compras++;
        this.reponer();
      }
      if (liberar) {
        // devuelve a la caja cartas iniciales usadas este turno (primero las Motas de Maná)
        for (let t = 0; t < this.v.liberarMax; t++) {
          const usadas = [...j.jugadas.map((c, k) => ['jugadas', k, c]), ...j.mano.map((c, k) => ['mano', k, c])].filter((x) => x[2].inicial);
          if (!usadas.length) break;
          usadas.sort((a, b) => a[2].accion.length - b[2].accion.length);
          const [donde, k] = usadas[0];
          const [lib] = j[donde].splice(k, 1);
          j.liberadas++;
          this.anotar({ i, tipo: 'libera', carta: lib.nombre });
          this.st.liberadas++;
        }
        gastado += this.v.liberarCoste;
      }
      if (idx < 0) break;
    }
    this.st.manaGastado += gastado;
    this.st.desperdicio[this.era] += mana - gastado;
    this.st.turnosEra[this.era]++;
    this.st.turnos++;
    this.anotar({ i, tipo: 'fin', comoMana: j.mano.map((c) => c.nombre), sinUsar: [] });
    j.desc.push(...j.jugadas, ...j.mano);
    j.jugadas = [];
    j.mano = [];
    this.robar(j, this.v.mano);
  }

  puntuar() {
    const val = this.v.eras[this.era];
    const gan = this.jug.map(() => 0);
    this.ultimaPuntuacion = [];
    (this.historial = this.historial || []).push(this.ultimaPuntuacion);
    for (const s of ELEMENTOS) {
      const ns = this.pres[s].map((p) => p.n);
      const detalle = { s, val, presencia: ns.slice(), ganador: null, empate: false };
      this.ultimaPuntuacion.push(detalle);
      const orden = [...new Set(ns)].sort((a, b) => b - a);
      const top = orden[0];
      this.st.puntuaciones++;
      if (top === 0) {
        this.st.vacios++;
        continue;
      }
      let primeros = ns.map((x, k) => (x === top ? k : -1)).filter((k) => k >= 0);
      // afinidad 'empate': en su Santuario, el Guardián de ese color gana los empates
      if (primeros.length > 1 && this.v.afinidad && this.v.afinidad.includes('empate')) {
        const dueño = primeros.find((k) => this.jug[k].color === s);
        if (dueño !== undefined) primeros = [dueño];
      }
      if (primeros.length > 1) {
        detalle.empate = true;
        this.st.empates++;
        if (this.v.empate === 'reparto') primeros.forEach((k) => (gan[k] += Math.max(0, val - 1)));
        continue;
      }
      gan[primeros[0]] += val;
      detalle.ganador = primeros[0];
      if (this.jug[primeros[0]].color === s) this.st.propio = (this.st.propio || 0) + 1;
      if (this.v.segundo && orden[1] > 0) {
        const seg = ns.map((x, k) => (x === orden[1] ? k : -1)).filter((k) => k >= 0);
        if (seg.length === 1) gan[seg[0]] += Math.floor(val * this.v.segundo);
      }
    }
    this.jug.forEach((j, k) => {
      j.sellos += gan[k];
      j.selloEra.push(gan[k]);
    });
  }

  // --- Control de turnos paso a paso -------------------------------------------------
  iniciar() {
    const N = this.n;
    this.turnosPartida = N * this.v.rondas * this.v.eras.length;
    this.era = 0;
    this.ronda = 0; // rondas jugadas en toda la partida
    this.rondaEra = 0; // rondas jugadas en la Era actual
    this.t = 0; // turno dentro de la ronda
    this.inicioEra = 0; // en la Era I se sortea: el asiento 0 hace de jugador sorteado
    this.restantes = N * this.v.rondas;
    this.fin = false;
    this.ultimo = -1;
    return this;
  }

  jugadorActual() {
    const ini = this.v.rotacion === 'ronda' ? this.ronda % this.n : this.inicioEra;
    return (ini + this.t) % this.n;
  }

  comenzarTurno() {
    const i = this.jugadorActual();
    this.restantes--;
    this.turno = { i, manaUsadas: [], gastado: 0, vinculado: false, liberado: false };
    if (this.v.proteccion === 'turno') for (const s of ELEMENTOS) this.pres[s][i].prot = 0;
    return i;
  }

  terminarTurno() {
    this.turnosPartida--;
    this.ultimo = this.turno.i;
    this.t++;
    if (this.t < this.n) return;
    this.t = 0;
    this.ronda++;
    this.rondaEra++;
    if (this.rondaEra === this.v.rondas) this.finEra();
  }

  finEra() {
    const N = this.n;
    this.st.ultimoEra.push(this.ultimo);
    this.puntuar();
    this.limpiar();
    this.umbral = [];
    this.reponer();
    this.era++;
    this.rondaEra = 0;
    this.restantes = N * this.v.rondas;
    if (this.era === this.v.eras.length) {
      this.era--; // para que la última Era siga siendo la III al mostrarla
      const max = Math.max(...this.jug.map((j) => j.sellos));
      let gan = this.jug.filter((j) => j.sellos === max);
      if (gan.length > 1 && this.v.desempate === 'eraIII') {
        const m3 = Math.max(...gan.map((j) => j.selloEra[2]));
        gan = gan.filter((j) => j.selloEra[2] === m3);
      }
      this.ganadores = gan.map((j) => j.i);
      this.fin = true;
      return;
    }
    if (this.v.rotacion === 'era') {
      // empieza el que va primero en Sellos (así no tiene la última palabra);
      // si hay empate, el primero en sentido horario desde quien empezó la Era anterior
      const max = Math.max(...this.jug.map((j) => j.sellos));
      for (let d = 0; d < N; d++) {
        const k = (this.inicioEra + d) % N;
        if (this.jug[k].sellos === max) {
          this.inicioEra = k;
          break;
        }
      }
    }
  }

  jugar() {
    this.iniciar();
    while (!this.fin) {
      const i = this.comenzarTurno();
      this.turnoBot(i);
      this.terminarTurno();
    }
    return this;
  }

  // --- Turno de una persona ---------------------------------------------------------------
  manaDisponible() {
    return this.turno.manaUsadas.reduce((a, c) => a + c.mana, 0) - this.turno.gastado;
  }

  // Juega una carta de la mano como Acción (los objetivos se eligen a favor del jugador)
  humanoAccion(idx) {
    this.jugarAccion(this.turno.i, idx);
  }

  humanoMana(idx) {
    const j = this.jug[this.turno.i];
    this.turno.manaUsadas.push(j.mano.splice(idx, 1)[0]);
  }

  // Devuelve a la mano una carta usada como Maná, si ese Maná no se ha gastado
  humanoDevolver(k) {
    const c = this.turno.manaUsadas[k];
    if (!c || this.manaDisponible() < c.mana) return false;
    this.jug[this.turno.i].mano.push(...this.turno.manaUsadas.splice(k, 1));
    return true;
  }

  puedeVincular(u) {
    const c = this.umbral[u];
    return !!c && !this.turno.vinculado && this.coste(this.turno.i, c) <= this.manaDisponible();
  }

  humanoVincular(u) {
    if (!this.puedeVincular(u)) return false;
    const i = this.turno.i;
    const c = this.umbral.splice(u, 1)[0];
    this.turno.gastado += this.coste(i, c);
    this.turno.vinculado = true;
    this.jug[i].desc.push(c);
    this.jug[i].vinculadas++;
    this.anotar({ i, tipo: 'vincula', carta: c.nombre });
    this.reponer();
    return true;
  }

  // Liberar: devolver a la caja una carta inicial jugada este turno (donde: 'jugadas' o 'mana')
  puedeLiberar() {
    return this.v.liberar && !this.turno.liberado && this.manaDisponible() >= this.v.liberarCoste;
  }

  humanoLiberar(donde, k) {
    const j = this.jug[this.turno.i];
    const lista = donde === 'mana' ? this.turno.manaUsadas : j.jugadas;
    const c = lista[k];
    if (!c || !c.inicial || !this.puedeLiberar()) return false;
    // si se libera una carta usada como Maná, su Maná sigue contando: pagas con el resto
    lista.splice(k, 1);
    if (donde === 'mana') this.turno.gastado -= c.mana;
    this.turno.gastado += this.v.liberarCoste;
    this.turno.liberado = true;
    j.liberadas++;
    this.anotar({ i: this.turno.i, tipo: 'libera', carta: c.nombre });
    return true;
  }

  // --- Deshacer dentro del turno de una persona ---------------------------------------------
  // Copia de todo lo que puede cambiar durante un turno (sin robar ni barajar: eso no se deshace)
  guardarEstado() {
    const copia = (cs) => cs.slice();
    return {
      jug: this.jug.map((j) => ({ ...j, mazo: copia(j.mazo), mano: copia(j.mano), desc: copia(j.desc), jugadas: copia(j.jugadas), selloEra: copia(j.selloEra) })),
      pres: this.foto(),
      umbral: copia(this.umbral),
      pila: copia(this.pila),
      turno: { ...this.turno, manaUsadas: copia(this.turno.manaUsadas) },
      registro: this.registro ? this.registro.length : 0,
      extra: copia(this.extra),
    };
  }

  restaurarEstado(e) {
    this.jug = e.jug.map((j) => ({ ...j, mazo: j.mazo.slice(), mano: j.mano.slice(), desc: j.desc.slice(), jugadas: j.jugadas.slice(), selloEra: j.selloEra.slice() }));
    for (const s of ELEMENTOS) this.pres[s] = e.pres[s].map((x) => ({ ...x }));
    this.umbral = e.umbral.slice();
    this.pila = e.pila.slice();
    this.turno = { ...e.turno, manaUsadas: e.turno.manaUsadas.slice() };
    if (this.registro) this.registro.length = e.registro;
    this.extra = e.extra.slice();
  }

  humanoTerminar() {
    const j = this.jug[this.turno.i];
    this.anotar({ i: this.turno.i, tipo: 'fin', comoMana: this.turno.manaUsadas.map((c) => c.nombre), sinUsar: j.mano.map((c) => c.nombre),
      manaSobrante: this.manaDisponible() });
    j.desc.push(...j.jugadas, ...this.turno.manaUsadas, ...j.mano);
    j.jugadas = [];
    j.mano = [];
    this.turno.manaUsadas = [];
    this.robar(j, this.v.mano);
    this.st.turnos++;
    this.terminarTurno();
  }

  // --- Guardar y cargar la partida entera (para jugar en red) -------------------------------
  // Las cartas se guardan por su nombre; el azar continúa con una semilla nueva.
  exportar() {
    const fuera = new Set(['v', 'rng', 'st', 'captura', 'accionEnCurso']);
    const datos = {};
    for (const [k, x] of Object.entries(this)) if (!fuera.has(k)) datos[k] = x;
    return JSON.stringify(datos, (k, x) => (x && typeof x === 'object' && typeof x.nombre === 'string' && Array.isArray(x.accion) ? { '@c': x.nombre } : x));
  }

  importar(texto, semilla) {
    const porNombre = new Map([...this.v.cartas, ...INICIAL].map((c) => [c.nombre, c]));
    Object.assign(this, JSON.parse(texto, (k, x) => (x && typeof x === 'object' && x['@c'] ? porNombre.get(x['@c']) : x)));
    this.rng = rngFrom(semilla);
    return this;
  }
}

module.exports = { Partida, BASE, V01, fuerza, rngFrom };
