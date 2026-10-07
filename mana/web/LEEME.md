# MANA en el navegador

- **Jugar:** abre `mana/jugar.html` (un solo archivo, funciona sin conexión). Tú contra 1, 2 o 3 bots.
- **Generarlo:** `node mana/web/construir.js` empaqueta `web/jugar.html` con el motor (`motor.js`), las cartas (`cartas.js`) y las explicaciones (`maqueta/acciones.js`). Con una ruta como argumento escribe además la versión para publicar como página.
- **Pruebas rápidas:** `jugar.html?rapido` acelera los turnos de los bots.

- **Guía:** mensajes lilas que explican cada paso (se apagan en «Ayuda», arriba a la izquierda).

Limitación de esta versión de prueba: al jugar una Acción con objetivos (a quién retiras, dónde proteges, qué carta recuperas…) el juego los elige solo, lo mejor para ti.
