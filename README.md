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
- **Entre combates:** comercio (ofertas de objetos que el otro acepta o rechaza), curación, pergaminos de robo y magia contra otros jugadores. Cuando todos pulsan **Listo**, aparecen los monstruos.
- **Combate:** cada esfera da un **color** (rojo, azul, verde, amarillo; blanco = comodín, negro = nada) y una **forma** (círculo, cuadrado, rombo, triángulo; estrella = comodín, cruz = nada). Cada ronda aparecen **dos monstruos a la vez**, cada uno pide solo colores o solo formas. Lanzas hasta 3 veces conservando las esferas que quieras y, cuando completas lo que pide uno, pulsas **Derrotar**. Cada 5 de Maná da una esfera blanca con estrella ya fijada. Si no completas ninguno, pierdes contra el menos dañino.
- **Reconexión:** si se cierra el navegador o se cae la conexión, al volver a abrir el enlace vuelves a tu partida.
- **Torneo:** se juega en directo y todos pueden ver los duelos.

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
| `public/img/heroes/color/` | Retratos con la ropa teñida del color de cada jugador, generados con `tools/recolor_ropa.py` (zonas de ropa elegidas para cada héroe). |
| `public/img/heroes/` | Retratos de los héroes, uno por Raza + Clase: `raza-clase.webp` (por ejemplo `elfo-mago.webp`). Si falta uno, la web muestra «Retrato pendiente». |
| `test/` | Tests: `npm test` (incluye cientos de partidas completas simuladas con bots). |

## Cambios de equilibrio respecto al reglamento v0.2

Probados con 400 partidas simuladas por bots (`src/config.js`):

| Cambio | Antes | Ahora |
| --- | --- | --- |
| Fuerza base | 2 | Goblin |
| Golpes en el torneo | 4 resultados = 3 de daño, si no 0 | **Golpe graduado**: 3 resultados del color del rival → 1 de daño, 4 → 2, 5 → 3 . El atacante puede terminar su ataque cuando quiera. |
| Caer a 0 Vida en la Fase 1 (regla 9) | pierde todo el equipo y los consumibles | pierde **todos los consumibles y su objeto de equipo de más Fuerza**, conserva el resto y recupera la Vida inicial |
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
13. **Torneo:** ataca primero quien tenga **menos** Fuerza + Maná (el más fuerte ya tiene la ventaja de elegir rival). Cada ataque es un combate (Maná una vez por ataque). Los empates en la clasificación se deshacen por Vida y luego al azar.
14. **Duelos imposibles:** si un héroe no tiene dados suficientes para hacer al menos 1 de daño (3 dados con el golpe completo de 5), pierde su turno. Si **ninguno** de los dos puede hacer daño, gana quien tenga más Vida (y si empatan, más Fuerza + Maná).
15. **Menos de 4 jugadores** (para pruebas): con 3 jugadores, el primer clasificado pasa directamente a la final; con 2, se juega solo la final.
