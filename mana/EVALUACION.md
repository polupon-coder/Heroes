# MANA — Valoración y cambios

Reglas vigentes: [REGLAS.md](REGLAS.md) (**v0.2**). Datos: 400 partidas completas por versión y número de jugadores, jugadas por bots (`node mana/simular.js 400`). Los bots valoran cada jugada por los Sellos que esperan ganar en la Era y por la fuerza de lo que vinculan; juegan con sensatez pero miran poco hacia delante (no explotan del todo la última palabra ni hacen *kingmaking*). Las cifras indican tendencias, no sustituyen a jugar en mesa.

## Cambios de la v0.1 a la v0.2

| # | Problema en la v0.1 | Cambio en la v0.2 |
| --- | --- | --- |
| 1 | Con **1 Acción por turno**, lo robado solo servía como Maná: las 8 cartas de robar/recuperar se jugaban como Acción el 0-2 % de las veces y el Agua no tenía función. Además sobraban 2,2 de Maná por turno en la Era III. | Cada carta jugada es **Acción o Maná, sin límite de Acciones**. Se sigue vinculando 1 Elemental por turno. |
| 2 | La **Protección no protegía de nada**: el Fuego solo retiraba en 🔥, el Aire solo movía desde 💨 y la Tierra solo protegía en 🌿, donde nadie ataca. 💧 y 🌿 eran carreras sin interacción. | El Fuego **retira** y el Aire **mueve** en cualquier Santuario; la Tierra **protege** en cualquiera y la Protección **dura hasta el final de la Era**. |
| 3 | El jugador inicial rotaba cada ronda: con 2 jugadores uno jugaba dos turnos seguidos (45 % frente a 33 % de victorias) y con 4 uno nunca tenía el último turno de una Era. | Orden horario fijo. **Empieza cada Era quien tiene más Sellos**: el último turno, que no tiene respuesta, lo juega quien va detrás. |
| 4 | El mazo inicial no se podía adelgazar: al final, 10 de 24 cartas seguían siendo las iniciales. | **Liberar:** tras vincular, puedes pagar **2 Manás** para devolver a la caja 1 carta inicial jugada ese turno. |
| 5 | Las cartas de coste 5 daban lo mismo que las de 4 pagando 1 más. | **Incendio:** +1 🔥 además de retirar 2. **Renacer:** además roba 1. **Bastión:** protege todas tus Presencias de un Santuario y +1 🌿 protegida. |
| 6 | «Fragmentos de Maná» se confundía con el Maná del turno y con la Mota de Maná. | Los puntos se llaman **Sellos**. Se define el **Círculo**; las cartas iniciales no llevan esfera de Coste. |
| 7 | Dudas de redacción y un 19 % de victorias compartidas con 4 jugadores. | Elige siempre el jugador activo (y en Desorden el rival elige su descarte), Gran marea redactada como Retorno, Crecimiento «al menos 1 🌿», Cambio de viento permite vincular el nuevo, **desempate final por Sellos de la Era III**. |
| 8 | Retorno, Fortificar, Desorden y Cambio de viento rendían **peor que una Mota de Maná**, y Quemadura no valía nada con 3-4 jugadores. | Nuevas versiones (ver «Cartas flojas»). |

La regla de empate en un Santuario (nadie puntúa) **se mantiene**: frena al líder sin frustrar y repartir los empates no mejoraba nada.

### Resultado (4 jugadores)

| | v0.1 | v0.2 |
| --- | ---: | ---: |
| Presencia puesta por jugador y Era | 5,6 | 12,4 |
| Maná sobrante por turno en la Era III | 2,2 | 0,3 |
| Cartas en el mazo al final (iniciales liberadas) | 24 (0) | 16,4 (4,7) |
| Victoria compartida | 19 % | 10 % |
| La Era III cambia el ganador | 57 % | 66 % |
| Victorias por asiento | 25 / 18 / 18 / 20 % | 22 / 23 / 23 / 23 % |
| Victorias por asiento con 2 jugadores | 43 / 35 % | 44 / 48 % |

## Investigación de los puntos pendientes

### Cartas flojas

