/* Page-level story lock. Browser / OS escape routes remain under user control. */
window.createStoryLock = function createStoryLock(options) {
  'use strict';
  const player = document.querySelector('#story-player');
  const lock = document.querySelector('#story-lock');
  const tip = document.querySelector('#story-lock-tip');
  const gate = document.querySelector('#fullscreen-gate');
  const gateTitle = document.querySelector('#fullscreen-gate-title');
  const gateCopy = document.querySelector('#fullscreen-gate-copy');
  const retry = document.querySelector('#fullscreen-retry');
  const fallback = document.querySelector('#window-continue');
  const ending = document.querySelector('#story-ending');
  const dialog = document.querySelector('#parent-dialog');
  let active = false;
  let finished = false;
  let entering = false;
  let windowMode = false;
  let interrupted = false;
  let unlocked = false;
  let sawFullscreen = false;
  let holdStart = 0;
  let holdFrame = 0;
  let holdTimeout;
  let holdPointer = null;
  let swallowClick = false;
  let tipTimer;
  const previousInert = new Map();
  const HOLD_MS = 2000;

  function protectPage() {
    active = true;
    player.classList.add('story-immersive');
    player.dataset.locked = 'true';
    document.body.classList.add('story-active');
    lock.hidden = false;
    // These regions are both visually hidden and removed from keyboard / pointer interaction.
    const blocked = [...document.querySelectorAll('.reader-shell > .site-header'),
      ...player.querySelectorAll('.reader-topline, .reader-controls, .reading-tip')];
    for (const element of blocked) {
      if (!previousInert.has(element)) previousInert.set(element, element.inert);
      element.inert = true;
    }
  }

  function relock() {
    unlocked = false;
    player.dataset.locked = 'true';
    lock.setAttribute('aria-label', '故事已锁定，长按两秒打开家长控制');
    lock.focus({preventScroll: true});
  }

  function cancelHold() {
    cancelAnimationFrame(holdFrame);
    clearTimeout(holdTimeout);
    holdFrame = 0;
    holdStart = 0;
    holdPointer = null;
    lock.style.setProperty('--hold', '0');
    lock.classList.remove('holding');
  }

  function unlock() {
    if (!active || entering || dialog.open || !holdStart) return;
    cancelHold();
    swallowClick = true;
    unlocked = true;
    player.dataset.locked = 'false';
    tip.hidden = true;
    options.onUnlock();
  }

  function startHold() {
    if (!active || entering || dialog.open || holdStart) return;
    holdStart = performance.now();
    lock.classList.add('holding');
    tip.textContent = '继续按住，打开家长控制';
    tip.hidden = false;
    clearTimeout(tipTimer);
    holdTimeout = setTimeout(unlock, HOLD_MS);
    function tick(now) {
      if (!holdStart) return;
      const progress = Math.max(0, Math.min(1, (now - holdStart) / HOLD_MS));
      lock.style.setProperty('--hold', String(progress));
      if (progress < 1) holdFrame = requestAnimationFrame(tick);
    }
    holdFrame = requestAnimationFrame(tick);
  }

  lock.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    swallowClick = false;
    startHold();
    holdPointer = event.pointerId;
    lock.setPointerCapture(event.pointerId);
  });
  lock.addEventListener('pointermove', event => {
    if (holdPointer !== event.pointerId) return;
    const r = lock.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) cancelHold();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) lock.addEventListener(name, cancelHold);
  window.addEventListener('blur', cancelHold);
  lock.addEventListener('keydown', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) { swallowClick = false; startHold(); }
  });
  lock.addEventListener('keyup', event => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    cancelHold();
  });
  lock.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    tip.textContent = '长按小锁 2 秒，打开家长控制';
    tip.hidden = false;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tip.hidden = true; }, 2500);
  });
  lock.addEventListener('contextmenu', event => event.preventDefault());

  function showGate(reason) {
    interrupted = true;
    options.onPause();
    gateTitle.textContent = reason === 'unsupported' ? '暂时无法进入全屏' : '故事在这里等你';
    gateCopy.textContent = reason === 'unsupported'
      ? '可以重试全屏，或继续使用已锁定的窗口阅读。'
      : '阅读已暂停，点击下面的按钮回到全屏故事。';
    retry.textContent = reason === 'unsupported' ? '重试进入全屏' : '回到全屏故事';
    fallback.hidden = reason !== 'unsupported';
    gate.hidden = false;
    retry.focus({preventScroll: true});
  }

  async function enter() {
    if (entering) return;
    entering = true;
    protectPage();
    gate.hidden = true;
    try {
      if (!player.requestFullscreen || !document.fullscreenEnabled) throw new Error('fullscreen unavailable');
      // Must run synchronously in the trusted input handler, before awaiting anything.
      await player.requestFullscreen({navigationUI: 'hide'});
      if (document.fullscreenElement !== player) throw new Error('fullscreen not active');
      sawFullscreen = true;
      windowMode = false;
      interrupted = false;
      player.dataset.fullscreen = 'native';
      if (!options.hasStarted()) options.onStart();
      else if (!finished) options.onResume();
      lock.focus({preventScroll: true});
    } catch {
      player.dataset.fullscreen = 'unavailable';
      showGate('unsupported');
    } finally {
      entering = false;
    }
  }

  retry.addEventListener('click', enter);
  fallback.addEventListener('click', () => {
    windowMode = true;
    interrupted = false;
    player.dataset.fullscreen = 'window';
    gate.hidden = true;
    if (!options.hasStarted()) options.onStart();
    else if (!finished) options.onResume();
    lock.focus({preventScroll: true});
  });
  document.addEventListener('fullscreenchange', () => {
    if (!active) return;
    if (document.fullscreenElement === player) {
      sawFullscreen = true;
      return;
    }
    if (sawFullscreen) {
      sawFullscreen = false;
      windowMode = false;
      if (dialog.open) dialog.close();
      showGate('interrupted');
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelHold(); if (active) options.onPause(); }
  });

  // Lock application navigation and tool actions even if a hidden button is clicked programmatically.
  document.addEventListener('click', event => {
    if (!active) return;
    const element = event.target instanceof Element ? event.target : null;
    const allowed = dialog.open ? element?.closest('#parent-dialog') : element?.closest(
      '#story-lock, #fullscreen-retry, #window-continue, #ending-restart, #stage .actor, #prev-page, #next-page, #resume-stage');
    if (!allowed || (!dialog.open && gate.hidden === false && !element?.closest('#story-lock, #fullscreen-retry, #window-continue'))) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
  player.addEventListener('contextmenu', event => { if (active && !unlocked) event.preventDefault(); });

  dialog.addEventListener('cancel', () => cancelHold());
  dialog.addEventListener('close', () => { if (active) relock(); });

  async function exit() {
    if (!unlocked) return;
    active = false;
    cancelHold();
    options.onExit();
    if (dialog.open) dialog.close();
    try { if (document.fullscreenElement === player) await document.exitFullscreen(); } catch { /* Navigation below also leaves fullscreen. */ }
    document.body.classList.remove('story-active');
    player.classList.remove('story-immersive');
    for (const [element, value] of previousInert) element.inert = value;
    options.onLeave();
  }
  document.querySelector('#exit-story').addEventListener('click', exit);
  document.querySelector('#ending-restart').addEventListener('click', () => options.onRestart());

  return {
    enter,
    get active() { return active; },
    get finished() { return finished; },
    get blocked() { return active && (interrupted || entering); },
    get locked() { return active && !unlocked; },
    canResume() { return !active || (!interrupted && (windowMode || document.fullscreenElement === player)); },
    finish() {
      finished = true;
      cancelHold();
      options.onPause();
      player.classList.add('story-finished');
      document.querySelector('#stage').inert = true;
      ending.hidden = false;
      document.querySelector('#ending-restart').focus({preventScroll: true});
    },
    resetEnd() {
      finished = false;
      player.classList.remove('story-finished');
      document.querySelector('#stage').inert = false;
      ending.hidden = true;
    }
  };
};
