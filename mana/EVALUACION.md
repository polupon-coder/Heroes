# MANA — Valoración del reglamento provisional v0.1

Reglas: [REGLAS.md](REGLAS.md). Datos: 400 partidas completas por variante y número de jugadores, jugadas por bots (`node mana/simular.js 400`). Los bots valoran cada jugada por los Fragmentos que esperan ganar en la Era y por la fuerza de lo que vinculan; juegan con sensatez pero miran poco hacia delante (no explotan bien la última palabra ni hacen *kingmaking*). Las cifras indican tendencias, no sustituyen a jugar en mesa.

## Lo que funciona

- **Identidad clara.** Cuatro elementos con verbo propio (presionar, ciclar, aguantar, manipular), sin eliminación y con la escalada 1-2-3 de las Eras. El código visual de tres esferas (gris, lila, elemento) es legible y escalable.
- **Remontada real.** La Era III cambia el ganador en el 44-55 % de las partidas: perder la Era I no condena a nadie.
- **Empate = nadie puntúa (regla 23).** Da una herramienta de bloqueo al que va detrás y se da en un 4 % (2 jugadores) a 13 % (4 jugadores) de los Santuarios: lo bastante para importar, no tanto como para frustrar. Probé repartir los empates y no mejora nada; **conservaría la regla tal cual**.
- **Duración.** 15 turnos por jugador, mazo final de unas 22-24 cartas: encaja en 30-45 minutos.

## Problemas, de más a menos graves

### 1. «1 Acción por turno» vacía el Principio fundamental (regla 14)

Con una sola Acción, la pregunta «¿Acción o Maná?» se reduce a «¿cuál es mi mejor carta?»: todas las demás son Maná. Consecuencias medidas (4 jugadores):

- **Las cartas de robar/recuperar no sirven para nada.** Lo robado ya no puede jugarse como Acción, solo como Maná, y el Elemental que roba ya daba 1 de Maná. Ascua, Manantial, Brote, Inspiración, Fluir, Retorno, Oleaje y Renacer se juegan como Acción entre el **0 y el 2 %** de las veces. **El Agua entera («Ciclo») queda sin función.**
- **Muy poca Presencia:** 5,7 por jugador y Era (una Acción por turno, casi siempre la de +2).
- **Maná desperdiciado:** 2,2 de Maná sobrante por turno en la Era III. El mazo mejora, pero solo se nota en la única carta que eliges.

**Propuesta:** cada carta jugada se usa **como Acción o como Maná**, sin límite de Acciones (como en Dominion/Star Realms, pero con la decisión explícita en cada carta). Resultado:

| 4 jugadores | v0.1 | Acciones ilimitadas |
| --- | ---: | ---: |
| Presencia por jugador y Era | 5,7 | 13,7 |
| Acciones por turno | 0,88 | 2,70 |
| Maná sobrante por turno (Era III) | 2,2 | 0,5 |
| Ascua / Manantial / Brote / Inspiración como Acción | 1-2 % | 72-76 % |
| Fluir / Oleaje / Renacer como Acción | 0-2 % | 36-79 % |
| Partidas con victoria compartida | 20 % | 14 % |

Ahora sí cada carta es un dilema: jugar la Llama te da +2 🔥 pero te deja sin el Maná para la carta de 6.

### 2. La Protección no protege de nada (reglas 19-20 y cartas de Tierra)

- Solo el Fuego retira, y **solo del Santuario del Fuego**. Solo el Aire mueve Presencias rivales, y **solo desde el Santuario del Aire**.
- La Tierra solo protege **🌿**, y **nada en el juego puede atacar 🌿**. Fortificar y Bastión son cartas en blanco; la parte «protegida» de Raíces profundas y Tierra ancestral, también.
- Además la Protección caduca al empezar tu turno: con una sola Acción tendrías que gastarla cada turno en renovarla.
- Por extensión, **💧 y 🌿 son carreras sin interacción**; solo 🔥 y 💨 se disputan.