**Método.** Un jugador empieza con 2 copias de una carta en lugar de sus 2 Motas de Maná y se mide cuánto sube su porcentaje de victorias, con las mismas partidas para todas las cartas (`node mana/valor_cartas.js 800 2` y `node mana/valor_cartas.js 1600 4`). Una carta que no aporta nada da +0: es lo mismo que una Mota. Antes se corrigió el bot, que no valoraba preparar el turno siguiente (Retorno, Oleaje) y con Cambio de viento descartaba justo el Elemental que quería.

**Resultado con las cartas de la primera v0.2** (2 jugadores):

| Carta | Diferencia | Diagnóstico |
| --- | ---: | --- |
| Retorno | −7,6 | Pierdes 1 Maná este turno para colocar una carta para el siguiente: no compensa. |
| Fortificar | −7,8 | Proteger sin hacer nada más rara vez vale el Maná que cuesta. |
| Desorden | −10,3 | El rival elige su peor carta y roba otra: le haces un favor. |
| Cambio de viento | −11,3 | Cambiar una carta del Umbral no vale 1 Maná. |
| Oleaje | +28,3 | Bien (en la media de las de coste 4): era el bot el que no la jugaba. |

**Problema extra con 3-4 jugadores:** las cartas que golpean a **un solo rival** (Quemadura, o Desorden contra un rival) valen casi 0 (+0,3 con 4 jugadores), porque lo que pierde ese rival lo aprovechan los demás.

**Versiones probadas** (diferencia de victorias; referencia de coste 3: Llama +13 con 2 jugadores, +16 con 4):

| Carta | Versión | 2 j. | 4 j. |
| --- | --- | ---: | ---: |
| Retorno | **Roba 1 y pon 1 de tu descarte sobre tu mazo** | +13,7 | +12,3 |
| Retorno | Recupera 1 de tu descarte a tu mano | +13,2 | |
| Fortificar | **Protege 2 propias y roba 1** | +15,9 | +12,5 |
| Fortificar | +1 🌿 y protege 2 propias | +7,6 | |
| Cambio de viento | **Roba 1 y cambia 1 del Umbral** | +17,2 | +15,6 |
| Cambio de viento | +1 💨 y cambia 1 del Umbral | +6,4 | |
| Desorden | Un rival descarta 1 (la eliges tú) y roba 1 | −3,8 | |
| Desorden | Un rival descarta 1 (la eliges tú) | +19,4 | +0,4 |
| Desorden | Un rival descarta 1 (la eliges tú) y tú robas 1 | +46,8 | |
| Desorden | **+1 💨 y cada rival descarta 1 (la elige él)** | +24,9 | +32,1 |
| Quemadura | Retira 1 rival de cualquier Santuario y roba 1 | +34,4 | +27,9 |
| Quemadura | Retira 1 rival de un Santuario y pon 1 tuya allí | +32,8 | +19,4 |
| Quemadura | **Retira 1 rival de 🔥 y pon 1 tuya en 🔥** | +10,5 | +7,5 |

Elegidas las marcadas en negrita. Quemadura queda algo por debajo de Llama, pero **igual con 2, 3 y 4 jugadores** (+10,5 / +8,2 / +7,5); el Fuego sigue retirando en cualquier Santuario con Embestida, Incendio y Llama de conquista. Desorden queda **algo fuerte para su coste** (a la altura de una de coste 4): vigilarla en mesa; si molesta, quitarle el +1 💨.

**Fuerza final** con las cartas actuales (4 jugadores): las de coste 6 dan +47 a +53, las de 5 +30 a +53, las de 4 +19 a +38, las de 3 +7 a +29 y las de 2 +1 a +9. Ya ninguna rinde menos que una Mota. Las más flojas son las **+1 de coste 2 (Chispa, Semilla, Brisa: +1 a +2)**, que casi no aportan; son de las cartas repetidas que se dejaron para más adelante. Cuando se revisen, conviene darles algo más (por ejemplo, +1 y roba 1). **Renacer** (+52,6) quizá quede algo fuerte tras la mejora: rinde como una de coste 6.

### ¿Liberar se vuelve automático?

Torneos de 4 bots que liberan más o menos (300 partidas, rotando asientos):

| Regla | Libera poco (~2) | Libera algo (~5) | Libera bastante (~8-9) | Libera todo (10) |
| --- | ---: | ---: | ---: | ---: |
| Cuesta 1 Maná | 17 % | 20 % | **33 %** | 29 % |
| Cuesta 2 Manás | 25 % | **32 %** | **32 %** | 11 % |
| En lugar de vincular, 1 carta | 25 % | **35-38 %** | | 2 % |
| En lugar de vincular, hasta 2 | 26 % | 27 % | **48 %** | 0 % |

