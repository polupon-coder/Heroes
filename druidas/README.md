# 🌿 ESCUELA DE MAGIA — El bosque de los druidas

Juego de mesa virtual para jugar con amigos por internet, basado en el **Reglamento v1.11**.

Cada jugador es un aprendiz de druida con un animal del bosque. Durante 10 rondas recoge ingredientes de El Claro, estudia hechizos y recetas de pociones y usa la magia (también en los turnos de los demás). Gana quien consiga más **Prestigio**.

## Jugar en local

Requisitos: [Node.js](https://nodejs.org) 18 o superior.

```bash
cd druidas
npm install
npm start
```

Abre <http://localhost:3000>, escribe tu nombre y pulsa **Crear partida**. Comparte el enlace o el código de 4 letras. El anfitrión puede añadir **bots** hasta llegar a 4 jugadores (mínimo 2).

## Publicarlo en Render.com

1. En Render: **New +** → **Web Service** y elige el repositorio **Heroes**.
2. **Branch:** la rama donde esté el juego. **Root Directory:** `druidas`.
3. **Build Command:** `npm install` · **Start Command:** `npm start` · plan **Free**.
4. **Health Check Path:** `/healthz`.

## Cómo se juega en la web

- **Tu turno:** 1) *Recoger*: pulsa 3 ingredientes de El Claro (5 con el Zorro). 2) *Ataques*: los rivales tienen unos segundos para atacarte; si te atacan, puedes defenderte con Burbuja. 3) *Estudiar*: elige un conocimiento disponible y pulsa ingredientes de tu reserva para colocarlos. 4) *Preparar*: prepara una poción que conozcas. Si acabas con más de 6 ingredientes, eliges cuáles devuelves.
- **Magia:** los hechizos y las pociones de la Mesa del druida se iluminan cuando puedes usarlos (púlsalos), también durante los turnos rivales (un efecto por jugador en cada turno). Chispa es gratis una vez en tu turno.
- **Ataques (Robo, Lío y Sueño):** cuando el jugador activo termina de recoger, a cada rival que puede atacar le aparecen los botones de ataque. Si atacan varios, se resuelve el primero en el orden de juego. Si nadie decide a tiempo (25 s), se sigue sin ataque.
- **Todo es público:** se ven las reservas, las recetas en estudio y las pociones preparadas de todos.
- **Reconexión:** si se cierra el navegador, al volver a abrir el enlace vuelves a tu partida.

## Pantalla de juego

Sigue el esquema de interfaz (PC, 1920 × 1080): arriba los **Conocimientos disponibles** (pulsa uno para ver la carta y estudiarla); en el centro **Druida activo** (tu druida, tu mascota con su habilidad especial y tu reserva), **El Claro** y la **Receta en estudio**; abajo la **Mesa del druida** (ingredientes por tipo, hechizos aprendidos y pociones preparadas, que se pulsan para usarlos), y a la derecha los **Druidas rivales**. Lo que toca hacer en cada momento aparece en la barra de la cabecera. En pantallas más pequeñas los paneles se apilan.

## Ilustraciones

El juego muestra dibujos provisionales hasta que estén las ilustraciones. Basta con dejar los archivos (`.webp`, `.png`, `.jpg` o `.svg`) en estas carpetas, con estos nombres:

| Carpeta | Archivos |
| --- | --- |
| `public/img/druidas/` | `mostaza`, `azul`, `verde`, `lila` |
| `public/img/mascotas/` | `lechuza`, `zorro`, `liebre`, `cervatillo` |
| `public/img/cartas/` | `robo`, `cambio`, `idea`, `lio`, `memoria`, `sueno`, `suerte`, `pensar` |
| `public/img/ingredientes/` | `eter`, `umbra`, `lumen`, `raiz` |
| `public/img/ui/` | `claro` (fondo de El Claro) |

## Estructura

| Archivo | Contenido |
| --- | --- |
| `src/config.js` | **Todas las tablas del reglamento** (ingredientes, conocimientos, costes, mascotas, límites). Para equilibrar el juego, se cambia aquí. |
| `src/game.js` | Motor de reglas: turnos, fases, ventana de ataque, defensa y magia. |
| `src/bot.js` | Bots. |
| `src/server.js` | Servidor web y salas (Express + Socket.IO). |
| `public/` | Cliente web. |
| `test/` | Pruebas de reglas y simulación de partidas entre bots (`npm test`). |

## Decisiones de interpretación del reglamento

- Los ataques (Robo, Lío y Sueño) siempre van contra el **jugador activo**, en la ventana entre su recogida y su estudio. Los efectos extra del atacante (colocar el ingrediente robado, el comodín de Lío y el ingrediente de Sueño) se eligen al declarar el ataque.
- La magia que no es un ataque (Cambio, Memoria, Pensar y Suerte) se puede usar en cualquier momento del turno de otro jugador, salvo mientras se resuelve una defensa. Idea solo se lanza en tu fase de estudio.
- El Cervatillo se activa tras cualquier magia que no sea Chispa, incluidos Burbuja y beber pociones.
- La Lechuza termina tu estudio normal: después ya no puedes colocar más ingredientes en esa fase.
