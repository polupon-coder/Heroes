# MANA — Valoración y cambios

Reglas vigentes: [REGLAS.md](REGLAS.md) (**v0.2**). Datos: 400 partidas completas por versión y número de jugadores, jugadas por bots (`node mana/simular.js 400`). Los bots valoran cada jugada por los Sellos que esperan ganar en la Era y por la fuerza de lo que vinculan; juegan con sensatez pero miran poco hacia delante (no explotan del todo la última palabra ni hacen *kingmaking*). Las cifras indican tendencias, no sustituyen a jugar en mesa.

## Cambios de la v0.1 a la v0.2

| # | Problema en la v0.1 | Cambio en la v0.2 |
| --- | --- | --- |
| 1 | Con **1 Acción por turno**, lo robado solo servía como Maná: las 8 cartas de robar/recuperar se jugaban como Acción el 0-2 % de las veces y el Agua no tenía función. Además sobraban 2,2 de Maná por turno en la Era III. | Cada carta jugada es **Acción o Maná, sin límite de Acciones**. Se sigue vinculando 1 Elemental por turno. |
| 2 | La **Protección no protegía de nada**: el Fuego solo retiraba en 🔥, el Aire solo movía desde 💨 y la Tierra solo protegía en 🌿, donde nadie ataca. 💧 y 🌿 eran carreras sin interacción. | El Fuego **retira** y el Aire **mueve** en cualquier Santuario; la Tierra **protege** en cualquiera y la Protección **dura hasta el final de la Era**. |
| 3 | El jugador inicial rotaba cada ronda: con 2 jugadores uno jugaba dos turnos seguidos (45 % frente a 33 % de victorias) y con 4 uno nunca tenía el último turno de una Era. | Orden horario fijo. **Empieza cada Era quien tiene más Sellos**: el último turno, que no tiene respuesta, lo juega quien va detrás. |
| 4 | El mazo inicial no se podía adelgazar: al final, 10 de 24 cartas seguían siendo las iniciales. | **Liberar:** tras vincular, puedes pagar 1 Maná para devolver a la caja 1 carta inicial jugada ese turno. |
| 5 | Las cartas de coste 5 daban lo mismo que las de 4 pagando 1 más. | **Incendio:** +1 🔥 además de retirar 2. **Renacer:** además roba 1. **Bastión:** protege todas tus Presencias de un Santuario y +1 🌿 protegida. |
| 6 | «Fragmentos de Maná» se confundía con el Maná del turno y con la Mota de Maná. | Los puntos se llaman **Sellos**. Se define el **Círculo**; las cartas iniciales no llevan esfera de Coste. |
| 7 | Dudas de redacción y un 19 % de victorias compartidas con 4 jugadores. | Elige siempre el jugador activo (y en Desorden el rival elige su descarte), Gran marea redactada como Retorno, Crecimiento «al menos 1 🌿», Cambio de viento permite vincular el nuevo, **desempate final por Sellos de la Era III**. |

La regla de empate en un Santuario (nadie puntúa) **se mantiene**: frena al líder sin frustrar y repartir los empates no mejoraba nada.

### Resultado (4 jugadores)

| | v0.1 | v0.2 |
| --- | ---: | ---: |
| Presencia puesta por jugador y Era | 5,7 | 14,3 |
| Acciones por turno | 0,88 | 2,83 |
| Maná sobrante por turno en la Era III | 2,2 | 0,3 |
| Retiradas / movimientos por partida | 4,9 / 2,1 | 21,4 / 10,2 |
| Cartas en el mazo al final (iniciales liberadas) | 24 (0) | 15 (6,6) |
| Victoria compartida | 19 % | 8 % |
| La Era III cambia el ganador | 57 % | 69 % |
| Victorias por asiento | 22 / 19 / 20 / 21 % | 23 / 21 / 23 / 25 % |
| Victorias por asiento con 2 jugadores | 45 / 33 % | 45 / 46 % |

Todas las cartas de robar se juegan ahora como Acción el 78-83 % de las veces; Fortificar pasa del 1 % al 59 %, Bastión del 2 % al 68 %, y las tres de coste 5 se vinculan tanto como las demás.

### Por qué liberar cuesta 1 Maná

Medí partidas con dos bots que liberan contra dos que nunca lo hacen (200 partidas, 4 jugadores):

| Coste de liberar | Ganan los que liberan | Ganan los que no |
| --- | ---: | ---: |
| Gratis | 86 % | 7 % |
| 1 Maná | 79 % | 18 % |
| 2 Maná | 56 % | 40 % |

Gratis es una jugada automática que siempre conviene. Con 1 Maná sigue siendo la estrategia fuerte (como eliminar cartas en Dominion), pero obliga a elegir entre el Elemental caro o el más barato más liberar. Si en mesa resulta demasiado dominante, subir a 2.

También probé que el jugador inicial empezara con 4 cartas: con 3-4 jugadores no hace falta y con 2 compensa de más (42 % frente a 48 %), así que no se ha añadido.

## Pendiente

- **Cartas repetidas entre elementos** (+1, +2 y Roba 1 iguales en los cuatro): se dejan así por ahora.
- **Cartas flojas:** Retorno, Desorden y Cambio de viento se vinculan muy poco (0,1-0,4 copias por partida) y Oleaje se juega como Acción solo el 36 % de las veces. Parte puede ser limitación de los bots (no planifican el turno siguiente ni el Umbral), así que conviene verlas en mesa antes de tocarlas.
- **Liberar:** vigilar si en mesa se vuelve obligatorio liberar en cada turno (ver tabla).
- **Probar en mesa** la duración real: ahora hay unas 3 Acciones por turno en lugar de 1, y los turnos serán más largos.

## Resultados completos