Con **1 Maná**, liberar casi todo es siempre lo mejor: es rutina, no decisión. Con **2 Manás**, lo mejor es liberar a medias y quien libera todo pierde. Por eso **liberar cuesta 2 Manás**. «En lugar de vincular» también funcionaría; es una alternativa a probar en mesa si pagar Maná resulta engorroso.

### Duración

Estimación con supuestos de tiempo por gesto (`node mana/duracion.js`; ajustarlos tras cronometrar partidas reales): 12 s por turno, 5 s por Acción de poner Presencia, 8 s por Acción de cartas, 12 s por Acción con objetivo, 10 s por vinculación, 90 s por final de Era y 5 min de preparación.

| Versión | 2 jugadores | 3 jugadores | 4 jugadores | Segundos por turno (4 j.) |
| --- | ---: | ---: | ---: | ---: |
| v0.1 | 25 min | 33 min | 40 min | 31 s |
| v0.2 | 30 min | 40 min | 50 min | 41 s |
| v0.2 con Eras de 4 rondas | 25 min | 33 min | 41 min | 39 s |

Con 2-3 jugadores cabe en 30-45 minutos; con 4 se va a unos 50. Las Eras de 4 rondas lo arreglan, pero cuestan progresión (300 partidas, 4 jugadores):

| | 5 rondas | 4 rondas |
| --- | ---: | ---: |
| Elementales vinculados por jugador | 11,2 | 8,0 |
| Cartas de coste 5-6 al final | 2,5 | 1,6 |
| La Era III cambia el ganador | 70 % | 60 % |

**Decisión:** mantener 5 rondas y anunciar **30-55 minutos**. Si en mesa una partida a 4 pasa de 50 minutos, jugar Eras de 4 rondas con 4 jugadores.

## Sigue pendiente

- **Cartas repetidas** entre elementos, incluidas las +1 de coste 2, que casi no aportan.
- **Vigilar en mesa:** Desorden y Renacer (algo fuertes), liberar con coste 2 y la duración a 4 jugadores (cronometrar las primeras partidas).
- Con 2 jugadores el segundo gana algo más (48 % frente a 44 %): dentro del margen de error, pero a observar.

## Resultados completos


## 2 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 4 % | 1 % |
| Santuarios vacíos | 1 % | 1 % |
| Presencia puesta por jugador y Era | 5.6 | 12.5 |
| Acciones por turno | 0.86 | 2.54 |
| Maná sobrante por turno (Era I/II/III) | 0.8 / 1.3 / 2.3 | 0.0 / 0.0 / 0.5 |
| Turnos con vinculación | 93 % | 77 % |
| Cartas en el mazo al final | 24.0 | 17.0 |
| Cartas iniciales liberadas por jugador | 0.0 | 4.6 |
| Sellos medios por jugador | 11.5 | 11.8 |
| Sellos por Era (I/II/III) | 1.9 / 3.8 / 5.7 | 1.9 / 4.0 / 5.9 |
| Diferencia 1º-2º | 3.0 | 4.7 |
| Victoria compartida | 23 % | 8 % |
| Victorias por asiento | 43 % / 35 % | 44 % / 48 % |
| Sellos extra del último en jugar la Era | -0.18 | 0.06 |
| La Era III cambia el ganador | 45 % | 36 % |
| Retiradas / movimientos por partida | 1.8 / 0.5 | 9.3 / 2.6 |

## 3 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 9 % | 5 % |
| Santuarios vacíos | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.7 | 12.6 |
| Acciones por turno | 0.88 | 2.59 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.2 / 2.2 | 0.0 / 0.0 / 0.3 |
| Turnos con vinculación | 93 % | 74 % |
| Cartas en el mazo al final | 24.0 | 16.5 |
| Cartas iniciales liberadas por jugador | 0.0 | 4.6 |
| Sellos medios por jugador | 7.4 | 7.6 |
| Sellos por Era (I/II/III) | 1.2 / 2.5 / 3.7 | 1.2 / 2.5 / 3.8 |
| Diferencia 1º-2º | 2.6 | 2.8 |
| Victoria compartida | 14 % | 4 % |
| Victorias por asiento | 34 % / 26 % / 26 % | 30 % / 33 % / 33 % |
| Sellos extra del último en jugar la Era | -0.17 | 0.20 |
| La Era III cambia el ganador | 55 % | 60 % |
| Retiradas / movimientos por partida | 3.3 / 1.4 | 14.7 / 4.7 |

