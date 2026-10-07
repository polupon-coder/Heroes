# MANA en Render (jugar con amigos sin cuenta de Claude)

`servidor.js` sirve el juego (`mana/jugar.html`) y guarda las partidas en memoria. No necesita
dependencias. Las pantallas se pasan la partida a través del servidor; las reglas las sigue
calculando cada navegador, como en la versión de claude.ai.

## Publicarlo (una sola vez)

1. Entra en <https://dashboard.render.com> con tu cuenta (la misma que usaste para Heroes).
2. **New → Web Service**.
3. Elige el repositorio **polupon-coder/Heroes** (si no aparece: *Configure account* y dale acceso).
4. Rellena:
   - **Name:** `mana`
   - **Branch:** `claude/great-darwin-8fc0c0`
   - **Root Directory:** (vacío)
   - **Language:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node mana/servidor/servidor.js`
   - **Instance Type:** Free
5. En *Advanced*, **Health Check Path:** `/healthz` (opcional).
6. **Create Web Service** y espera a que ponga **Live** (2–3 minutos).
7. La dirección es del estilo `https://mana-xxxx.onrender.com`.

Cada vez que se suben cambios a la rama, Render vuelve a publicar el juego solo.

## Jugar

- Abre la dirección, pon tu nombre, **Con amigos → Crear partida** y pulsa **Copiar** para
  pasar el enlace. Tus amigos lo abren, ponen su nombre y pulsan **Unirme**.
- Plan gratuito: el servidor se duerme tras ~15 minutos sin uso y tarda 30–60 s en despertar
  (ábrelo un minuto antes). Si se reinicia, las partidas en curso se pierden.
- Los bots los mueve la pantalla de quien creó la partida: que no la cierre.

## Probarlo en tu ordenador

```
node mana/servidor/servidor.js
```

y abre <http://localhost:3000>.