## 2 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 4 % | 1 % |
| Santuarios vacíos | 1 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 13.8 |
| Acciones por turno | 0.85 | 2.66 |
| Maná sobrante por turno (Era I/II/III) | 0.8 / 1.3 / 2.3 | 0.0 / 0.1 / 0.6 |
| Turnos con vinculación | 93 % | 79 % |
| Cartas en el mazo al final | 24.0 | 15.7 |
| Cartas iniciales liberadas por jugador | 0.0 | 6.1 |
| Sellos medios por jugador | 11.5 | 11.8 |
| Sellos por Era (I/II/III) | 1.9 / 3.8 / 5.8 | 2.0 / 4.0 / 5.9 |
| Diferencia 1º-2º | 2.8 | 4.5 |
| Victoria compartida | 22 % | 10 % |
| Victorias por asiento | 45 % / 33 % | 45 % / 46 % |
| Sellos extra del último en jugar la Era | -0.18 | 0.10 |
| La Era III cambia el ganador | 44 % | 39 % |
| Retiradas / movimientos por partida | 1.8 / 0.5 | 10.1 / 4.3 |

## 3 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 9 % | 4 % |
| Santuarios vacíos | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 14.2 |
| Acciones por turno | 0.87 | 2.81 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.2 / 2.2 | 0.0 / 0.1 / 0.4 |
| Turnos con vinculación | 93 % | 77 % |
| Cartas en el mazo al final | 24.0 | 15.2 |
| Cartas iniciales liberadas por jugador | 0.0 | 6.4 |
| Sellos medios por jugador | 7.3 | 7.7 |
| Sellos por Era (I/II/III) | 1.2 / 2.4 / 3.7 | 1.3 / 2.6 / 3.8 |
| Diferencia 1º-2º | 2.5 | 2.9 |
| Victoria compartida | 15 % | 4 % |
| Victorias por asiento | 32 % / 25 % / 28 % | 34 % / 30 % / 32 % |
| Sellos extra del último en jugar la Era | -0.15 | 0.04 |
| La Era III cambia el ganador | 56 % | 56 % |
| Retiradas / movimientos por partida | 3.4 / 1.5 | 15.7 / 7.5 |

## 4 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 13 % | 8 % |
| Santuarios vacíos | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 14.3 |
| Acciones por turno | 0.88 | 2.83 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.3 / 2.2 | 0.0 / 0.1 / 0.3 |
| Turnos con vinculación | 93 % | 77 % |
| Cartas en el mazo al final | 24.0 | 14.9 |
| Cartas iniciales liberadas por jugador | 0.0 | 6.6 |
| Sellos medios por jugador | 5.2 | 5.5 |
| Sellos por Era (I/II/III) | 0.9 / 1.8 / 2.6 | 0.9 / 1.9 / 2.7 |
| Diferencia 1º-2º | 1.9 | 2.2 |
| Victoria compartida | 19 % | 8 % |
| Victorias por asiento | 22 % / 19 % / 20 % / 21 % | 23 % / 21 % / 23 % / 25 % |
| Sellos extra del último en jugar la Era | -0.02 | 0.18 |
| La Era III cambia el ganador | 57 % | 69 % |
| Retiradas / movimientos por partida | 4.9 / 2.1 | 21.4 / 10.2 |

## Veces que cada carta se juega como Acción (4 jugadores)

| Carta | Coste | v0.1 | v0.2 | Vinculada (v0.2, por partida) |
| --- | ---: | ---: | ---: | ---: |
| Chispa | 2 | 15 % | 59 % | 1.67 |
| Llama | 3 | 62 % | 81 % | 1.82 |
| Ascua | 2 | 1 % | 80 % | 1.52 |
| Quemadura | 3 | 7 % | 69 % | 1.28 |
| Embestida | 4 | 34 % | 70 % | 1.68 |
| Fuego voraz | 4 | 35 % | 58 % | 1.54 |
| Incendio | 5 | 18 % | 83 % | 1.72 |
| Llama de conquista | 6 | 69 % | 81 % | 1.67 |
| Gota | 2 | 14 % | 63 % | 1.70 |
| Corriente | 3 | 59 % | 83 % | 1.80 |
| Manantial | 2 | 1 % | 77 % | 1.49 |
| Fluir | 3 | 2 % | 83 % | 1.69 |
| Retorno | 3 | 0 % | 12 % | 0.38 |
| Oleaje | 4 | 0 % | 36 % | 1.75 |
| Renacer | 5 | 0 % | 71 % | 1.40 |
| Gran marea | 6 | 48 % | 61 % | 1.47 |
| Semilla | 2 | 14 % | 54 % | 1.63 |
| Raíz | 3 | 55 % | 80 % | 1.81 |
| Brote | 2 | 1 % | 80 % | 1.58 |
| Fortificar | 3 | 1 % | 59 % | 0.77 |
| Raíces profundas | 4 | 25 % | 48 % | 1.45 |
| Crecimiento | 4 | 17 % | 53 % | 1.66 |
| Bastión | 5 | 2 % | 68 % | 1.63 |
| Tierra ancestral | 6 | 60 % | 66 % | 1.34 |
| Brisa | 2 | 18 % | 63 % | 1.70 |
| Ráfaga | 3 | 64 % | 83 % | 1.82 |
| Inspiración | 2 | 1 % | 79 % | 1.47 |
| Desorden | 3 | 0 % | 9 % | 0.16 |
| Cambio de viento | 3 | 6 % | 21 % | 0.08 |
| Desvío | 4 | 8 % | 49 % | 1.24 |
| Corriente ascendente | 4 | 3 % | 62 % | 1.55 |
| Torbellino | 6 | 46 % | 77 % | 1.58 |