## 4 jugadores (400 partidas por variante)

| Medida | v0.1 | v0.2 |
| --- | ---: | ---: |
| empate en cabeza (nadie puntúa) | 13 % | 8 % |
| Santuarios vacíos | 0 % | 0 % |
| Presencia puesta por jugador y Era | 5.6 | 12.4 |
| Acciones por turno | 0.88 | 2.52 |
| Maná sobrante por turno (Era I/II/III) | 0.9 / 1.2 / 2.2 | 0.0 / 0.0 / 0.3 |
| Turnos con vinculación | 93 % | 74 % |
| Cartas en el mazo al final | 24.0 | 16.4 |
| Cartas iniciales liberadas por jugador | 0.0 | 4.7 |
| Sellos medios por jugador | 5.3 | 5.5 |
| Sellos por Era (I/II/III) | 0.9 / 1.8 / 2.6 | 0.9 / 1.9 / 2.7 |
| Diferencia 1º-2º | 1.9 | 2.1 |
| Victoria compartida | 19 % | 10 % |
| Victorias por asiento | 25 % / 18 % / 18 % / 20 % | 22 % / 23 % / 23 % / 23 % |
| Sellos extra del último en jugar la Era | -0.01 | 0.14 |
| La Era III cambia el ganador | 57 % | 66 % |
| Retiradas / movimientos por partida | 5.0 / 2.0 | 18.7 / 6.6 |

## Veces que cada carta se juega como Acción (4 jugadores)

| Carta | Coste | v0.1 | v0.2 | Vinculada (v0.2, por partida) |
| --- | ---: | ---: | ---: | ---: |
| Chispa | 2 | 14 % | 57 % | 1.58 |
| Llama | 3 | 60 % | 80 % | 1.73 |
| Ascua | 2 | 1 % | 72 % | 1.33 |
| Quemadura | 3 | 7 % | 67 % | 1.55 |
| Embestida | 4 | 34 % | 65 % | 1.63 |
| Fuego voraz | 4 | 34 % | 54 % | 1.07 |
| Incendio | 5 | 19 % | 77 % | 1.61 |
| Llama de conquista | 6 | 68 % | 73 % | 1.49 |
| Gota | 2 | 12 % | 58 % | 1.63 |
| Corriente | 3 | 56 % | 80 % | 1.77 |
| Manantial | 2 | 0 % | 74 % | 1.29 |
| Fluir | 3 | 2 % | 81 % | 1.49 |
| Retorno | 3 | 21 % | 81 % | 1.27 |
| Oleaje | 4 | 22 % | 34 % | 1.72 |
| Renacer | 5 | 0 % | 67 % | 0.99 |
| Gran marea | 6 | 66 % | 70 % | 1.18 |
| Semilla | 2 | 11 % | 54 % | 1.50 |
| Raíz | 3 | 54 % | 78 % | 1.77 |
| Brote | 2 | 1 % | 73 % | 1.39 |
| Fortificar | 3 | 0 % | 92 % | 1.63 |
| Raíces profundas | 4 | 24 % | 42 % | 0.90 |
| Crecimiento | 4 | 16 % | 46 % | 1.46 |
| Bastión | 5 | 1 % | 59 % | 1.42 |
| Tierra ancestral | 6 | 59 % | 59 % | 0.95 |
| Brisa | 2 | 17 % | 59 % | 1.60 |
| Ráfaga | 3 | 63 % | 79 % | 1.76 |
| Inspiración | 2 | 1 % | 73 % | 1.38 |
| Desorden | 3 | 1 % | 92 % | 1.66 |
| Cambio de viento | 3 | 7 % | 79 % | 0.62 |
| Desvío | 4 | 5 % | 44 % | 0.32 |
| Corriente ascendente | 4 | 3 % | 56 % | 1.16 |
| Torbellino | 6 | 44 % | 70 % | 1.41 |
