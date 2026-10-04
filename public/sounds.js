/* Sonidos de HÉROES (los mismos de Imperio). Se pueden silenciar; la elección se recuerda. */
'use strict';

const Sounds = (() => {
  const KEY = 'heroes:mudo';
  const FILE = {
    boton: 'boton.wav',
    ficha: 'ficha.wav',
    turno: 'turno.wav',
    dados: 'dados.mp3',
    batalla: 'batalla.mp3',
    celebracion: 'celebracion.mp3',
    derrota: 'derrota.mp3',
    victoria: 'victoria.mp3',
    construir: 'construir.mp3',
    fe: 'fe.mp3',
    destruccion: 'destruccion.mp3',
    conquista: 'conquista.mp3',
    arquero: 'arquero.mp3',
    infanteria: 'infanteria.mp3',
    rugido: 'rugido.mp3',
  };
  // Volúmenes igualados (los mismos que en Imperio).
  const VOLUME = {
    fe: 0.36, destruccion: 0.29, derrota: 0.32, construir: 0.63, batalla: 0.76, celebracion: 0.43,
    dados: 0.75, victoria: 0.8, infanteria: 0.6, arquero: 0.35, conquista: 1, rugido: 0.6,
  };
  const cache = new Map();
  let muted = false;
  try { muted = localStorage.getItem(KEY) === '1'; } catch { /* sin almacenamiento */ }

  function play(name, delay = 0) {
    if (muted || !FILE[name]) return;
    const go = () => {
      let base = cache.get(name);
      if (!base) { base = new Audio(`sonidos/${FILE[name]}`); cache.set(name, base); }
      const a = base.cloneNode();
      a.volume = VOLUME[name] ?? 0.8;
      a.play().catch(() => {});
    };
    if (delay) setTimeout(go, delay); else go();
  }

  // Música de la portada, la sala y el Torneo, en bucle y muy suave.
  const music = new Audio('sonidos/musica-aventura.mp3');
  music.loop = true;
  music.volume = 0.2;
  music.preload = 'auto';
  let musicWanted = false;
  function updateMusic() {
    if (!musicWanted || muted) music.pause();
    else music.play().catch(() => {});
  }
  function setMusic(on) { if (musicWanted !== on) { musicWanted = on; updateMusic(); } }
  for (const ev of ['pointerdown', 'touchstart', 'keydown']) {
    window.addEventListener(ev, () => { if (musicWanted && !muted && music.paused) updateMusic(); }, { capture: true });
  }

  function toggle() {
    muted = !muted;
    try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch { /* nada */ }
    updateMusic();
    return muted;
  }

  // Toque corto al pulsar cualquier botón.
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b && !b.disabled && !b.classList.contains('silent')) play('boton');
  }, true);

  return { play, setMusic, toggle, isMuted: () => muted };
})();

// Icono de altavoz (como en Imperio).
function speakerIcon(muted) {
  return `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" stroke="none"/>
    ${muted ? '<path d="M17 9l5 6M22 9l-5 6"/>' : '<path d="M16.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M19 7a7 7 0 0 1 0 10"/>'}
  </svg>`;
}
