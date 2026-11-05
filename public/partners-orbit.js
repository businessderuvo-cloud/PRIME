(() => {
  const stages = [...document.querySelectorAll('[data-orbit]')];
  if (!stages.length) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const orbits = stages.map((stage) => {
    const nodes = [...stage.querySelectorAll('.orbit-node')].map((node, index, all) => ({
      node,
      base: index * Math.PI * 2 / all.length,
      zBucket: -1,
      front: false,
    }));
    const nodeMap = new Map(nodes.map((item) => [item.node, item]));
    let pointerFront = null;
    let focusFront = null;

    const updateFront = () => {
      for (const item of nodes) {
        item.front = item === pointerFront || item === focusFront;
        item.node.classList.toggle('is-front', item.front);
        if (!item.front) item.zBucket = -1;
      }
    };

    stage.addEventListener('pointerover', (event) => {
      const node = event.target.closest?.('.orbit-node');
      pointerFront = node ? nodeMap.get(node) || null : null;
      updateFront();
    });
    stage.addEventListener('pointerout', (event) => {
      const node = event.target.closest?.('.orbit-node');
      const next = event.relatedTarget?.closest?.('.orbit-node');
      if (node && node !== next) {
        pointerFront = next ? nodeMap.get(next) || null : null;
        updateFront();
      }
    });
    stage.addEventListener('pointerleave', () => {
      pointerFront = null;
      updateFront();
    });
    stage.addEventListener('focusin', (event) => {
      const node = event.target.closest?.('.orbit-node');
      focusFront = node ? nodeMap.get(node) || null : null;
      updateFront();
    });
    stage.addEventListener('focusout', (event) => {
      const node = event.relatedTarget?.closest?.('.orbit-node');
      focusFront = node ? nodeMap.get(node) || null : null;
      updateFront();
    });

    return { stage, nodes, duration: Math.max(10, Number(stage.dataset.speed) || 22) };
  });

  let frame = 0;
  const draw = (now) => {
    frame = 0;
    if (reducedMotion.matches || document.hidden) return;

    for (const { stage, nodes, duration } of orbits) {
      const width = stage.clientWidth;
      const nodeHalf = nodes.reduce((largest, { node }) => Math.max(largest, node.offsetWidth * 0.65), 0);
      const edgeSafeRadius = Math.max(0, width / 2 - nodeHalf - 8);
      const radius = Math.min(width * 0.27, 360, edgeSafeRadius);
      const rise = radius * 0.82;
      const depth = Math.sqrt(Math.max(0, radius * radius - rise * rise));
      const turn = now / 1000 / duration * Math.PI * 2;

      for (const item of nodes) {
        const angle = item.base + turn;
        const cos = Math.cos(angle);
        const depthPosition = cos;
        const inward = item.front ? 0.6 : 1;
        const depthScale = 0.85 + 0.95 * Math.pow((depthPosition + 1) / 2, 4);
        item.node.style.setProperty('--x', `${Math.sin(angle) * radius * inward}px`);
        item.node.style.setProperty('--y', `${-cos * rise * inward}px`);
        item.node.style.setProperty('--z', `${cos * depth}px`);
        item.node.style.setProperty('--scale', String(depthScale));
        item.node.style.setProperty('--opacity', `${0.66 + 0.34 * ((depthPosition + 1) / 2)}`);

        if (!item.front) {
          const zBucket = Math.round((depthPosition + 1) * 12);
          if (zBucket !== item.zBucket) {
            item.zBucket = zBucket;
            item.node.style.zIndex = String(zBucket + 1);
          }
        }
      }
    }

    frame = requestAnimationFrame(draw);
  };

  const syncMotion = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const { stage, nodes } of orbits) {
      stage.classList.toggle('is-static', reducedMotion.matches);
      if (reducedMotion.matches) {
        for (const { node } of nodes) {
          node.style.removeProperty('--x');
          node.style.removeProperty('--y');
          node.style.removeProperty('--z');
          node.style.removeProperty('--scale');
          node.style.removeProperty('--opacity');
          node.style.removeProperty('z-index');
        }
      }
    }
    if (!reducedMotion.matches && !document.hidden) frame = requestAnimationFrame(draw);
  };

  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();
})();

;(()=>{const button=document.getElementById('theme'),icons={moon:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 13A9 9 0 1 1 11 3a7 7 0 0 0 10 10"/></svg>',sun:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0"/></svg>'};let saved='dark';try{saved=localStorage.getItem('prime-landing-theme')||'dark';}catch{}const set=theme=>{document.documentElement.dataset.theme=theme;button.innerHTML=icons[theme==='light'?'moon':'sun'];button.setAttribute('aria-label','Attiva tema '+(theme==='light'?'scuro':'chiaro'));try{localStorage.setItem('prime-landing-theme',theme);}catch{}};set(saved==='light'?'light':'dark');button.addEventListener('click',()=>set(document.documentElement.dataset.theme==='light'?'dark':'light'));})();