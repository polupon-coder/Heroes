# ⚔ HÉROES

Juego de héroes de fantasía para jugar con amigos por internet, basado en el **Reglamento provisional v0.2**.

Cada jugador crea un héroe (Raza + Clase), atraviesa 12 rondas de aventura contra monstruos y después compite en un torneo de semifinales y final.

## Jugar en local

Requisitos: [Node.js](https://nodejs.org) 18 o superior.

```bash
npm install
npm start
```

Abre <http://localhost:3000>, escribe tu nombre y pulsa **Crear partida**. Comparte el enlace o el código de 4 letras con tus amigos.

Para jugar con amigos que no están en tu red, el servidor tiene que estar publicado en internet (ver abajo).

## Publicarlo en internet (gratis)

### Render.com (recomendado)

El repositorio incluye `render.yaml`, así que Render lo configura solo:

1. Entra en <https://render.com> y pulsa **Get Started**. Regístrate con **GitHub**.
2. En el panel, pulsa **New +** → **Blueprint**.
3. Si te lo pide, autoriza a Render a ver tus repositorios (puedes elegir solo `Heroes`).
4. Elige el repositorio **Heroes** y pulsa **Connect**.
5. Render lee `render.yaml` y muestra el servicio `heroes` (plan Free). Pulsa **Apply** / **Deploy Blueprint**.
6. Espera 2–3 minutos. Cuando ponga **Live**, abre el servicio y copia su dirección, del estilo `https://heroes-xxxx.onrender.com`.
7. Pasa esa dirección a tus amigos: uno crea la partida y los demás entran con el código.

Cada vez que se suban cambios a la rama, Render vuelve a publicar el juego automáticamente.

> En el plan gratuito el servidor se duerme tras unos 15 minutos sin uso y tarda unos 30–60 s en despertar: abre la página un minuto antes de quedar. Las partidas se guardan en memoria, así que si el servidor se reinicia, las partidas en curso se pierden.

Railway o Fly.io también sirven: es una app Node normal que escucha en la variable `PORT`.

## Cómo se juega en la web

- **Sala:** el anfitrión crea la partida; los demás entran con el enlace o el código. El anfitrión puede añadir **bots** para completar los 4 jugadores y elegir si en el torneo hacen falta **4 o 5** resultados del color del rival para golpear.
- **Entre combates:** cuatro botones: **Listo para el combate**, **Comerciar**, **Maleficio** y **Robar** (cada uno abre su ventana). Robar: con Pergamino de Robo es seguro; sin él se tira un dado: 1-2 robas, 3-5 pierdes tu Maná en el próximo combate, 6 no pasa nada (un intento por ronda).
- **Combate:** cada esfera da un **color** (rojo, azul, verde, amarillo o **multicolor** = comodín) y una **forma** (círculo, cuadrado, rombo, triángulo o **espiral** = comodín). Cada ronda aparecen **dos monstruos a la vez**, cada uno pide solo colores o solo formas. Lanzas hasta 3 veces conservando las esferas que quieras y, cuando completas lo que pide uno, pulsas **Derrotar**. Cada 5 de Maná da una esfera multicolor con espiral ya fijada. Si no completas ninguno, pierdes contra el menos dañino.
- **Reconexión:** si se cierra el navegador o se cae la conexión, al volver a abrir el enlace vuelves a tu partida.
- **Torneo:** se juega en directo y todos pueden ver los duelos.

## Novedades de esta versión

- **Monedas y tienda:** cada monstruo vencido da monedas (más cuantas menos tiradas necesites; se anuncian después de elegir la recompensa). Entre rondas, **Comprar** muestra 4 objetos con su precio; una compra por ronda. Al caer a 0 Vida se pierden las monedas.
- **Túnicas:** dan Maná en lugar de Fuerza.
- **Torneo:** todos empiezan con la Vida completa; los duelos se juegan uno detrás de otro en el centro; el ganador de una semifinal elige un objeto del vencido y se lleva sus monedas y un premio; los finalistas recuperan la Vida antes de la final.
- **Bots:** valoran los objetos por las esferas y comodines que les dan y eligen el monstruo por probabilidad × valor.
- **Móvil:** en pantallas estrechas la mesa pasa a una columna (tu héroe, el centro y los rivales) sin desbordes.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/config.js` | **Todas las tablas del reglamento** (razas, clases, monstruos, daños, recompensas…). Para equilibrar el juego, se cambia aquí. |
| `src/dice.js` | Comprobación de combinaciones, comodines y dados exitosos. |
| `src/items.js` | Generación de recompensas y espacios de equipo. |
| `src/game.js` | Motor del juego: fases, rondas, combate, comercio, magia y torneo. El servidor valida todas las jugadas. |
| `src/bot.js` | Jugador automático sencillo. |
| `src/server.js` | Servidor web y salas en tiempo real (Socket.IO). |
| `public/` | Interfaz web (HTML/CSS/JS sin dependencias). |
| `public/sounds.js`, `public/sonidos/` | Sonidos y música (los mismos de Imperio); se silencian con el botón del altavoz. |
| `tools/transparent.py` | Quita el papel de fondo de las ilustraciones para que las figuras se vean enteras sobre el pergamino. |

| `public/img/heroes/` | Retratos de los héroes, uno por Raza + Clase: `raza-clase.webp` (por ejemplo `elfo-mago.webp`). Si falta uno, la web muestra «Retrato pendiente». |
| `test/` | Tests: `npm test` (incluye cientos de partidas completas simuladas con bots). |

## Cambios de equilibrio respecto al reglamento v0.2

Probados con 400 partidas simuladas por bots (`src/config.js`):

| Cambio | Antes | Ahora |
| --- | --- | --- |
| Fuerza base | 2 | Goblin |
| Golpes en el torneo | 4 resultados = 3 de daño, si no 0 | **Golpe graduado**: 3 resultados del color del rival → 1 de daño, 4 → 2, 5 → 3 . El atacante puede terminar su ataque cuando quiera. |
| Caer a 0 Vida en la Fase 1 (regla 9) | pierde todo el equipo y los consumibles | igual: pierde **todos sus objetos** y recupera la Vida inicial |
| Vida al empezar el Torneo | no se recupera | **todos empiezan el Torneo con la Vida completa** |
| Quién ataca primero en el torneo | — | el de menos Fuerza + Maná |

| Nivel | Monstruo | Combinación |
| ---: | --- | --- |
| 1 | Diablillo de los Bosques | 🔴🔵 |
| 2 | Goblin | 🔴🔴 |
| 3 | Necrófago | 🔵🟢🟢 |
| 4 | Orco | 🔴🔴🔴 |
| 5 | Súcubo | 🔵🔵🟡 |
| 6 | Espectro | 🟢🟢🟢🟡 |
| 7 | Mago Oscuro | 🔴🔴🟢🟢 |
| 8 | Minotauro | 🔵🔵🔵🟡 |
| 9 | Ogro | 🟢🟢🟡🟡 |
| 10 | Trol | 🔴🔵🟢🟡 |
| 11 | Basilisco | 🔴🔴🔵🟢🟡 |
| 12 | Dragón | 🔴🔵🟢🟡🟡 |

Mantícora, Quimera y Gólem se sustituyen por el Diablillo, el Minotauro y el Mago Oscuro, y los 12 monstruos se ordenan de menos a más poderosos según sus ilustraciones.

**Esferas suficientes.** Nunca se ofrecen monstruos que pidan más esferas de las que tienes: si sale uno así, se cambia por un tamaño menor o un nivel inferior que sí esté a tu alcance.

**Tamaños.** Cada monstruo aparece en uno de 3 tamaños (las 3 figuras de su lámina):

| Tamaño | Probabilidad | Combinación | Daño si pierdes | Recompensas |
| --- | ---: | --- | --- | --- |
| Pequeño | 50 % | la de la tabla | el del nivel | del nivel |
| Mediano | 35 % | el color menos repetido pasa a ser el más repetido | +1 | como 2 niveles más |
| Grande | 15 % | lo anterior + 1 color más (máx. 5) | +2 | como 4 niveles más |

Ejemplo: Orco (🔴🔴🔴) → mediano 🔴🔴🔴 → grande 🔴🔴🔴🔴. Necrófago (🔵🟢🟢) → mediano 🟢🟢🟢 → grande 🟢🟢🟢🟢.

Resultado medido con bots: se gana casi el 100 % de los combates de nivel 1, en torno al 60–70 % de los de nivel 7 a 12, y el 46 % de los de nivel 6, el más duro; 0,54 caídas por héroe; Fuerza media de 21 al llegar al torneo; duelos de unos 6 ataques; menos del 1 % de duelos en los que nadie puede hacer daño; el primer clasificado gana en torno al 63 % de las partidas.

## Decisiones tomadas donde el reglamento no lo especifica

Son provisionales y fáciles de cambiar:

1. **Turnos simultáneos en la Fase 1.** Todos eligen monstruo y combaten a la vez; la ronda avanza cuando todos han terminado.
2. **Monstruos de cada ronda.** Cada jugador recibe sus propios 2 monstruos, de dos niveles distintos de entre los posibles de la ronda. En las rondas 11 y 12 son el mismo monstruo, pero con recompensas distintas.
3. **Recompensas visibles antes de elegir.** Las 2 recompensas de cada monstruo se generan al aparecer y se muestran en su carta.
4. **Recompensas:** 60 % equipo, 20 % poción y 20 % pergamino. Consumibles: Maná +X, Curación +X o Robo (solo pergaminos), con X = calidad del equipo del nivel + 1.
5. **Armas:** las de una mano son espadas o mazas; las de dos manos (arco, hacha, báculo o cayado) dan +2 de Fuerza más que una de una mano del mismo nivel.
6. **Sin mochila:** si un objeto nuevo no cabe, se elige en el momento qué descartar.
7. **La curación no supera la Vida inicial** del héroe.
8. **Fuerza 0 o menos = 1 dado** (por ejemplo, un Gnomo Mago tiene Fuerza 0).
9. **Maná:** solo se puede usar después de la primera tirada. Los dados fijados ya no se relanzan. Una poción de Maná se usa durante el combate y antes de usar el Maná.
10. **Maldición (regla 29):** afecta a los dados recién tirados que cuentan para la combinación; los dados fijados con Maná no se ven afectados. La magia se puede lanzar a partir de la ronda 2.
11. **Rendirse:** se puede aceptar la derrota en cualquier momento tras la primera tirada.
12. **Hay una última fase «entre combates»** después de la ronda 12 para preparar el torneo.
13. **Torneo:** ataca primero quien tenga **menos** Fuerza + Maná (las semifinales se sortean). Cada ataque es un combate (Maná una vez por ataque). Los empates en la clasificación se deshacen por Vida y luego al azar.
14. **Duelos imposibles:** si un héroe no tiene dados suficientes para hacer al menos 1 de daño (3 dados con el golpe completo de 5), pierde su turno. Si **ninguno** de los dos puede hacer daño, gana quien tenga más Vida (y si empatan, más Fuerza + Maná).
15. **Menos de 4 jugadores** (para pruebas): con 3 jugadores, el primer clasificado pasa directamente a la final; con 2, se juega solo la final.

---

# 🏴‍☠️ PIRATAS

Juego de estrategia y aventura naval para **2 a 4 jugadores** (amigos y bots), basado en el **Reglamento V1.39**. Se sirve desde el mismo servidor que HÉROES, en **`/piratas`** (en local: <http://localhost:3000/piratas>).

Cada jugador lleva un barco pirata por un archipiélago de 12 × 12 casillas con niebla de guerra: explora islas, comercia entre puertos, mejora su barco y combate contra mercantes, otros piratas y la Armada. Gana quien llegue a 12 Puntos de Leyenda, o quien tenga más tras la ronda 15.

## Cómo se juega en la web

- **Sala:** igual que HÉROES. El anfitrión crea la partida, comparte el enlace o el código y puede **añadir bots**. Se empieza con **¡Zarpar!**.
- **Tu turno (90 s, 3 acciones):**
  - **Navegar:** pulsa el botón y después las casillas marcadas. Como solo se ve el 3 × 3, normalmente se avanza casilla a casilla.
  - **Explorar** y **Atracar:** desde el panel o pulsando la isla o el puerto.
  - **Atacar o comerciar:** desde «A la vista».
  - **Puerto:** comerciar, mejorar, reparar y reclutar.
- **Combate:** una ventana con los dos barcos. Cada capitán elige Cañonear, Abordar o Maniobrar (20 s; si no eliges, tu barco cañonea). Se ven los dados de cada asalto.
- **Precios:** el botón de arriba muestra los precios de todos los puertos descubiertos, para planear rutas comerciales.

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/piratas/config.js` | **Todas las tablas del reglamento** (mejoras, precios, exploración, combate, mercantes, Armada, PL, tiempos). Para equilibrar, se cambia aquí. |
| `src/piratas/map.js` | Generación del archipiélago, movimiento en 8 direcciones (esquinas, arrecifes), distancias y línea de tiro. |
| `src/piratas/game.js` | Motor: turnos, acciones, comercio, combate, hundimientos, fase neutral, plazos y lo que ve cada jugador. |
| `src/piratas/ai.js` | Maniobras de mercantes, fragatas y bots en combate. |
| `src/piratas/bot.js` | Jugador automático (solo usa lo que ha descubierto). |
| `src/piratas/server.js` | Página `/piratas` y salas en tiempo real (espacio de Socket.IO `/piratas`). |
| `public/piratas/` | Interfaz web. |
| `public/piratas/img/` | Ilustraciones de los barcos (ver abajo). |
| `test/piratas.test.js` | Tests de reglas y partidas completas con bots. |

## Ilustraciones de los barcos

Se buscan en `public/piratas/img/` en `.webp` o `.png`. Si falta alguna, se usa un dibujo provisional:

| Archivo | Barco |
| --- | --- |
| `barco-1` | Barco pirata inicial (un mástil). Suma de niveles de las 5 mejoras: 5–7. |
| `barco-2` | Barco pirata mejorado (tres mástiles). Suma 8–11. |
| `barco-3` | Barco pirata de leyenda (el más grande). Suma 12–15. |
| `mercante` | Mercante. |
| `fragata` | Fragata de la Armada. |

Mejor con fondo transparente. El color de cada jugador se muestra con una franja bajo su barco.

Texturas del tablero (en `public/piratas/img/`):

| Archivo | Uso |
| --- | --- |
| `mar.webp` | Mar, continuo de casilla en casilla (los arrecifes llevan rocas encima). |
| `tierra.webp` | Tierra de las islas de varias casillas. |
| `colina.webp` | La casilla más interior de cada isla sin puerto de 3 o más casillas. |
| `isla.webp` | Islotes de una sola casilla. |
| `puerto-1/2/3.webp` | Puertos (se reparten entre los 9). Se giran para que el muelle mire al lado con más mar. |
| `niebla.webp` | Niebla de guerra sobre lo que aún no se ha descubierto. |
| `arrecife.webp` | Arrecifes. |
| `costa.webp` | Mar junto a tierra (en cruz), girado para que la playa quede del lado de la isla. |
| `oceano.webp` | Mar profundo: casillas de mar rodeadas de mar por los 8 lados; se funde con el mar normal. |
| `poblado.webp` | La casilla de tierra más cercana al puerto en las islas con puerto. |

## Decisiones tomadas donde el reglamento no lo especifica

1. **Precios:** cada puerto paga por cada mercancía su valor base −1…+2 y la vende 1 oro más cara. Son fijos toda la partida. Los precios de un puerto se conocen en cuanto se descubre su casilla.
2. **Carga de un barco hundido:** si lo hunde otro pirata, este se lleva la mitad perdida, si le cabe en la bodega (a coste 0). Si lo hunde la Armada, un mercante o un peligro, se pierde.
3. **Atracado:** el barco está en la casilla del puerto. Al salir, la primera casilla de mar cuesta movimiento normal. Se puede atracar a mitad de un movimiento y seguir usando las acciones que queden. La restricción de regreso impide atracar en el último puerto visitado.
4. **Visión:** el terreno se descubre en 3 × 3, pero los **barcos se ven hasta 2 casillas** (el alcance de los cañones); si no, nunca se podría cañonear a distancia 2. Las fragatas detectan piratas a esa misma distancia.
5. **Iniciar un combate:** la acción elegida (Cañonear o Abordar) es la maniobra del atacante en el primer asalto. Si el combate empieza a distancia 2, nadie puede abordar en ese combate.
6. **Abordajes:** quien gana el abordaje captura hasta 2 mercancías (las más valiosas, a coste 0), el perdedor pierde un marinero y el combate termina. Si quien aborda es rechazado (cañoneo contra abordaje), pierde un marinero y el combate sigue. El empate favorece al defensor original del combate.
7. **Ventaja táctica:** también se gasta si abordas contra un barco que maniobra.
8. **Mercantes y Armada** nunca abordan. Los mercantes no atacan; las fragatas siempre empiezan cañoneando. Hundir un mercante no da su carga.
9. **Comercio con mercantes:** se puede comprar su carga y venderle (hasta 6 mercancías de bodega) a los precios de su puerto de destino. Las ventas cuentan para el beneficio neto.
10. **Venta:** las unidades se venden empezando por las más antiguas (su coste de compra cuenta para el beneficio). En una visita no se puede revender en el mismo puerto una mercancía comprada allí.
11. **Plazos:** 90 s por turno (se pausa durante combates y propuestas). 20 s para elegir maniobra o responder a un trato; si no, se cañonea o se rechaza.
12. **Islas con puerto** también se pueden explorar (desde el mar). Las mercancías encontradas que no caben se pierden.
13. **Bots en el comercio:** aceptan un trato si reciben al menos el valor base de lo que dan.

## Equilibrio medido con bots

Con 60 partidas simuladas de bots:

- Las partidas duran unas **10 rondas**; el 80 % termina por alcanzar 12 PL.
- Hay 0,5 hundimientos por jugador y 3 mejoras por jugador de media.
- Los PL salen sobre todo de **tesoros (40 %)** y **comercio (37 %)**. Después vienen fragatas (10 %), mercantes (4 %) y piratas (2 %).
- Los bots juegan de forma sencilla: las cifras sirven para comparar cambios, no para predecir partidas entre personas.
