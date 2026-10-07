# MANA — Reglamento provisional v0.1

**2–4 jugadores · 30–45 minutos · Construcción de mazo**

Cada jugador representa a un **Guardián** capaz de vincularse con espíritus elementales de Fuego, Agua, Tierra y Aire. Durante la partida, los Guardianes atraen nuevos **Elementales** desde **el Umbral**, mejoran progresivamente su mazo y utilizan sus poderes para aumentar su presencia en los cuatro **Santuarios Elementales**.

No hay vidas ni eliminación de jugadores. La partida dura **3 Eras**. Al final de cada Era, los Santuarios recompensan a los Guardianes con mayor Presencia.

> Valoración y propuestas de cambio, con datos de partidas simuladas: [EVALUACION.md](EVALUACION.md).

## 1. Objetivo

Conseguir más **Fragmentos de Maná** que los demás Guardianes al finalizar la tercera Era.

Santuarios: 🔥 Fuego · 💧 Agua · 🌿 Tierra · 💨 Aire.

| Era | Valor de cada Santuario |
| --- | ---: |
| Era I | 1 Fragmento |
| Era II | 2 Fragmentos |
| Era III | 3 Fragmentos |

## 2. Los Guardianes

Cada jugador controla a un Guardián. No combaten directamente entre sí ni pueden ser eliminados. Todos comienzan en igualdad de condiciones.

## 3. Los Elementales

Las cartas representan Elementales vinculados a uno de los cuatro elementos. Los baratos son criaturas pequeñas y sencillas; los de mayor coste, seres más grandes, antiguos o extraordinarios. Esta progresión debe percibirse también visualmente.

## 4. Componentes

- 4 Santuarios.
- 32 tipos de Elemental × 3 copias: **96 cartas de Umbral**.
- 40 cartas iniciales.
- Marcadores de Presencia de cada jugador, marcadores de Protección, marcador de Era y Ronda, Fragmentos de Maná.

## 5–10. Aspecto de un Elemental

Sin marco tradicional: **ilustración** (la mayor parte de la carta), **nombre** debajo y tres esferas siempre en el orden **COSTE — MANÁ — ACCIÓN**.

- **Coste** (izquierda): siempre **gris**. Maná necesario para vincularlo desde el Umbral (2–6).
- **Maná** (centro): siempre **lila**. Maná que genera al usarla como recurso (1–3). Una carta usada como Maná no puede usar su Acción ese turno.
- **Acción** (derecha):
  - Si afecta a un Santuario, usa el color y la forma del elemento: 🔥 rojo/llama, 💨 amarillo/viento, 💧 azul/agua, 🌿 verde/naturaleza. **+2 🔥** = añade 2 Presencias tuyas al Santuario del Fuego.
  - Si no, color identificativo sin forma de Santuario y un símbolo: carta + flecha a la mano (roba), carta + flecha circular (recupera), carta + X (descarta), dos cartas con flechas (cambia), marcador + escudo (protege), marcador + flecha (mueve), marcador rival −1 (retira).

Ejemplo — **Zorrito de Brasas**: ⚪ 3 · 🟣 1 · 🔥 +2.

## 11. Principio fundamental

Cada Elemental se usa **como Acción o como Maná**, nunca ambas el mismo turno.

## 12. Mazo inicial (10 cartas)

| Carta | Cantidad | Maná | Acción |
| --- | ---: | ---: | --- |
| Elemental menor de Fuego / Agua / Tierra / Aire | 2 de cada | 1 | +1 en su Santuario |
| Mota de Maná | 2 | 1 | — |

Cada jugador baraja y roba **5**.

## 13. El Umbral

5 Elementales boca arriba. Al vincular uno: paga su coste, va a tu descarte y se revela otro.

## 14. Turno

1. **Acción:** como máximo **1 Elemental** como Acción.
2. **Generar Maná:** cualquier cantidad de las cartas restantes.
3. **Vincular:** como máximo **1 Elemental** del Umbral, pagando su coste completo; va al descarte.
4. **Final:** descarta lo usado y lo que quede en la mano; roba 5 (si se acaba el mazo, baraja el descarte).

## 15. El Maná

Solo existe durante el turno; no se almacena.

## 16–17. Presencia y Santuarios

Las Presencias permanecen toda la Era salvo que una Acción las retire o desplace. Sin límite por Santuario. Al final de cada Era los Santuarios reconocen a quien tenga más Presencia y se vacían.

## 18. Interacción

Se puede retirar, mover y proteger Presencias, modificar manos y cambiar el Umbral. Ninguna carta destruye o roba cartas del mazo rival, elimina Guardianes ni quita Fragmentos.

## 19. Protección

Una Presencia protegida no puede retirarse ni moverse. Dura hasta el comienzo del siguiente turno de su propietario.

## 20. Mover Presencias

