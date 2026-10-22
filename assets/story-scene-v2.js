/* Declarative v2 story effects. Story packages supply data and local assets only. */
(() => {
'use strict';

const ACTIONS = new Set(['rain-start', 'ears-blink', 'umbrella-open', 'rain-tap', 'splash', 'walk', 'rain-stop', 'umbrella-close']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, Number(value) || 0));
const lerp = (from, to, progress) => from + (to - from) * progress;
const smooth = value => { const p = clamp(value, 0, 1); return p * p * (3 - 2 * p); };
const range = (p, from, to) => smooth((p - from) / (to - from));

window.createStorySceneV2 = function createStorySceneV2({ stage, page, book, onInteract, settings: initialSettings = {} }) {
  if (!stage || !page || !book || typeof book.url !== 'function') throw new TypeError('A stage, page and local story package are required.');
  const actorLayer = stage.querySelector('.actor-layer');
  if (!actorLayer) throw new TypeError('The story stage needs an actor layer.');
  const settings = { voice: true, volume: 75, hints: true, ...initialSettings };
  const scene = page.scene || {};
  const records = new Map();
  const ownedNodes = [];
  let frame = 0, lastFrame = 0, clock = 0, paused = false, disposed = false, active = true;
  let job = null, sound = null, soundVersion = 0, soundAttempt = 0, soundGain = 1, finishSound = null;
  let ambience = null, ambienceLevel = 0, ambienceBlocked = false, ambienceVersion = 0;
  let playbackEnabled = false, speaking = false;
  let weather = scene.weather === 'rain' ? 'rain' : 'dry';
  let rainStrength = weather === 'rain' ? 1 : 0;

  stage.classList.add('storybook-v2');
  stage.dataset.effectPhase = 'idle';
  stage.dataset.action = '';

  function node(tag, className, parent = stage) {
    const element = document.createElement(tag);
    element.className = className;
    parent.appendChild(element);
    return element;
  }
  function owned(tag, className, before = actorLayer) {
    const element = document.createElement(tag);
    element.className = className;
    stage.insertBefore(element, before);
    ownedNodes.push(element);
    return element;
  }
  function image(path, className) {
    const img = document.createElement('img');
    img.className = className;
    img.alt = '';
    img.draggable = false;
    img.decoding = 'async';
    img.src = book.url(path);
    return img;
  }

  const clearBackground = owned('div', 'v2-clear-background');
  clearBackground.setAttribute('aria-hidden', 'true');
  if (scene.clearBackground) clearBackground.style.backgroundImage = `url("${book.url(scene.clearBackground)}")`;
  const rainLayer = owned('div', 'v2-rain-layer');
  rainLayer.setAttribute('aria-hidden', 'true');
  const effectLayer = owned('div', 'v2-effect-layer', stage.querySelector('#pause-cover'));
  effectLayer.setAttribute('aria-hidden', 'true');
  const narrationBubble = owned('div', 'v2-narration-bubble', stage.querySelector('#pause-cover'));
  narrationBubble.setAttribute('aria-live', 'polite');
  narrationBubble.setAttribute('aria-atomic', 'true');
  const bubbleLabel = node('span', 'v2-bubble-label', narrationBubble);
  const bubbleText = node('span', 'v2-bubble-text', narrationBubble);
  const rainDrops = Array.from({ length: 48 }, (_, index) => {
    const drop = node('i', 'v2-rain-drop', rainLayer);
    const near = index % 4 === 0;
    drop.style.left = `${(index * 29 + 7) % 104}%`;
    drop.style.width = near ? '.32%' : '.2%';
    drop.style.height = near ? '3.4%' : '2.2%';
    drop.style.opacity = near ? '.76' : '.44';
    return { element: drop, phase: (index * .173) % 1, speed: near ? 1050 : 1400 };
  });

  for (const meta of page.actors || []) {
    const button = node('button', 'actor v2-actor', actorLayer);
    button.type = 'button';
    button.dataset.actor = meta.id;
    button.style.setProperty('--x', `${meta.x}%`);
    button.style.setProperty('--y', `${meta.y}%`);
    button.style.setProperty('--actor-width', `${meta.width}%`);
    // The scene is 3:2, so width / image ratio must also account for stage ratio.
    const height = Number(meta.height) || Number(meta.width) * 1.5 / (Number(meta.aspectRatio) || .8);
    button.style.setProperty('--actor-height', `${height}%`);
    button.setAttribute('aria-label', `${meta.name}，点击互动`);
    const variant = meta.initialVariant || 'initial';
    const hit = meta.hitAreas?.[variant] || meta.hitArea || { x: 0, y: 0, width: 100, height: 100 };
    for (const [key, value] of Object.entries(hit)) button.style.setProperty(`--hit-${key}`, `${value}%`);
    const halo = node('span', 'halo', button);
    halo.setAttribute('aria-hidden', 'true');
    const hitArea = node('span', 'v2-hit-area', button);
    hitArea.setAttribute('aria-hidden', 'true');
    const path = meta.initialVariant ? meta.variants?.[meta.initialVariant] || meta.image : meta.image;
    const img = image(path, 'v2-actor-image');
    button.appendChild(img);
    button.dataset.variant = variant;
    button.dataset.walkOffset = '0';
    const click = () => { if (!disposed) onInteract?.(meta.id); };
    button.addEventListener('click', click);
    // Warm the image cache before the first pose change; no package markup is used.
    const preloads = Object.values(meta.variants || {}).map(path => image(path, ''));
    records.set(meta.id, { meta, button, img, height, initialVariant: variant, initialPath: path, click, preloads });
  }

  function isSun(record) { return record.meta.role === 'sun' || record.meta.id === 'sun'; }
  function hitArea(record, key) {
    const hit = record.meta.hitAreas?.[key] || record.meta.hitArea || { x: 0, y: 0, width: 100, height: 100 };
    for (const [name, value] of Object.entries(hit)) record.button.style.setProperty(`--hit-${name}`, `${value}%`);
  }
  function variant(record, key) {
    const path = key === record.initialVariant ? record.initialPath : record.meta.variants?.[key];
    if (!path) return false;
    const url = book.url(path);
    if (record.img.getAttribute('src') !== url) record.img.src = url;
    record.button.dataset.variant = key;
    hitArea(record, key);
    return true;
  }
  function setWeather(value, strength = value === 'rain' ? 1 : 0) {
    weather = value;
    rainStrength = strength;
    stage.dataset.weather = value;
    rainLayer.style.opacity = String(strength);
    rainLayer.dataset.active = String(strength > 0);
  }
  function setSun(visible, opacity = visible ? 1 : 0) {
    stage.dataset.sunVisible = String(visible);
    for (const record of records.values()) {
      if (!isSun(record)) continue;
      record.img.style.opacity = String(opacity);
      record.button.dataset.visible = String(visible);
      record.button.style.visibility = opacity > 0 ? 'visible' : 'hidden';
      record.button.setAttribute('aria-hidden', String(opacity === 0));
    }
  }
  function stopSound(state = 'none') {
    soundVersion++;
    soundAttempt++;
    if (finishSound) { const done = finishSound; finishSound = null; done(false); }
    if (sound) {
      sound.pause();
      sound.onended = null;
      sound.onerror = null;
      sound.removeAttribute('src');
      sound = null;
    }
    stage.dataset.sound = state;
  }
  function startSound(path, gain = 1) {
    stopSound();
    if (!path) return Promise.resolve(true);
    soundGain = clamp(gain, 0, 1);
    const version = soundVersion;
    const audio = new Audio(book.url(path));
    sound = audio;
    audio.preload = 'auto';
    audio.muted = !settings.voice;
    audio.volume = clamp(settings.volume, 0, 100) / 100 * soundGain;
    return new Promise(resolve => {
      finishSound = resolve;
      const done = state => {
        if (version !== soundVersion) return;
        stage.dataset.sound = state;
        if (finishSound) { const finish = finishSound; finishSound = null; finish(true); }
      };
      audio.onended = () => done('ended');
      audio.onerror = () => done('unavailable');
      stage.dataset.sound = paused ? 'paused' : 'playing';
      if (!paused) {
        const attempt = ++soundAttempt;
        audio.play().catch(() => { if (version === soundVersion && attempt === soundAttempt && !paused) done('blocked'); });
      }
    });
  }
  function stopAmbience(state = 'none', rewind = true) {
    ambienceVersion++;
    if (ambience) {
      ambience.pause();
      ambience.volume = 0;
      if (rewind) { try { ambience.currentTime = 0; } catch (_) { /* Not decoded yet. */ } }
    }
    if (rewind) ambienceLevel = 0;
    stage.dataset.ambience = state;
    stage.dataset.ambienceVolume = '0';
  }
  function updateAmbience(delta = 0) {
    const authored = scene.ambience;
    const strength = authored?.when === 'rain' ? rainStrength : 1;
    const enabled = authored?.audio && active && playbackEnabled && !paused && strength > 0;
    if (!enabled) { if (ambience && !ambience.paused) stopAmbience(paused ? 'paused' : 'silent', false); return; }
    if (!ambience) {
      ambience = new Audio(book.url(authored.audio));
      ambience.preload = 'auto';
      ambience.loop = true;
      ambience.volume = 0;
      ambience.onerror = () => { ambienceBlocked = true; stage.dataset.ambience = 'unavailable'; };
    }
    const target = clamp(authored.volume ?? .16, 0, 1) * clamp(settings.volume, 0, 100) / 100 * strength * (speaking ? .27 : 1);
    ambienceLevel += (target - ambienceLevel) * (1 - Math.exp(-Math.max(0, delta) / 90));
    ambience.volume = clamp(ambienceLevel, 0, 1);
    ambience.muted = !settings.voice;
    stage.dataset.ambienceVolume = ambience.volume.toFixed(6);
    if (ambience.paused && !ambienceBlocked) {
      stage.dataset.ambience = 'playing';
      const current = ambience;
      const version = ambienceVersion;
      current.play().then(() => {
        if (current === ambience && version === ambienceVersion && (!active || paused || !playbackEnabled)) current.pause();
      }).catch(() => { if (current === ambience && version === ambienceVersion && !paused && active) { ambienceBlocked = true; stage.dataset.ambience = 'blocked'; } });
    }
  }
  function setSpeaking(value) {
    speaking = Boolean(value);
    stage.dataset.speaking = String(speaking);
  }
  function clearTransient() {
    effectLayer.replaceChildren();
    for (const record of records.values()) {
      record.button.querySelectorAll('.v2-variant-overlay').forEach(element => element.remove());
      record.img.style.visibility = '';
    }
  }
  function baseline() {
    clearTransient();
    for (const record of records.values()) {
      record.img.src = book.url(record.initialPath);
      record.img.style.opacity = '1';
      record.button.dataset.variant = record.initialVariant;
      hitArea(record, record.initialVariant);
      record.button.dataset.walkOffset = '0';
      record.button.style.setProperty('--walk-offset', '0%');
      record.button.style.setProperty('--step-offset', '0%');
      record.button.style.setProperty('--v2-jitter-x', '0px');
      record.button.style.setProperty('--v2-jitter-y', '0px');
      record.button.style.setProperty('--v2-rotate', '0deg');
      record.button.style.visibility = '';
      record.button.removeAttribute('aria-hidden');
      record.button.classList.remove('v2-effect-active');
    }
    setWeather(scene.weather === 'rain' ? 'rain' : 'dry');
    setSun(Boolean(scene.sunVisible));
    clearBackground.style.opacity = '0';
    stage.dataset.effectProgress = '0';
  }
  function drawRain() {
    if (!rainStrength) return;
    for (const drop of rainDrops) {
      const travel = (clock / drop.speed + drop.phase) % 1;
      drop.element.style.top = `${-9 + travel * 119}%`;
      drop.element.style.transform = `translateX(${-travel * 28}px) rotate(13deg)`;
    }
  }
  function tick(now) {
    frame = 0;
    if (!active || disposed) return;
    const delta = lastFrame ? Math.max(0, now - lastFrame) : 0;
    lastFrame = now;
    if (!paused) {
      clock += delta;
      drawRain();
      if (job) {
        const currentJob = job;
        currentJob.elapsed += delta;
        const progress = clamp(currentJob.elapsed / currentJob.duration, 0, 1);
        stage.dataset.effectProgress = progress.toFixed(3);
        currentJob.update(progress);
        if (progress === 1 && job === currentJob) {
          job = null;
          currentJob.finish();
          clearTransient();
          // Let the recorded sound's tail finish naturally; navigation/replay still cancels it.
          stage.dataset.effectPhase = 'complete';
          currentJob.resolve(true);
        }
      }
      updateAmbience(delta);
    }
    frame = requestAnimationFrame(tick);
  }
  function runClock() {
    active = true;
    lastFrame = 0;
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  }
  function cancel(preserveAmbience = false) {
    const keepAmbience = preserveAmbience && weather === 'rain' && scene.weather === 'rain';
    active = false;
    playbackEnabled = false;
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
    if (job) { const resolve = job.resolve; job = null; resolve(false); }
    stopSound();
    if (!keepAmbience) stopAmbience();
    baseline();
    stage.dataset.action = '';
    stage.dataset.effectPhase = 'idle';
  }
  function reset(preserveAmbience = false) {
    if (disposed) return;
    cancel(preserveAmbience);
    playbackEnabled = true;
    ambienceBlocked = false;
    runClock();
  }
  function particle(className, x, y, width, height) {
    const element = node('i', className, effectLayer);
    element.style.left = `${x}%`;
    element.style.top = `${y}%`;
    element.style.width = `${width}%`;
    element.style.height = `${height}%`;
    return element;
  }
  function umbrellaEffect(record, open) {
    const endKey = open ? 'open' : 'closed';
    const startKey = open ? 'closed' : 'open';
    variant(record, startKey);
    const oldPath = record.meta.variants?.[startKey] || record.initialPath;
    const newPath = record.meta.variants?.[endKey];
    if (!newPath) return null;
    const oldTop = image(oldPath, 'v2-variant-overlay v2-overlay-top');
    const oldBody = image(oldPath, 'v2-variant-overlay v2-overlay-body');
    const newTop = image(newPath, 'v2-variant-overlay v2-overlay-top');
    const newBody = image(newPath, 'v2-variant-overlay v2-overlay-body');
    record.button.append(oldTop, oldBody, newTop, newBody);
    record.img.style.visibility = 'hidden';
    // Only the canopy region is revealed or clipped. No rabbit/body scaling occurs.
    return {
      update(p) {
        const fold = range(p, .08, .86);
        const body = range(p, .4, .88);
        const extent = open ? fold * 50 : (1 - fold) * 50;
        const clip = `inset(0 ${50 - extent}% 42% ${50 - extent}%)`;
        oldTop.style.clipPath = open ? 'inset(0 0 42% 0)' : clip;
        oldTop.style.opacity = String(open ? 1 - range(p, .14, .7) : 1 - range(p, .76, 1));
        newTop.style.clipPath = open ? clip : 'inset(0 0 42% 0)';
        newTop.style.opacity = String(open ? range(p, .02, .25) : range(p, .18, .84));
        oldBody.style.opacity = String(1 - body);
        newBody.style.opacity = String(body);
        record.button.dataset.variant = p < .5 ? startKey : endKey;
      },
      finish() { variant(record, endKey); record.img.style.visibility = ''; }
    };
  }

  function prepareAction(action, record, response) {
    const meta = record.meta;
    if (action === 'rain-start') {
      setWeather('dry');
      return {
        update(p) {
          record.button.style.setProperty('--v2-jitter-x', `${Math.sin(p * Math.PI * 8) * (1 - p) * 7}px`);
          record.button.style.setProperty('--v2-rotate', `${Math.sin(p * Math.PI * 6) * (1 - p) * 3}deg`);
          const strength = range(p, .16, .65);
          setWeather(strength ? 'rain' : 'dry', strength);
        },
        finish() { record.button.style.setProperty('--v2-jitter-x', '0px'); record.button.style.setProperty('--v2-rotate', '0deg'); setWeather('rain'); }
      };
    }
    if (action === 'ears-blink') {
      return {
        update(p) {
          const blink = (p > .13 && p < .3) || (p > .44 && p < .62) || (p > .73 && p < .87);
          variant(record, blink ? 'ears-blink' : record.initialVariant);
        },
        finish() { variant(record, record.initialVariant); }
      };
    }
    if (action === 'umbrella-open' || action === 'umbrella-close') return umbrellaEffect(record, action === 'umbrella-open');
    if (action === 'walk') {
      const distance = clamp(response.distanceX === undefined ? 12 : response.distanceX, -20, 20);
      return {
        update(p) {
          const offset = distance * smooth(p);
          const cycle = p * 3;
          record.button.style.setProperty('--walk-offset', `${offset}%`);
          record.button.style.setProperty('--step-offset', `${-Math.abs(Math.sin(cycle * Math.PI)) * .65}%`);
          record.button.dataset.walkOffset = offset.toFixed(3);
          variant(record, Math.floor(cycle) % 2 ? 'walk-right' : 'walk-left');
        },
        finish() {
          record.button.style.setProperty('--walk-offset', `${distance}%`);
          record.button.style.setProperty('--step-offset', '0%');
          record.button.dataset.walkOffset = String(distance);
          variant(record, record.initialVariant);
        }
      };
    }
    if (action === 'rain-stop') {
      setWeather('rain');
      setSun(false);
      return {
        update(p) {
          const clearing = range(p, .08, .86);
          setWeather(p < .86 ? 'rain' : 'dry', 1 - clearing);
          record.img.style.opacity = String(1 - range(p, .06, .78));
          record.button.style.setProperty('--v2-jitter-x', `${range(p, 0, 1) * 65}px`);
          const sun = range(p, .3, .93);
          setSun(sun > 0, sun);
          if (scene.clearBackground) clearBackground.style.opacity = String(clearing);
        },
        finish() { setWeather('dry'); setSun(true); record.img.style.opacity = '0'; if (scene.clearBackground) clearBackground.style.opacity = '1'; }
      };
    }
    if (action === 'splash') {
      const surface = meta.y - record.height * .08;
      const drops = Array.from({ length: 15 }, (_, index) => ({
        element: particle('v2-splash-particle', meta.x, surface, .65 + (index % 3) * .22, 1.7 + (index % 4) * .4),
        dx: ((index % 7) - 3) * 1.45,
        rise: 10 + (index * 7) % 12,
        delay: (index % 3) * .025
      }));
      const rings = [0, .18].map(delay => ({ element: particle('v2-splash-ring', meta.x, surface, meta.width * .6, record.height * .8), delay }));
      return {
        update(p) {
          for (const drop of drops) {
            const t = clamp((p - drop.delay) / .9, 0, 1);
            drop.element.style.left = `${meta.x + drop.dx * t}%`;
            drop.element.style.top = `${surface - Math.sin(t * Math.PI) * drop.rise + t * t * 2}%`;
            drop.element.style.opacity = String(p > drop.delay ? (1 - range(t, .55, 1)) * range(t, 0, .06) : 0);
            drop.element.style.transform = `translate(-50%,-50%) rotate(${drop.dx * 7 * t}deg)`;
          }
          for (const ring of rings) {
            const t = clamp((p - ring.delay) / .8, 0, 1);
            ring.element.style.transform = `translate(-50%,-50%) scale(${.2 + t * 1.1})`;
            ring.element.style.opacity = String(p > ring.delay ? (1 - t) * .9 : 0);
          }
        },
        finish() {}
      };
    }
    if (action === 'rain-tap') {
      const impactY = meta.y + record.height * .35;
      const drops = Array.from({ length: 3 }, (_, index) => ({
        element: particle('v2-tap-drop', meta.x + (index - 1) * 4, impactY + (index - 1) * 3.5 - 13, .9, 3),
        x: meta.x + (index - 1) * 4,
        y: impactY + (index - 1) * 3.5,
        delay: index * .24
      }));
      const splash = Array.from({ length: 9 }, (_, index) => ({
        element: particle('v2-tap-spark', meta.x, impactY, .55, .9),
        impact: Math.floor(index / 3), direction: index % 3 - 1
      }));
      return {
        update(p) {
          record.img.style.opacity = String(1 - range(p, 0, .06));
          for (const drop of drops) {
            const t = clamp((p - drop.delay) / .25, 0, 1);
            drop.element.style.top = `${lerp(drop.y - 15, drop.y, t * t)}%`;
            drop.element.style.opacity = String(p >= drop.delay && t < 1 ? 1 : 0);
          }
          for (const spark of splash) {
            const t = clamp((p - (spark.impact * .24 + .25)) / .23, 0, 1);
            spark.element.style.left = `${meta.x + (spark.impact - 1) * 4 + spark.direction * t * 4}%`;
            spark.element.style.top = `${impactY + (spark.impact - 1) * 3.5 - Math.sin(t * Math.PI) * (2.5 + Math.abs(spark.direction))}%`;
            spark.element.style.opacity = String(t > 0 && t < 1 ? 1 - t : 0);
          }
        },
        finish() { record.img.style.opacity = '1'; }
      };
    }
    return null;
  }

  function play(step) {
    if (disposed) return Promise.resolve(false);
    const response = step?.response || {};
    const record = records.get(step?.target);
    if (!record || !ACTIONS.has(response.action)) return Promise.resolve(false);
    // A repeated click replays the same change from the page's authored start state.
    reset(true);
    const action = prepareAction(response.action, record, response);
    if (!action) return Promise.resolve(false);
    stage.dataset.action = response.action;
    stage.dataset.effectPhase = 'running';
    record.button.classList.add('v2-effect-active');
    action.update(0);
    const soundResult = startSound(response.sound, response.soundVolume ?? 1);
    const animationResult = new Promise(resolve => {
      job = {
        elapsed: 0,
        duration: clamp(response.duration || 1800, 100, 5000),
        update: action.update,
        finish() { action.finish(); record.button.classList.remove('v2-effect-active'); },
        resolve
      };
    });
    return Promise.all([animationResult, soundResult]).then(results => results.every(Boolean));
  }
  function pause() {
    if (disposed || paused) return;
    paused = true;
    stage.classList.add('v2-paused');
    if (sound && !sound.ended) { soundAttempt++; sound.pause(); stage.dataset.sound = 'paused'; }
    stopAmbience('paused', false);
  }
  function resume() {
    if (disposed || !paused) return;
    paused = false;
    playbackEnabled = true;
    ambienceBlocked = false;
    lastFrame = 0;
    stage.classList.remove('v2-paused');
    if (sound && !sound.ended && stage.dataset.sound === 'paused') {
      const currentSound = sound;
      const version = soundVersion, attempt = ++soundAttempt;
      stage.dataset.sound = 'playing';
      currentSound.play().catch(() => { if (sound === currentSound && version === soundVersion && attempt === soundAttempt && !paused) { stage.dataset.sound = 'blocked'; if (finishSound) { const done = finishSound; finishSound = null; done(true); } } });
    }
  }
  function sync(nextSettings = settings) {
    Object.assign(settings, nextSettings);
    stage.classList.toggle('v2-hints-off', !settings.hints);
    if (sound) { sound.muted = !settings.voice; sound.volume = clamp(settings.volume, 0, 100) / 100 * soundGain; }
    if (ambience) {
      ambience.muted = !settings.voice;
      if (Number(settings.volume) <= 0) { ambienceLevel = 0; ambience.volume = 0; stage.dataset.ambienceVolume = '0'; }
    }
  }
  function caption(text, label = '故事旁白') {
    bubbleLabel.textContent = label;
    bubbleText.textContent = text || '';
    narrationBubble.hidden = !text;
  }
  function dispose() {
    if (disposed) return;
    cancel();
    disposed = true;
    if (ambience) { ambience.onerror = null; ambience.removeAttribute('src'); ambience = null; }
    for (const record of records.values()) { record.button.removeEventListener('click', record.click); record.button.remove(); }
    for (const element of ownedNodes) element.remove();
    stage.classList.remove('storybook-v2', 'v2-paused', 'v2-hints-off');
  }

  baseline();
  caption(page.narration?.text || '');
  sync();
  runClock();
  return { play, reset, cancel, pause, resume, sync, caption, setSpeaking, dispose };
};
})();
