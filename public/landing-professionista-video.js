(() => {
  const clips = [...document.querySelectorAll('.hero-photo, .features-photo')]
    .map(frame => ({ frame, video: frame.querySelector('video'), rewindVideo: frame.querySelector('.features-photo-rewind-video') }))
    .filter(clip => clip.video);
  let scrollPlaybackActive = false;
  let scrollPlaybackFrame = 0;
  const updateScrollPlayback = () => {
    scrollPlaybackFrame = 0;
    if (!scrollPlaybackActive || document.hidden) return;
    const viewportTop = window.visualViewport?.offsetTop || 0;
    const viewportLeft = window.visualViewport?.offsetLeft || 0;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportBottom = viewportTop + viewportHeight;
    const viewportRight = viewportLeft + viewportWidth;
    const viewportCenter = viewportTop + viewportHeight / 2;
    const candidates = clips.map(clip => {
      const rect = clip.frame.getBoundingClientRect();
      const visibleHeight = Math.max(0, Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop));
      const visibleWidth = Math.max(0, Math.min(rect.right, viewportRight) - Math.max(rect.left, viewportLeft));
      const area = Math.max(1, rect.width * rect.height);
      return { clip, visibleRatio: visibleHeight * visibleWidth / area, distance: Math.abs((rect.top + rect.bottom) / 2 - viewportCenter) };
    }).filter(item => item.visibleRatio >= 0.35 && item.distance <= viewportHeight * 0.4);
    candidates.sort((a, b) => a.distance - b.distance || b.visibleRatio - a.visibleRatio);
    const focused = candidates[0]?.clip;
    clips.forEach(clip => {
      if (clip === focused) {
        if (clip.video.paused && !clip.starting) clip.play(true);
      } else if (!clip.video.paused || clip.starting) clip.pause();
    });
  };
  const scheduleScrollPlayback = () => {
    scrollPlaybackActive = true;
    if (!scrollPlaybackFrame) scrollPlaybackFrame = requestAnimationFrame(updateScrollPlayback);
  };
  window.addEventListener('scroll', scheduleScrollPlayback, { passive: true });
  window.addEventListener('resize', scheduleScrollPlayback, { passive: true });
  window.addEventListener('focus', scheduleScrollPlayback);
  document.addEventListener('visibilitychange', scheduleScrollPlayback);
  window.visualViewport?.addEventListener('resize', scheduleScrollPlayback, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleScrollPlayback, { passive: true });
  scheduleScrollPlayback();
  for (const clip of clips) {
    clip.frame.style.webkitTapHighlightColor = 'transparent';
    clip.video.style.webkitTapHighlightColor = 'transparent';
    const isTop = clip.frame.classList.contains('hero-photo');
    const audioButton = isTop ? null : document.createElement('button');
    if (audioButton) {
      audioButton.type = 'button';
      audioButton.className = 'portrait-audio-toggle portrait-audio-toggle--features';
      audioButton.innerHTML = '<svg class="audio-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 4V5L7 9H3Zm13.5 3a4.5 4.5 0 0 0-2.5-4.03v8.05A4.5 4.5 0 0 0 16.5 12Zm-2.5-9.2v2.06a8 8 0 0 1 0 14.28v2.06a10 10 0 0 0 0-18.4Z"/></svg>';
      audioButton.setAttribute('aria-label', 'Attiva audio del video');
      clip.frame.append(audioButton);
    }
    clip.audioAllowed = false;
    clip.playbackId = 0;
    clip.starting = false;
    clip.finished = false;
    clip.rewinding = false;
    clip.rewound = false;
    clip.syncAudio = () => {
      if (isTop) {
        clip.video.muted = true;
        return;
      }
      clip.video.muted = clip.rewinding || !clip.audioAllowed;
      audioButton.classList.toggle('is-muted', !clip.audioAllowed || clip.video.muted);
      audioButton.title = clip.audioAllowed ? (clip.video.muted ? 'Audio temporaneamente in pausa' : 'Disattiva audio') : 'Attiva audio';
      audioButton.setAttribute('aria-label', clip.audioAllowed ? (clip.video.muted ? 'Audio in pausa durante la scena' : 'Disattiva audio del video') : 'Attiva audio del video');
    };
    clip.syncAudio();
    clip.play = async (force = false) => {
      if (!isTop && (clip.finished && !force || clip.rewinding || clip.rewound && !force)) return;
      if (clip.starting || !clip.video.paused) return;
      if (!isTop) clip.rewound = false;
      clip.starting = true;
      clip.playbackId++;
      const id = clip.playbackId;
      if (clip.video.ended || (clip.video.duration && clip.video.currentTime >= clip.video.duration)) clip.video.currentTime = 0;
      clip.syncAudio();
      const reveal = () => {
        if (id !== clip.playbackId || clip.video.paused) return;
        clip.syncAudio();
        clip.frame.classList.add('is-playing');
      };
      clip.video.addEventListener('playing', reveal, { once: true });
      try {
        await clip.video.play();
        if (id !== clip.playbackId) return;
        clip.starting = false;
        if (clip.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) requestAnimationFrame(reveal);
      } catch {
        if (id === clip.playbackId) clip.starting = false;
        clip.video.removeEventListener('playing', reveal);
      }
    };
    clip.pause = () => {
      if (!isTop && (clip.finished || clip.rewinding)) return;
      if (clip.video.paused && !clip.starting) return;
      clip.playbackId++;
      clip.starting = false;
      clip.video.pause();
      clip.syncAudio();
    };
    clip.stop = () => {
      if (!isTop && (clip.finished || clip.rewinding)) return;
      clip.playbackId++;
      clip.starting = false;
      clip.video.pause();
      clip.video.currentTime = 0;
      clip.syncAudio();
      clip.frame.classList.remove('is-playing');
    };
    if (!isTop) {
      clip.video.addEventListener('ended', () => {
        clip.finished = true;
        clip.video.pause();
        clip.frame.classList.add('is-playing');
      });
      clip.rewindVideo.addEventListener('ended', () => {
        clip.rewindVideo.pause();
        clip.video.currentTime = 0;
        clip.rewinding = false;
        clip.finished = false;
        clip.rewound = true;
        clip.frame.classList.remove('is-rewinding', 'is-rewinding-pending', 'is-playing');
        clip.syncAudio();
      });
      clip.rewind = async () => {
        if (clip.rewinding) return;
        clip.playbackId++;
        clip.video.pause();
        clip.rewinding = true;
        clip.syncAudio();
        clip.frame.classList.add('is-rewinding-pending');
        clip.rewindVideo.pause();
        clip.rewindVideo.muted = true;
        clip.rewindVideo.currentTime = 0;
        try {
          await clip.rewindVideo.play();
          if (!clip.rewinding) return;
          clip.frame.classList.remove('is-rewinding-pending');
          clip.frame.classList.add('is-rewinding');
        } catch {
          clip.rewinding = false;
          clip.frame.classList.remove('is-rewinding-pending');
          clip.syncAudio();
        }
      };
      clip.frame.addEventListener('click', event => {
        if (event.target.closest('.portrait-audio-toggle')) return;
        if (clip.rewound) clip.play(true);
        else clip.rewind();
      });
    }
    audioButton?.addEventListener('click', event => {
      event.stopPropagation();
      clip.audioAllowed = !clip.audioAllowed;
      clip.syncAudio();
    });
    clip.video.addEventListener('timeupdate', clip.syncAudio);
    if (isTop) {
      const hero = clip.frame.closest('.hero');
      let pointerInsideFrame = false;
      const trackPointer = event => {
        const bounds = clip.frame.getBoundingClientRect();
        const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
        if (inside === pointerInsideFrame) return;
        pointerInsideFrame = inside;
        clip.frame.classList.toggle('is-pointer-over-video', inside);
        hero.classList.toggle('is-pointer-over-video', inside);
      };
      window.addEventListener('pointermove', trackPointer, { passive: true });
      window.addEventListener('blur', () => {
        pointerInsideFrame = false;
        clip.frame.classList.remove('is-pointer-over-video');
        hero.classList.remove('is-pointer-over-video');
        clip.playbackId++;
        clip.starting = false;
        clip.video.pause();
        clip.frame.classList.remove('is-playing');
      });
    }
    if (isTop) {
      clip.frame.addEventListener('focusin', clip.play);
      clip.frame.addEventListener('focusout', clip.stop);
    }
  }
})();
