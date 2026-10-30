(() => {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  if (!document.body) return;

  const bullArt = '<svg class="wallstreet-bull-photo" viewBox="128 4 1212 896" aria-hidden="true" focusable="false"><image href="/assets/charging-bull-original-silver.png" width="1735" height="906"/></svg><span class="wallstreet-bull-prep" aria-hidden="true"></span>';
  const nativeCursorArea = target => !!target?.closest?.('[data-native-cursor]');
  let cursor = null;
  let gaitReady = false;
  let prepReady = false;
  const preload = (src, ready) => {
    const img = document.createElement('img');
    img.fetchPriority = 'high';
    img.decoding = 'sync';
    return new Promise(resolve => {
      img.addEventListener('load', async () => {
        try { if (img.decode) await img.decode(); } catch {}
        ready?.();
        resolve(true);
      }, { once: true });
      img.addEventListener('error', () => resolve(false), { once: true });
      img.src = src;
    });
  };
  const originalLoaded = preload('/assets/charging-bull-original-silver.png');
  const gaitLoaded = preload('/assets/charging-bull-natural-gait.png', () => { gaitReady = true; });
  preload('/assets/charging-bull-preparation.png', () => {
    prepReady = true;
    cursor?.classList.add('has-prep');
  });

  let pointerX = 0;
  let pointerY = 0;
  if (finePointer.matches && document.body) {
    cursor = document.createElement('div');
    cursor.className = 'money-cursor';
    cursor.setAttribute('aria-hidden', 'true');
    cursor.innerHTML = bullArt;
    document.body.append(cursor);
    document.body.classList.add('money-cursor-enabled');

    cursor.classList.add('is-bull');

    let frameQueued = false;
    window.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointerX = Math.round(event.clientX);
      pointerY = Math.round(event.clientY);
      cursor.classList.add('is-visible');
      cursor.classList.toggle('is-native-area', nativeCursorArea(event.target));
      if (frameQueued) return;
      frameQueued = true;
      requestAnimationFrame(() => {
        const offsetX = 26;
        const offsetY = 25;
        cursor.style.transform = `translate3d(${pointerX - offsetX}px,${pointerY - offsetY}px,0)`;
        frameQueued = false;
      });
    }, { passive: true });
    window.addEventListener('blur', () => cursor.classList.remove('is-visible'));
    window.addEventListener('focus', () => cursor.classList.add('is-visible'));
  }

  let press = null;
  let clickToSuppress = null;
  let bullRunning = false;
  const runBull = async (start, release) => {
    if (bullRunning) return;
    bullRunning = true;
    await Promise.all([originalLoaded, gaitLoaded]);
    cursor?.classList.remove('is-charging');
    const runner = document.createElement('div');
    runner.className = 'money-bull-runner';
    runner.setAttribute('aria-hidden', 'true');
    runner.innerHTML = bullArt;


    const power = Math.min(1, (performance.now() - start.startedAt) / 1500);
    const duration = 1050 + power * 150;
    runner.style.setProperty('--bull-run-x', `${(window.innerWidth / 2 - release.x) * 0.12}px`);
    runner.style.setProperty('--bull-run-y', `${Math.min(130, Math.max(0, window.innerHeight - release.y) * 0.3)}px`);
    const scale = 3.5 + power;
    const width = 104 * scale;
    const height = 78 * scale;
    runner.style.width = width + 'px';
    runner.style.height = height + 'px';
    runner.style.left = (release.x - width * .55) + 'px';
    runner.style.top = (release.y - height * .7) + 'px';
    runner.style.setProperty('--bull-start-scale', String(48 / width));
    runner.style.setProperty('--bull-run-time', `${duration}ms`);
    const gait = document.createElement('span');
    gait.className = 'wallstreet-bull-gait';
    runner.append(gait);
    document.body.append(runner);
    const runStartedAt = performance.now();
    let gaitAnimation = null;
    const showNaturalGait = () => {
      if (runner.isConnected === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      runner.classList.add('has-natural-gait');
      const frames = Array.from({ length: 25 }, (_, step) => {
        const frame = step % 8;
        return {
          backgroundPosition: `${(frame % 4) * 100 / 3}% ${frame < 4 ? 0 : 100}%`,
          offset: (Math.sqrt(1 + step) - 1) / 4,
          easing: 'steps(1, end)',
        };
      });
      gaitAnimation = gait.animate(frames, { duration, fill: 'both' });
      gaitAnimation.currentTime = Math.min(duration, performance.now() - runStartedAt);
    };
    if (gaitReady) showNaturalGait();

    cursor?.classList.add('is-released');
    window.setTimeout(() => {
      runner.remove();
      gaitAnimation?.cancel();

      bullRunning = false;
      cursor?.classList.remove('is-released');
    }, duration);
  };

  document.addEventListener('pointerdown', (event) => {
    if (!['mouse', 'pen', 'touch'].includes(event.pointerType) || event.button !== 0) return;
    if (nativeCursorArea(event.target)) {
      press = null;
      cursor?.classList.remove('is-charging', 'is-tap');
      cursor?.classList.add('is-native-area');
      return;
    }
    if (bullRunning) return;
    press = {
      x: event.clientX, y: event.clientY,
      startedAt: performance.now(), pointerId: event.pointerId,
      target: event.target.closest?.('a,button,[role="button"]') || null,
    };
    cursor?.classList.add('is-charging');
    if (prepReady) cursor?.classList.add('has-prep');
  }, { passive: true });

  const finishPress = (event) => {
    if (!press || (event.pointerId != null && event.pointerId !== press.pointerId)) return;
    const started = press;
    press = null;
    if (performance.now() - started.startedAt >= 450) {
      runBull(started, { x: event.clientX, y: event.clientY });
      if (started.target) {
        clickToSuppress = started.target;
        window.setTimeout(() => { clickToSuppress = null; }, 500);
      }
    } else if (cursor) {
      cursor.classList.remove('is-charging');
      cursor.classList.add('is-tap');
      window.setTimeout(() => cursor?.classList.remove('is-tap'), 360);
    }
  };
  window.addEventListener('pointerup', finishPress);
  window.addEventListener('pointercancel', () => {
    press = null;
    cursor?.classList.remove('is-charging');
  });
  document.addEventListener('click', (event) => {
    if (!clickToSuppress) return;
    if (event.target === clickToSuppress || clickToSuppress.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clickToSuppress = null;
    }
  }, true);

})();
