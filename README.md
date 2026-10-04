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

### Render.com

1. Crea una cuenta en <https://render.com> y conecta tu GitHub.
2. **New → Web Service** y elige este repositorio.
3. Configuración:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. Al terminar, Render te da una dirección como `https://heroes-xxxx.onrender.com`. Pásasela a tus amigos.

> En el plan gratuito el servidor se duerme tras unos minutos sin uso y tarda unos 30–60 s en despertar. Las partidas se guardan en memoria, así que si el servidor se reinicia, las partidas en curso se pierden.

Railway o Fly.io también sirven: es una app Node normal que escucha en la variable `PORT`.

## Cómo se juega en la web

- **Sala:** el anfitrión crea la partida; los demás entran con el enlace o el código. El anfitrión puede añadir **bots** para completar los 4 jugadores y elegir si en el torneo hacen falta **4 o 5** resultados del color del rival para golpear.
- **Entre combates:** comercio (ofertas de objetos que el otro acepta o rechaza), curación, pergaminos de robo y magia contra otros jugadores. Cuando todos pulsan **Listo**, aparecen los monstruos.
- **Combate:** tira los dados, toca los que quieras conservar y relanza el resto (3 tiradas como máximo). El botón **Usar Maná** permite, una vez por combate, fijar el resultado de tantos dados como permita tu Maná. Los dados con borde verde son los que ya cuentan para la combinación.
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
| `public/img/heroes/` | Retratos de los héroes, uno por Raza + Clase: `raza-clase.webp` (por ejemplo `elfo-mago.webp`). Si falta uno, la web muestra «Retrato pendiente». |
| `test/` | Tests: `npm test` (incluye cientos de partidas completas simuladas con bots). |

## Cambios de equilibrio respecto al reglamento v0.2

Probados con 400 partidas simuladas por bots (`src/config.js`):

| Cambio | Antes | Ahora |
| --- | --- | --- |
| Fuerza base | 2 | **10**, y ninguna combinación de Raza + Clase baja de 10 (los héroes empiezan con 2–3 dados) |
| Golpes en el torneo | 4 resultados = 3 de daño, si no 0 | **Golpe graduado**: 3 resultados del color del rival → 1 de daño, 4 → 2, 5 → 3 (en la sala se puede elegir 4 como golpe completo: 2 → 1, 3 → 2, 4 → 3). El atacante puede terminar su ataque cuando quiera. |
| Caer a 0 Vida en la Fase 1 (regla 9) | pierde todo el equipo y los consumibles | pierde **todos los consumibles y su objeto de equipo de más Fuerza**, conserva el resto y recupera la Vida inicial |
| Quién ataca primero en el torneo | — | el de menos Fuerza + Maná |

| Nivel | Monstruo | Combinación |
| ---: | --- | --- |
| 1 | Diablillo de los Bosques | 🔴🔵 |
| 2 | Goblin | 🔴🔴 |
| 3 | Necrófago | 🔵🟢🟢 |
| 4 | Orco | 🔴🔴🔴 |
| 5 | Súcubo | 🔵🔵🟡 |
| 6 | Minotauro | 🟢🟢🟢🟡 |
| 7 | Ogro | 🔴🔴🟢🟢 |
| 8 | Trol | 🔵🔵🔵🟡 |
| 9 | Espectro | 🟢🟢🟡🟡 |
| 10 | Gólem | 🔴🔵🟢🟡 |
| 11 | Basilisco | 🔴🔴🔵🟢🟡 |
| 12 | Dragón | 🔴🔵🟢🟡🟡 |

Mantícora y Quimera se sustituyen por el Diablillo de los Bosques y el Minotauro, y los 12 monstruos se ordenan de menos a más poderosos según sus ilustraciones.

Resultado medido con bots: se gana casi el 100 % de los combates de nivel 1, en torno al 60–70 % de los de nivel 7 a 12, y el 46 % de los de nivel 6, el más duro; 0,54 caídas por héroe; Fuerza media de 21 al llegar al torneo; duelos de unos 6 ataques; menos del 1 % de duelos en los que nadie puede hacer daño; el primer clasificado gana en torno al 63 % de las partidas.

## Decisiones tomadas donde el reglamento no lo especifica

Son provisionales y fáciles de cambiar:

1. **Turnos simultáneos en la Fase 1.** Todos eligen monstruo y combaten a la vez; la ronda avanza cuando todos han terminado.
2. **Monstruos de cada ronda.** Cada jugador recibe sus propios 2 monstruos, de dos niveles distintos de entre los posibles de la ronda. En las rondas 11 y 12 son el mismo monstruo, pero con recompensas distintas.
3. **Recompensas visibles antes de elegir.** Las 2 recompensas de cada monstruo se generan al aparecer y se muestran en su carta.
4. **Recompensas:** 60 % equipo, 20 % poción y 20 % pergamino. Consumibles: Maná +X, Curación +X o Robo (solo pergaminos), con X = calidad del equipo del nivel + 1.
5. **Arma a dos manos:** da +2 de Fuerza más que un arma de una mano del mismo nivel.
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
