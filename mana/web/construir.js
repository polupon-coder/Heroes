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
poner('/*ACCIONES*/', leer('maqueta/acciones.js'));
poner('/*MODULOS*/', modulos);
fs.writeFileSync(path.join(raiz, 'jugar.html'), html);
console.log(`mana/jugar.html generado (${Math.round(html.length / 1024)} KB)`);
