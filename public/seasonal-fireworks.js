let mountedWorkspace;
let dispose = () => {};

export function syncNewYearFireworks(enabled) {
  const workspace = enabled ? document.querySelector('.workspace') : null;
  if (workspace === mountedWorkspace) return;
  dispose();
  mountedWorkspace = workspace;
  dispose = workspace ? mountFireworks(workspace) : () => {};
}

function mountFireworks(workspace) {
  const topbar = workspace.querySelector('.topbar');
  if (!topbar) return () => {};
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  canvas.className = 'seasonal-fireworks-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  workspace.append(canvas);

  const controls = document.createElement('div');
  controls.className = 'seasonal-fireworks-controls';
  controls.innerHTML = '<span>Buon anno!</span><button type="button">Tocca per lanciare un fuoco</button>';
  topbar.after(controls);
  const button = controls.querySelector('button');

  const events = new AbortController();
  const options = { signal: events.signal };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const colors = [23, 47, 145, 200, 275, 330];
  const sparks = [];
  let frame = 0, lastTime = 0;
  let sound, noise;

  function resize() {
    const scale = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * scale);
    canvas.height = Math.round(innerHeight * scale);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize, options);

  function playBurstSound() {
    if (!window.AudioContext) return;
    sound ??= new AudioContext();
    if (sound.state === 'running') pop();
    else sound.resume().then(pop).catch(() => {});
  }

  function pop() {
    if (sound?.state !== 'running') return;
    if (!noise) {
      noise = sound.createBuffer(1, Math.ceil(sound.sampleRate * 0.32), sound.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const time = sound.currentTime;
    const crack = sound.createBufferSource();
    crack.buffer = noise;
    const filter = sound.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3800, time);
    filter.frequency.exponentialRampToValueAtTime(300, time + 0.24);
    const crackVolume = sound.createGain();
    crackVolume.gain.setValueAtTime(0.18, time);
    crackVolume.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    crack.connect(filter).connect(crackVolume).connect(sound.destination);
    crack.start(time);

    const boom = sound.createOscillator();
    const boomVolume = sound.createGain();
    boom.frequency.setValueAtTime(90, time);
    boom.frequency.exponentialRampToValueAtTime(41, time + 0.22);
    boomVolume.gain.setValueAtTime(0.1, time);
    boomVolume.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    boom.connect(boomVolume).connect(sound.destination);
    boom.start(time);
    boom.stop(time + 0.3);
  }

  function draw(now) {
    const step = lastTime ? Math.min((now - lastTime) / 16.67, 3) : 1;
    lastTime = now;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = sparks.length - 1; i >= 0; i--) {
      const spark = sparks[i];
      spark.age += step;
      if (spark.age >= spark.life) {
        sparks.splice(i, 1);
        continue;
      }
      const previousX = spark.x, previousY = spark.y;
      spark.x += spark.vx * step;
      spark.y += spark.vy * step;
      spark.vx *= 0.98 ** step;
      spark.vy = spark.vy * 0.98 ** step + (spark.still ? 0 : 0.055 * step);
      ctx.globalAlpha = 1 - spark.age / spark.life;
      ctx.strokeStyle = ctx.fillStyle = 'hsl(' + spark.hue + ' 92% ' + spark.lightness + '%)';
      ctx.beginPath();
      if (spark.still) {
        ctx.arc(spark.x, spark.y, 2, 0, 2 * Math.PI);
        ctx.fill();
      } else {
        ctx.lineWidth = spark.size;
        ctx.lineCap = 'round';
        ctx.moveTo(previousX - spark.vx, previousY - spark.vy);
        ctx.lineTo(spark.x, spark.y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    frame = sparks.length ? requestAnimationFrame(draw) : 0;
    if (!frame) lastTime = 0;
  }

  function burst(point) {
    const still = reducedMotion.matches;
    const x = point?.x ?? innerWidth * (0.3 + Math.random() * 0.4);
    const y = point?.y ?? innerHeight * (0.24 + Math.random() * 0.38);
    const hue = colors[Math.floor(Math.random() * colors.length)];
    const lightTheme = document.documentElement.dataset.theme === 'light';
    const count = still ? 14 : 62;
    for (let i = 0; i < count; i++) {
      const angle = i / count * 2 * Math.PI + Math.random() * 0.09;
      const speed = 1.5 + Math.random() * 4;
      sparks.push({
        x: x + (still ? Math.cos(angle) * 14 : 0),
        y: y + (still ? Math.sin(angle) * 14 : 0),
        vx: still ? 0 : Math.cos(angle) * speed,
        vy: still ? 0 : Math.sin(angle) * speed,
        age: 0, life: 27 + Math.random() * 39,
        hue: hue + (i % 5 === 0 ? 45 : 0),
        lightness: lightTheme ? 40 + Math.random() * 13 : 57 + Math.random() * 22,
        size: 1.1 + Math.random() * 1.7, still,
      });
    }
    if (sparks.length > 260) sparks.splice(0, sparks.length - 260);
    if (!frame) frame = requestAnimationFrame(draw);
  }

  const interactive = 'button, a, input, textarea, select, label, summary, dialog, [contenteditable], [role="button"], [draggable="true"], .leaflet-container';
  workspace.addEventListener('click', event => {
    if (event.button !== 0 || !(event.target instanceof Element)) return;
    const onButton = button.contains(event.target);
    if (!onButton && (event.target.closest(interactive) || window.getSelection()?.toString())) return;
    playBurstSound();
    burst(onButton ? null : { x: event.clientX, y: event.clientY });
  }, options);

  return () => {
    events.abort();
    cancelAnimationFrame(frame);
    sound?.close().catch(() => {});
    canvas.remove();
    controls.remove();
  };
}