**Propuestas:**
- Fuego retira de **cualquier** Santuario (su Santuario sigue siendo su fuerte por los +N 🔥). Ej.: Quemadura «Retira 1 Presencia rival de cualquier Santuario»; Incendio «Retira hasta 2 rivales de un mismo Santuario».
- Aire mueve desde **cualquier** Santuario. Desvío: «Mueve 1 Presencia rival de un Santuario a otro»; el jugador activo elige el destino.
- Tierra protege en **cualquier** Santuario, y la Protección **dura hasta el final de la Era**. Fortificar: «Protege 2 Presencias propias»; Bastión: «Protege todas tus Presencias de un Santuario».

Así la Tierra es la respuesta al Fuego y al Aire en los cuatro Santuarios, y el «Intenta moverme» se cumple.

### 3. Orden de turno: el jugador inicial rota cada ronda (regla 21)

- Con 2 jugadores el orden queda A-B | B-A | A-B…: B juega dos turnos seguidos, A espera tres. Medido: el primer asiento gana un **45 %** frente al 33 % del segundo (resto, empates).
- El último turno antes de puntuar no tiene respuesta. Con 4 jugadores y 3 Eras, uno de los cuatro nunca lo tiene y otro lo tiene justo en la Era III, que vale el triple.

**Propuesta:** orden horario fijo durante cada Era; **empieza cada Era quien vaya primero en Fragmentos** (en la Era I, al azar). Así el último turno, el que decide, lo tiene quien va detrás: refuerza la remontada sin reglas extra. Para 2 jugadores conviene además compensar al segundo (por ejemplo, que el primero robe 4 cartas en su primer turno); hay que probarlo en mesa.

### 4. Cartas repetidas entre elementos

Las cuatro familias comparten las mismas tres primeras cartas (+1, +2, Roba 1 con coste 2/3/2): 12 de los 32 tipos son la misma carta con otro color. Propongo que la carta barata de robo sea distinta en cada elemento y acentúe su personalidad: por ejemplo, Fuego «+1 🔥 si tienes menos 🔥 que algún rival, si no roba 1»; Aire «Roba 1 y mira las 3 primeras de tu mazo»; Tierra «+1 🌿 protegida»; el Agua conserva Manantial.

### 5. El mazo inicial no se puede adelgazar

Al final hay 22-24 cartas, de las que 10 siguen siendo las iniciales (más del 40 %). La sensación de «Mejora» se diluye. **Propuesta:** al vincular un Elemental puedes **liberar** (devolver a la caja) una carta inicial que hayas usado ese turno. Temático y sin cartas nuevas.

### 6. Costes de 5 poco atractivos

Las cartas de coste 4 dan 2 de Maná y las de 5, también 2: Incendio, Renacer y Bastión pagan 1 más que las de 4 por poco. Con Acciones ilimitadas Incendio se juega como Acción solo la mitad de las veces y Renacer menos. Subiría su Acción (Renacer: «Recupera 1 carta del descarte a tu mano y roba 1») o bajaría su coste a 4.

### 7. Nombres

- **«Fragmentos de Maná»** (puntos) choca con **Maná** (recurso del turno) y con **Mota de Maná** (carta): en mesa sale «¿pago con Fragmentos?». Sugerencias para los puntos: **Favor**, **Ecos**, **Sellos** o **Reliquias** de los Santuarios.
- **«Círculo»** aparece en las secciones 2 y 32 sin definir: decir que es el mazo del Guardián (mazo + mano + descarte).
- Las cartas iniciales tienen «coste no relevante»: mejor que **no lleven esfera de Coste** (así se distinguen a simple vista).

### 8. Dudas de reglas que conviene cerrar