Una Presencia movida cuenta en el Santuario de destino. Una protegida no se mueve.

## 21. Rondas y Eras

Cada Era dura **5 rondas**. Tras cada ronda, el jugador inicial pasa al siguiente en sentido horario. Tras la quinta ronda se puntúan los Santuarios.

## 22–23. Puntuación y empates

En cada Santuario, quien tenga más Presencia gana el valor de la Era. Si hay empate en cabeza, **nadie** puntúa ese Santuario.

## 24. Final de una Era

Retira Presencias y Protecciones, los Guardianes conservan sus Elementales, descarta el Umbral y revela 5 nuevos, avanza la Era.

## 25. Fin de partida

Tras puntuar la tercera Era gana quien tenga más Fragmentos; los empatados comparten la victoria.

## 26. Personalidad de los elementos

- 🔥 **Fuego — Presión:** retira Presencia rival. «Te saco de aquí.»
- 💧 **Agua — Ciclo:** roba, recupera y reutiliza. «Mis mejores espíritus vuelven una y otra vez.»
- 🌿 **Tierra — Permanencia:** protege y consolida. «Intenta moverme.»
- 💨 **Aire — Manipulación:** altera posiciones, manos y Umbral. «Cambio tus planes.»

## 27–30. Elementales

Las 32 cartas, con su coste, Maná y Acción, están en [`cartas.js`](cartas.js) (tabla única para el simulador y, más adelante, para el juego).

### 🔥 Fuego

| Elemental | Coste | Maná | Acción |
| --- | ---: | ---: | --- |
| Chispa | 2 | 1 | +1 🔥 |
| Llama | 3 | 1 | +2 🔥 |
| Ascua | 2 | 1 | Roba 1 |
| Quemadura | 3 | 1 | Retira 1 Presencia rival de 🔥 |
| Embestida | 4 | 2 | +1 🔥 y retira 1 rival de 🔥 |
| Fuego voraz | 4 | 2 | Si un rival tiene más 🔥 que tú, +2 🔥; si no, +1 |
| Incendio | 5 | 2 | Retira hasta 2 Presencias rivales de 🔥 |
| Llama de conquista | 6 | 3 | +2 🔥 y retira 1 rival de 🔥 |

### 💧 Agua

| Elemental | Coste | Maná | Acción |
| --- | ---: | ---: | --- |
| Gota | 2 | 1 | +1 💧 |
| Corriente | 3 | 1 | +2 💧 |
| Manantial | 2 | 1 | Roba 1 |
| Fluir | 3 | 1 | Roba 2 y descarta 1 |
| Retorno | 3 | 1 | Pon 1 carta de tu descarte sobre tu mazo |
| Oleaje | 4 | 2 | Roba 2 y coloca 1 carta de tu mano sobre el mazo |
| Renacer | 5 | 2 | Recupera 1 carta del descarte a tu mano |
| Gran marea | 6 | 3 | +2 💧 y recupera 1 carta sobre tu mazo |

### 🌿 Tierra

| Elemental | Coste | Maná | Acción |
| --- | ---: | ---: | --- |
| Semilla | 2 | 1 | +1 🌿 |
| Raíz | 3 | 1 | +2 🌿 |
| Brote | 2 | 1 | Roba 1 |
| Fortificar | 3 | 1 | Protege 1 🌿 propia |
| Raíces profundas | 4 | 2 | +1 🌿 protegida |
| Crecimiento | 4 | 2 | Si ya tienes 🌿, añade +2 🌿 |
| Bastión | 5 | 2 | Protege hasta 2 🌿 propias |
| Tierra ancestral | 6 | 3 | +2 🌿 protegidas |

### 💨 Aire

| Elemental | Coste | Maná | Acción |
| --- | ---: | ---: | --- |
| Brisa | 2 | 1 | +1 💨 |
| Ráfaga | 3 | 1 | +2 💨 |
| Inspiración | 2 | 1 | Roba 1 |
| Desorden | 3 | 1 | Un rival descarta 1 y roba 1 |
| Cambio de viento | 3 | 1 | Descarta 1 Elemental del Umbral y repónlo |
| Desvío | 4 | 2 | Mueve 1 Presencia rival de 💨 a otro Santuario |
| Corriente ascendente | 4 | 2 | Mueve 1 Presencia propia a 💨 y roba 1 |
| Torbellino | 6 | 3 | Mueve hasta 2 Presencias rivales de 💨 y añade +1 💨 |

## 31. Resumen de turno

**1 Acción → generar Maná → vincular 1 Elemental → descartar → robar 5.**

## 32. Idea central

**Mejora** (tu Círculo es más poderoso al final), **Interacción** (los Santuarios obligan a mirar a los demás) y **Remontada** (perder una Era no te deja fuera). Los Santuarios se reinician. **Tu mazo no.**
