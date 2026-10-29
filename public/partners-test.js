(() => {
  const themeButton = document.querySelector('#theme');
  const themeIcon = {
    sun: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0"/></svg>',
    moon: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10"/></svg>',
  };
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    if (!themeButton) return;
    themeButton.innerHTML = themeIcon[theme === 'light' ? 'moon' : 'sun'];
    themeButton.setAttribute('aria-label', `Attiva tema ${theme === 'light' ? 'scuro' : 'chiaro'}`);
    try { localStorage.setItem('prime-landing-theme', theme); } catch {}
  };
  let savedTheme = 'dark';
  try { savedTheme = localStorage.getItem('prime-landing-theme') || 'dark'; } catch {}
  applyTheme(savedTheme === 'light' ? 'light' : 'dark');
  themeButton?.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
  });

  const stages = [...document.querySelectorAll('[data-orbit]')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const orbitData = stages.map((stage) => {
    const nodes = [...stage.querySelectorAll('.orbit-node')].map((node, index, all) => ({
      node,
      base: index * Math.PI * 2 / all.length,
      zBucket: null,
      front: false,
    }));
    const byNode = new Map(nodes.map((item) => [item.node, item]));
    let pointerFront = null;
    let focusFront = null;
    const updateFront = () => {
      for (const item of nodes) {
        item.front = item === pointerFront || item === focusFront;
        item.node.classList.toggle('is-front', item.front);
        item.node.style.zIndex = item.front ? '1000' : '';
        if (!item.front) item.zBucket = null;
      }
    };
    stage.addEventListener('pointerover', (event) => {
      const node = event.target.closest?.('.orbit-node');
      if (!node || !byNode.has(node)) return;
      pointerFront = byNode.get(node);
      updateFront();
    });
    stage.addEventListener('pointerleave', () => {
      pointerFront = null;
      updateFront();
    });
    stage.addEventListener('focusin', (event) => {
      const node = event.target.closest?.('.orbit-node');
      focusFront = node ? byNode.get(node) || null : null;
      updateFront();
    });
    stage.addEventListener('focusout', (event) => {
      const node = event.relatedTarget?.closest?.('.orbit-node');
      focusFront = node ? byNode.get(node) || null : null;
      updateFront();
    });
    return {
      stage,
      nodes,
      duration: Math.max(10, Number(stage.dataset.speed) || 28),
      pending: stage.classList.contains('carousel-stage--pending'),
    };
  });

  const draw = (now) => {
    for (const orbit of orbitData) {
      const { stage, nodes, duration, pending } = orbit;
      if (reduceMotion.matches) {
        stage.classList.add('is-static');
        continue;
      }
      stage.classList.remove('is-static');
      if (document.hidden) continue;

      const width = stage.clientWidth;
      const nodeHalf = Math.min(width * 0.075, pending ? 86 : 74);
      const edgeSafeRadius = Math.max(0, width / 2 - nodeHalf - 26);
      const radius = Math.min(width * (pending ? 0.42 : 0.30), pending ? 460 : 260, edgeSafeRadius);
      const rise = radius * (pending ? 0.60 : 0.42);
      const depth = Math.sqrt(Math.max(0, radius * radius - rise * rise));
      const turn = now / 1000 / duration * Math.PI * 2;

      for (const item of nodes) {
        const { node, base, front } = item;
        const angle = base + turn;
        const cos = Math.cos(angle);
        const z = cos * depth;
        const depthPosition = depth ? z / depth : 0;
        node.style.setProperty('--x', `${Math.sin(angle) * radius}px`);
        node.style.setProperty('--y', `${-cos * rise}px`);
        node.style.setProperty('--z', `${z}px`);
        node.style.setProperty('--scale', `${0.82 + 0.18 * ((depthPosition + 1) / 2)}`);
        node.style.setProperty('--opacity', `${0.64 + 0.36 * ((depthPosition + 1) / 2)}`);
        if (!front) {
          const zBucket = Math.round(depthPosition * 12);
          if (zBucket !== item.zBucket) {
            item.zBucket = zBucket;
            node.style.zIndex = String(zBucket + 12);
          }
        }
      }
    }
    requestAnimationFrame(draw);
  };

  requestAnimationFrame(draw);
})();
