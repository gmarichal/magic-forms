(() => {
  const shapesLayer = document.getElementById('shapesLayer');
  const hint = document.getElementById('hint');
  const soundToggle = document.getElementById('soundToggle');
  const soundIcon = document.getElementById('soundIcon');

  // --- Shapes: emoji variants give free color variety, extras get a random hue-rotate ---
  const SHAPE_SETS = {
    cuadrado: { emojis: ['🟥', '🟧', '🟨', '🟩', '🟦', '🟪', '🟫', '⬛', '⬜'], hue: false },
    circulo: { emojis: ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '🟤', '⚫', '⚪'], hue: false },
    corazon: { emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💗', '💖'], hue: false },
    estrella: { emojis: ['⭐', '🌟', '✨', '💫'], hue: true },
    triangulo: { emojis: ['🔺', '🔻'], hue: true },
    arcoiris: { emojis: ['🌈'], hue: false },
    confite: { emojis: ['🎉', '🎊', '🎇', '🎆'], hue: true },
    flor: { emojis: ['🌸', '🌼', '🌻', '🌺', '🌷', '💐'], hue: false },
    mariposa: { emojis: ['🦋'], hue: true },
  };
  const SHAPE_TYPES = Object.keys(SHAPE_SETS);

  const SIZE_MIN = 32 * 1.2; // base range bumped 20%
  const SIZE_RANGE = 48 * 1.2;

  function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Builds a detached shape element (not yet positioned or attached to the DOM).
  function createShapeElement() {
    const type = randomChoice(SHAPE_TYPES);
    const set = SHAPE_SETS[type];
    const emoji = randomChoice(set.emojis);
    const el = document.createElement('div');
    el.className = 'shape';
    el.textContent = emoji;

    const size = Math.round(SIZE_MIN + Math.random() * SIZE_RANGE);
    el.style.fontSize = `${size}px`;

    if (set.hue) {
      el.style.filter = `hue-rotate(${Math.floor(Math.random() * 360)}deg)`;
    }

    const rot = Math.random() * 60 - 30;
    return { el, rot };
  }

  // --- Shapes spawned by keyboard: simple pop-in + auto fade (CSS driven) ---
  function spawnAutoShapeAt(x, y) {
    const { el, rot } = createShapeElement();
    el.classList.add('shape--auto');
    el.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    shapesLayer.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }

  function spawnShapeRandom() {
    const margin = 60;
    const x = margin + Math.random() * (window.innerWidth - margin * 2);
    const y = margin + Math.random() * (window.innerHeight - margin * 2);
    spawnAutoShapeAt(x, y);
  }

  // --- Shapes spawned by pointer: grow while held, released (fades) on pointer up ---
  const POP_DURATION = 220; // ms, initial pop-in
  const GROW_DURATION = 1300; // ms, time to reach max scale while held
  const MAX_SCALE = 2.5;
  const RELEASE_DURATION = 900; // ms, fade + drift after release

  const activePresses = new Map(); // pointerId -> press state

  function startPress(pointerId, x, y) {
    const { el, rot } = createShapeElement();
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = '0';
    el.style.transform = `translate(-50%, -50%) scale(0) rotate(${rot}deg)`;
    shapesLayer.appendChild(el);

    const state = {
      el,
      rot,
      startTime: performance.now(),
      currentScale: 0,
      rafId: null,
    };
    activePresses.set(pointerId, state);

    const step = (now) => {
      const elapsed = now - state.startTime;
      let scale;
      if (elapsed < POP_DURATION) {
        const t = elapsed / POP_DURATION;
        scale = t;
        el.style.opacity = `${t}`;
      } else {
        el.style.opacity = '1';
        const t = Math.min((elapsed - POP_DURATION) / GROW_DURATION, 1);
        scale = 1 + t * (MAX_SCALE - 1);
      }
      state.currentScale = scale;
      el.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${rot}deg)`;
      state.rafId = requestAnimationFrame(step);
    };
    state.rafId = requestAnimationFrame(step);
  }

  function endPress(pointerId) {
    const state = activePresses.get(pointerId);
    if (!state) return;
    cancelAnimationFrame(state.rafId);
    activePresses.delete(pointerId);
    releaseShape(state.el, state.currentScale || 1, state.rot);
  }

  function releaseShape(el, fromScale, rot) {
    const start = performance.now();
    const step = (now) => {
      const t = Math.min((now - start) / RELEASE_DURATION, 1);
      const scale = fromScale * (1 - 0.15 * t);
      const drift = 60 * t;
      el.style.opacity = `${1 - t}`;
      el.style.transform = `translate(-50%, calc(-50% - ${drift}px)) scale(${scale}) rotate(${rot}deg)`;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        el.remove();
      }
    };
    requestAnimationFrame(step);
  }

  // --- Sound (Web Audio API, no external files) ---
  let audioCtx = null;
  let soundEnabled = localStorage.getItem('shapesSoundEnabled') !== 'off';

  function updateSoundIcon() {
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.classList.toggle('muted', !soundEnabled);
  }
  updateSoundIcon();

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playVariantRisingPop() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const baseFreq = 400 + Math.random() * 500;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.8, now + 0.12);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  function playVariantFallingBoop() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const baseFreq = 700 + Math.random() * 500;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.5, now + 0.18);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  function playVariantChime() {
    const ctx = ensureAudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const baseFreq = 500 + Math.random() * 300;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.setValueAtTime(baseFreq * 1.5, now + 0.09);
    osc.frequency.setValueAtTime(baseFreq * 1.2, now + 0.16);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);

    osc.start(now);
    osc.stop(now + 0.32);
  }

  const SOUND_VARIANTS = [playVariantRisingPop, playVariantFallingBoop, playVariantChime];

  function playPop() {
    if (!soundEnabled) return;
    ensureAudioCtx();
    randomChoice(SOUND_VARIANTS)();
  }

  soundToggle.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem('shapesSoundEnabled', soundEnabled ? 'on' : 'off');
    updateSoundIcon();
    if (soundEnabled) {
      ensureAudioCtx();
      playPop();
    }
  });

  // --- Background cycling every 8 interactions: light, dark and gradient variants ---
  let interactionCount = 0;

  function hue() {
    return Math.floor(Math.random() * 360);
  }

  function randomLightSolid() {
    return `hsl(${hue()}, 70%, 88%)`;
  }

  function randomDarkSolid() {
    return `hsl(${hue()}, 45%, 16%)`;
  }

  function randomLightGradient() {
    const angle = Math.floor(Math.random() * 360);
    return `linear-gradient(${angle}deg, hsl(${hue()}, 75%, 88%), hsl(${hue()}, 80%, 82%))`;
  }

  function randomDarkGradient() {
    const angle = Math.floor(Math.random() * 360);
    return `linear-gradient(${angle}deg, hsl(${hue()}, 55%, 10%), hsl(${hue()}, 50%, 22%))`;
  }

  function randomVividGradient() {
    const angle = Math.floor(Math.random() * 360);
    return `linear-gradient(${angle}deg, hsl(${hue()}, 80%, 65%), hsl(${hue()}, 85%, 55%), hsl(${hue()}, 80%, 70%))`;
  }

  const BACKGROUND_GENERATORS = [
    randomLightSolid,
    randomDarkSolid,
    randomLightGradient,
    randomDarkGradient,
    randomVividGradient,
  ];

  function randomBackground() {
    return randomChoice(BACKGROUND_GENERATORS)();
  }

  // Crossfade between two stacked full-screen layers since gradients can't be
  // interpolated by a CSS transition the way solid colors can.
  const bgLayer1 = document.getElementById('bgLayer1');
  const bgLayer2 = document.getElementById('bgLayer2');
  let activeBgLayer = bgLayer1;
  let inactiveBgLayer = bgLayer2;

  function crossfadeBackground(background) {
    inactiveBgLayer.style.background = background;
    requestAnimationFrame(() => {
      inactiveBgLayer.style.opacity = '1';
      activeBgLayer.style.opacity = '0';
      const swap = activeBgLayer;
      activeBgLayer = inactiveBgLayer;
      inactiveBgLayer = swap;
    });
  }

  function registerInteraction() {
    interactionCount++;
    if (interactionCount % 8 === 0) {
      crossfadeBackground(randomBackground());
    }
    if (!hint.classList.contains('hidden')) {
      hint.classList.add('hidden');
    }
  }

  // --- Input handlers ---
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#soundToggle')) return;
    if (e.button !== undefined && e.button !== 0) return;
    startPress(e.pointerId, e.clientX, e.clientY);
    playPop();
    registerInteraction();
  });

  window.addEventListener('pointerup', (e) => endPress(e.pointerId));
  window.addEventListener('pointercancel', (e) => endPress(e.pointerId));
  window.addEventListener('blur', () => {
    activePresses.forEach((_, id) => endPress(id));
  });

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    spawnShapeRandom();
    playPop();
    registerInteraction();
  });

  document.addEventListener('contextmenu', (e) => e.preventDefault());
})();