- **Desorden:** ¿el rival elige qué descarta o es al azar? (los rivales tienen mano entre turnos porque roban 5 al terminar.)
- **Desvío / Torbellino:** ¿quién elige el Santuario de destino? (propuesta: el jugador activo).
- **Gran marea:** «recupera 1 carta sobre tu mazo» = «pon 1 carta de tu descarte sobre tu mazo» (igual que Retorno). Unificar la redacción.
- **Crecimiento:** «si ya tienes 🌿», ¿al menos 1 Presencia? Con las cartas iniciales casi siempre se cumple; quizá «si vas primero en 🌿».
- **Cambio de viento:** ¿qué pasa con la carta descartada? ¿Puede vincularse después el Elemental revelado en el mismo turno?
- **Empate final:** desempatar por más Fragmentos en la Era III y, si persiste, compartir la victoria. Hoy lo comparten un 20 % de las partidas a 4.

## Propuesta v0.2 (resumen)

1. Cada carta jugada: **Acción o Maná**, sin límite de Acciones. Se sigue vinculando **1 Elemental** por turno.
2. Fuego retira y Aire mueve en **cualquier** Santuario; Tierra protege en cualquiera y la Protección **dura hasta el final de la Era**.
3. Orden horario fijo; **empieza cada Era quien vaya primero**.
4. Al vincular puedes **liberar** una carta inicial usada en ese turno.
5. Cartas baratas distintas por elemento; revisar las de coste 5.
6. Renombrar los puntos (no «Fragmentos de Maná»).
7. Empate final: gana quien más Fragmentos hizo en la Era III.

Los puntos 1 y 3 y la duración de la Protección ya están en el simulador (`motor.js`, opciones `acciones`, `rotacion`, `proteccion`). Los cambios de cartas (2, 4, 5) se pueden probar editando [`cartas.js`](cartas.js).

## Resultados completos


## 2 jugadores (400 partidas por variante)

| Medida | Reglamento provisional | Acciones ilimitadas | Propuesta (v0.2) |
| --- | ---: | ---: | ---: |
| empate en cabeza (nadie puntúa) | 4 % | 5 % | 4 % |
| Santuarios vacíos | 1 % | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 13.6 | 13.6 |
| Acciones por turno | 0.86 | 2.61 | 2.62 |
| Maná sobrante por turno (Era I/II/III) | 0.8 / 1.3 / 2.3 | 0.1 / 0.2 / 0.7 | 0.1 / 0.2 / 0.8 |
| Turnos con vinculación | 93 % | 82 % | 82 % |
| Cartas en el mazo al final | 24.0 | 22.3 | 22.3 |
| Fragmentos medios por jugador | 11.4 | 11.5 | 11.6 |
| Fragmentos por Era (I/II/III) | 1.9 / 3.8 / 5.8 | 1.9 / 3.9 / 5.8 | 1.9 / 3.9 / 5.8 |
| Diferencia 1º-2º | 3.0 | 4.4 | 4.7 |
| Empate final (victoria compartida) | 22 % | 12 % | 10 % |
| Victorias por asiento | 45 % / 33 % | 50 % / 38 % | 51 % / 39 % |
| Fragmentos extra del último en jugar la Era | -0.16 | -0.30 | -0.16 |
| La Era III cambia el ganador | 44 % | 38 % | 33 % |
| Retiradas / movimientos por partida | 1.9 / 0.5 | 4.4 / 1.8 | 4.6 / 1.8 |

## 3 jugadores (400 partidas por variante)

| Medida | Reglamento provisional | Acciones ilimitadas | Propuesta (v0.2) |
| --- | ---: | ---: | ---: |
| empate en cabeza (nadie puntúa) | 9 % | 9 % | 9 % |
| Santuarios vacíos | 0 % | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 13.8 | 13.8 |
| Acciones por turno | 0.87 | 2.71 | 2.71 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.2 / 2.2 | 0.1 / 0.1 / 0.6 | 0.1 / 0.1 / 0.6 |
| Turnos con vinculación | 93 % | 81 % | 81 % |
| Cartas en el mazo al final | 24.0 | 22.2 | 22.1 |
| Fragmentos medios por jugador | 7.3 | 7.3 | 7.3 |
| Fragmentos por Era (I/II/III) | 1.2 / 2.5 / 3.6 | 1.2 / 2.5 / 3.7 | 1.2 / 2.5 / 3.7 |
| Diferencia 1º-2º | 2.8 | 3.0 | 2.9 |
| Empate final (victoria compartida) | 13 % | 11 % | 13 % |
| Victorias por asiento | 34 % / 33 % / 22 % | 32 % / 30 % / 27 % | 30 % / 33 % / 24 % |
| Fragmentos extra del último en jugar la Era | -0.09 | -0.18 | -0.12 |
| La Era III cambia el ganador | 51 % | 50 % | 55 % |
| Retiradas / movimientos por partida | 3.5 / 1.6 | 7.6 / 3.2 | 7.8 / 3.0 |

