'use strict';
// Empaqueta el juego en un solo archivo: mana/jugar.html (motor, cartas y explicaciones incluidos).
// Uso: node mana/web/construir.js
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const leer = (f) => fs.readFileSync(path.join(raiz, f), 'utf8');

// Mini-sistema de módulos para usar en el navegador los mismos archivos que usa Node
const modulo = (nombre, archivo) => `__def('${nombre}', function (module, exports) {\n${leer(archivo)}\n});`;
const modulos = `
const __mods = {};
function __def(n, f) { __mods[n] = { f, e: null }; }
function require(n) {
  n = n.split('/').pop().replace(/\\.js$/, '');
  const m = __mods[n];
  if (!m.e) { const module = { exports: {} }; m.f(module, module.exports); m.e = module.exports; }
  return m.e;
}
${modulo('cartas', 'cartas.js')}
${modulo('motor', 'motor.js')}
`;

let html = leer('web/jugar.html');
const poner = (marca, codigo) => {
  if (!html.includes(marca)) throw new Error(`Falta ${marca} en jugar.html`);
  if (codigo.includes('</script')) throw new Error('El código no puede contener </script>');
  html = html.replace(marca, () => codigo);
};
// Texturas: se incrustan en el archivo para que funcione sin carpetas al lado
// En <img src="url(texturas/x.webp)"> se deja solo el data URI
html = html.replace(/src="url\(texturas\/([a-z-]+)\.webp\)"/g, (_, n) =>
  `src="data:image/webp;base64,${fs.readFileSync(path.join(__dirname, 'texturas', n + '.webp')).toString('base64')}"`);
html = html.replace(/url\(texturas\/([a-z-]+)\.webp\)/g, (_, n) =>
  `url(data:image/webp;base64,${fs.readFileSync(path.join(__dirname, 'texturas', n + '.webp')).toString('base64')})`);
html = html.replace(/url\(texturas\/([a-z-]+)\.woff2\)/g, (_, n) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(__dirname, 'texturas', n + '.woff2')).toString('base64')})`);
// Ilustraciones: web/elementales/<nombre de la carta>.webp
const dirImg = path.join(__dirname, 'elementales');
const imagenes = {};
for (const f of fs.existsSync(dirImg) ? fs.readdirSync(dirImg) : []) {
  if (f.endsWith('.webp')) imagenes[f.slice(0, -5).normalize('NFC')] = `data:image/webp;base64,${fs.readFileSync(path.join(dirImg, f)).toString('base64')}`;
}
poner('/*IMAGENES*/{}', JSON.stringify(imagenes));
poner('/*ACCIONES*/', leer('maqueta/acciones.js'));
poner('/*MODULOS*/', modulos);
fs.writeFileSync(path.join(raiz, 'jugar.html'), html);

// Versión para publicar como página (sin envoltura html/head/body; la pone quien la publica)
const destino = process.argv[2];
if (destino) {
  const pagina = html
    .replace(/<!doctype html>\s*/i, '')
    .replace(/<html[^>]*>\s*/i, '')
    .replace(/<head>\s*/i, '')
    .replace(/<meta charset="utf-8">\s*/i, '')
    .replace(/<meta name="viewport"[^>]*>\s*/i, '')
    .replace(/<\/head>\s*/i, '')
    .replace(/<body>\s*/i, '')
    .replace(/\s*<\/body>\s*<\/html>\s*$/i, '\n');
  fs.writeFileSync(destino, pagina);
  console.log(`versión para publicar: ${destino}`);
}
console.log(`mana/jugar.html generado (${Math.round(html.length / 1024)} KB)`);
