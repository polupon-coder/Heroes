'use strict';
// Servidor de MANA para jugar con amigos sin cuenta de Claude.
// Sirve el juego (mana/jugar.html) y guarda las partidas en memoria: documentos JSON por ruta,
// que las pantallas leen, escriben y escuchan en directo (Server-Sent Events). Sin dependencias.
// Uso: node mana/servidor/servidor.js   (puerto: variable PORT, por defecto 3000)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PUERTO = Number(process.env.PORT) || 3000;
const JUEGO = path.join(__dirname, '..', 'jugar.html');
const MAX_CUERPO = 2 * 1024 * 1024; // una partida exportada ocupa unas decenas de KB
const CADUCA = 24 * 60 * 60 * 1000; // las partidas se borran tras un día sin cambios

// La página es la misma que en claude.ai; aquí se le indica que hable con este servidor
let pagina = '';
function cargarPagina() {
  const html = fs.readFileSync(JUEGO, 'utf8');
  pagina = html.replace('<head>', '<head>\n<script>window.MANA_SERVIDOR = true;</script>');
}
cargarPagina();

// ---------- Almacén ----------
// docs: ruta → { data, t }. Una ruta de documento tiene un número par de tramos (partidas/ABCD,
// partidas/ABCD/sala/u1); una colección, impar (partidas/ABCD/sala).
const docs = new Map();
const oyentes = new Set(); // { ruta, coleccion, res }

const rutaValida = (r) => typeof r === 'string' && r.length < 200 && /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*$/.test(r);
const esDoc = (r) => r.split('/').length % 2 === 0;
const hijosDe = (col) => [...docs.entries()]
  .filter(([r]) => r.startsWith(col + '/') && !r.slice(col.length + 1).includes('/'))
  .map(([r, d]) => ({ id: r.split('/').pop(), data: d.data }))
  .sort((a, b) => (a.data.t || 0) - (b.data.t || 0));

const instantanea = (o) => (o.coleccion ? { docs: hijosDe(o.ruta) } : { exists: docs.has(o.ruta), data: docs.has(o.ruta) ? docs.get(o.ruta).data : null });
const enviar = (o) => o.res.write(`data: ${JSON.stringify(instantanea(o))}\n\n`);

function avisar(ruta) {
  const padre = ruta.split('/').slice(0, -1).join('/');
  for (const o of oyentes) if ((!o.coleccion && o.ruta === ruta) || (o.coleccion && o.ruta === padre)) enviar(o);
}

setInterval(() => {
  const ahora = Date.now();
  for (const [r, d] of docs) if (ahora - d.t > CADUCA) docs.delete(r);
}, 60 * 60 * 1000).unref();

// ---------- HTTP ----------
function leerCuerpo(req) {
  return new Promise((ok, mal) => {
    let n = 0;
    const trozos = [];
    req.on('data', (c) => {
      n += c.length;
      if (n > MAX_CUERPO) { mal(new Error('demasiado grande')); req.destroy(); } else trozos.push(c);
    });
    req.on('end', () => ok(Buffer.concat(trozos).toString('utf8')));
    req.on('error', mal);
  });
}

const json = (res, codigo, obj) => { res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const ruta = url.searchParams.get('ruta');
  try {
    if (url.pathname === '/healthz') return json(res, 200, { ok: true });
    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(pagina);
    }
    if (url.pathname === '/api/doc') {
      if (!rutaValida(ruta) || !esDoc(ruta)) return json(res, 400, { error: 'ruta' });
      if (req.method === 'GET') return json(res, 200, { exists: docs.has(ruta), data: docs.has(ruta) ? docs.get(ruta).data : null });
      if (req.method === 'POST') {
        const data = JSON.parse(await leerCuerpo(req));
        if (!data || typeof data !== 'object' || Array.isArray(data)) return json(res, 400, { error: 'cuerpo' });
        docs.set(ruta, { data, t: Date.now() });
        avisar(ruta);
        return json(res, 200, { ok: true });
      }
      return json(res, 405, { error: 'método' });
    }
    if (url.pathname === '/api/escuchar') {
      if (!rutaValida(ruta)) return json(res, 400, { error: 'ruta' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      const o = { ruta, coleccion: !esDoc(ruta), res };
      oyentes.add(o);
      enviar(o);
      const latido = setInterval(() => res.write(': latido\n\n'), 25000);
      req.on('close', () => { clearInterval(latido); oyentes.delete(o); });
      return;
    }
    json(res, 404, { error: 'no existe' });
  } catch (e) {
    json(res, 400, { error: String(e.message || e) });
  }
});

servidor.listen(PUERTO, () => console.log(`MANA escuchando en el puerto ${PUERTO}`));
module.exports = servidor;