## 4 jugadores (400 partidas por variante)

| Medida | Reglamento provisional | Acciones ilimitadas | Propuesta (v0.2) |
| --- | ---: | ---: | ---: |
| empate en cabeza (nadie puntúa) | 13 % | 12 % | 12 % |
| Santuarios vacíos | 0 % | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 13.7 | 13.7 |
| Acciones por turno | 0.88 | 2.70 | 2.70 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.3 / 2.2 | 0.1 / 0.1 / 0.5 | 0.1 / 0.1 / 0.5 |
| Turnos con vinculación | 93 % | 81 % | 81 % |
| Cartas en el mazo al final | 24.0 | 22.2 | 22.2 |
| Fragmentos medios por jugador | 5.3 | 5.3 | 5.3 |
| Fragmentos por Era (I/II/III) | 0.8 / 1.8 / 2.7 | 0.9 / 1.8 / 2.6 | 0.8 / 1.8 / 2.7 |
| Diferencia 1º-2º | 1.9 | 2.5 | 2.3 |
| Empate final (victoria compartida) | 20 % | 14 % | 11 % |
| Victorias por asiento | 22 % / 17 % / 22 % / 19 % | 25 % / 17 % / 23 % / 21 % | 22 % / 27 % / 19 % / 21 % |
| Fragmentos extra del último en jugar la Era | -0.03 | -0.10 | -0.02 |
| La Era III cambia el ganador | 55 % | 54 % | 54 % |
| Retiradas / movimientos por partida | 5.0 / 2.2 | 10.5 / 4.0 | 10.6 / 4.2 |

## Veces que cada carta se juega como Acción (4 jugadores)

| Carta | Coste | Reglamento provisional | Acciones ilimitadas |
| --- | ---: | ---: | ---: |
| Chispa | 2 | 14 % | 67 % |
| Llama | 3 | 62 % | 85 % |
| Ascua | 2 | 1 % | 72 % |
| Quemadura | 3 | 8 % | 48 % |
| Embestida | 4 | 38 % | 63 % |
| Fuego voraz | 4 | 37 % | 64 % |
| Incendio | 5 | 19 % | 50 % |
| Llama de conquista | 6 | 67 % | 75 % |
| Gota | 2 | 15 % | 66 % |
| Corriente | 3 | 60 % | 86 % |
| Manantial | 2 | 1 % | 74 % |
| Fluir | 3 | 2 % | 79 % |
| Retorno | 3 | 0 % | 21 % |
| Oleaje | 4 | 0 % | 36 % |
| Renacer | 5 | 0 % | 47 % |
| Gran marea | 6 | 50 % | 67 % |
| Semilla | 2 | 15 % | 61 % |
| Raíz | 3 | 57 % | 82 % |
| Brote | 2 | 2 % | 76 % |
| Fortificar | 3 | 0 % | 20 % |
| Raíces profundas | 4 | 11 % | 42 % |
| Crecimiento | 4 | 18 % | 57 % |
| Bastión | 5 | 0 % | 11 % |
| Tierra ancestral | 6 | 47 % | 63 % |
| Brisa | 2 | 18 % | 70 % |
| Ráfaga | 3 | 66 % | 88 % |
| Inspiración | 2 | 1 % | 76 % |
| Desorden | 3 | 0 % | 20 % |
| Cambio de viento | 3 | 5 % | 30 % |
| Desvío | 4 | 8 % | 36 % |
| Corriente ascendente | 4 | 3 % | 62 % |
| Torbellino | 6 | 48 % | 69 % |
