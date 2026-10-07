# Genera mesa-anotada.html: la maqueta en tres columnas con marcadores numerados
# y, encima, una franja que explica qué es cada cosa.
# Uso: python3 anotar.py  (después, captura a pantalla completa con Playwright, 1920 px de ancho)
fuente = open('mesa-columnas.html', encoding='utf-8').read()

NOTAS = [
    # (selector del elemento, esquina del marcador, título, explicación)
    ('.lado.izq .jug', 'izq', 'Tú', 'Guardián del Fuego (rojo). El número rodeado son tus Sellos.'),
    ('.centro .era b', 'antes', 'Era y ronda', 'Era II, ronda 3 de 5. En esta Era cada Santuario da 2 Sellos.'),
    ('.lado.der', 'izq', 'Rivales', 'Ana (Agua), Pol (Tierra) y Marc (Aire), con sus Sellos.'),
    ('.lateral', 'izq', 'Umbral', 'Elementales que puedes vincular. Los atenuados cuestan más Maná del que tienes.'),
    ('#umbral .fila-u .esferas', 'izq', 'Esferas', 'Coste (gris) · Maná que da (lila) · Acción, del color del Santuario al que afecta.'),
    ('#umbral > .fila-u:nth-child(4) .esf.a', 'der', 'Dos efectos', 'Esfera partida: Embestida da +1 🔥 y retira 1 Presencia rival.'),
    ('.lateral .boton', 'izq', 'Vincular', 'Pagas el Coste con tu Maná y el Elemental va a tu descarte.'),
    ('.arriba .pila:first-child .dorso', 'izq', 'Mazo', 'Cartas que te quedan por robar.'),
    ('.total', 'izq', 'Maná del turno', 'Suma de las cartas usadas como Maná. Lo que sobra se pierde.'),
    ('.arriba .pila:last-child .dorso', 'izq', 'Descarte', 'Cartas usadas. Se barajan cuando se acaba el mazo.'),
    ('.mano .carta.accion .ilus', 'izq', 'Acción', 'Carta jugada por su poder (marco negro): Llama pone +2 Presencias en Fuego.'),
    ('.mano .carta.usada .ilus', 'izq', 'Maná', 'Cartas usadas como Maná (marco lila): no hacen su Acción.'),
    ('.mano .carta:nth-child(5) .ilus', 'izq', 'Sin jugar', 'Las cartas que no juegues se descartan al acabar el turno.'),
    ('.principal > .boton', 'izq', 'Terminar turno', 'Descartas todo y robas 5 cartas nuevas.'),
    ('.derecha .sant:nth-child(1)', 'izq', 'Santuario', 'Un cuadrante por Guardián, en el orden de la cabecera. Cada bolita es una Presencia; las más grandes, quien va primero.'),
    ('.derecha .sant:nth-child(2) .marca', 'fuera', 'Empate', 'Empate en cabeza: nadie gana los Sellos de ese Santuario.'),
    ('.derecha .sant:nth-child(3) .cuad:nth-child(3) .puntos', 'fuera', 'Protegida', 'Anillo: Presencia que no se puede retirar ni mover.'),
    ('.derecha .sant:nth-child(4)', 'izq', 'Final de Era', 'En cada Santuario, quien tiene más Presencia gana sus Sellos. Luego se vacía.'),
]

import json
capa = '''
<style>
  html { background: var(--fondo); }
  body { position: relative; margin-top: 250px !important; overflow: visible; }
  .leyenda { position: absolute; left: 40px; right: 40px; top: -232px; height: 214px; background: #fff; border-radius: 18px;
    padding: 18px 22px; display: grid; grid-template-columns: repeat(6, 1fr); grid-template-rows: repeat(3, auto);
    column-gap: 18px; row-gap: 12px; align-content: center; }
  .leyenda h2 { position: absolute; top: -2px; left: 22px; transform: translateY(-50%); font-size: 11px; letter-spacing: .16em;
    text-transform: uppercase; background: var(--fondo); color: var(--suave); padding: 0 8px; font-weight: 600; }
  .item { display: grid; grid-template-columns: 18px 1fr; gap: 7px; font-size: 9.5px; line-height: 1.35; color: var(--suave); }
  .item b { display: block; color: var(--tinta); font-size: 10.5px; }
  .num { width: 18px; height: 18px; border-radius: 50%; background: #1d1d1f; color: #fff; font-size: 9.5px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; }
  .marcador { position: absolute; z-index: 20; width: 20px; height: 20px; border-radius: 50%; background: #1d1d1f; color: #fff;
    font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,.25); }
</style>
<script>
  const NOTAS = ''' + json.dumps(NOTAS, ensure_ascii=False) + ''';
  const leyenda = document.createElement('div');
  leyenda.className = 'leyenda';
  leyenda.innerHTML = '<h2>Qué es cada cosa</h2>' + NOTAS.map(([, , t, x], k) =>
    `<div class="item"><span class="num">${k + 1}</span><div><b>${t}</b>${x}</div></div>`).join('');
  document.body.appendChild(leyenda);
  // la página está ampliada (zoom): las medidas vienen ampliadas y hay que dividirlas
  const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
  const caja = document.body.getBoundingClientRect();
  NOTAS.forEach(([sel, esquina], k) => {
    const el = document.querySelector(sel);
    if (!el) { console.log('falta', sel); return; }
    const r = el.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'marcador';
    m.textContent = k + 1;
    let x = ((esquina === 'der' ? r.right : r.left) - caja.left) / z - 10;
    let y = (r.top - caja.top) / z - 10;
    if (esquina === 'fuera') { x = (r.right - caja.left) / z + 6; y = ((r.top + r.bottom) / 2 - caja.top) / z - 10; }
    if (esquina === 'antes') { x = (r.left - caja.left) / z - 26; y = ((r.top + r.bottom) / 2 - caja.top) / z - 10; }
    if (esquina === 'abajo') { x = ((r.left + r.right) / 2 - caja.left) / z - 10; y = (r.bottom - caja.top) / z + 3; }
    m.style.left = x + 'px';
    m.style.top = y + 'px';
    document.body.appendChild(m);
  });
</script>
'''
salida = fuente.replace('</body>', capa + '</body>').replace('<title>MANA — mesa (columnas)</title>', '<title>MANA — mesa explicada</title>')
open('mesa-anotada.html', 'w', encoding='utf-8').write(salida)
