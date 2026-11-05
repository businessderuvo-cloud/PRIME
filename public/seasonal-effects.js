let cleanup = () => {};
let greeting;

export function showSeasonalTheme(theme) {
  cleanup();
  cleanup = () => {};
  const root = document.documentElement;
  if (!theme) {
    delete root.dataset.seasonalTheme;
    return;
  }
  root.dataset.seasonalTheme = theme;
  const decorations = [];
  const mount = (selector, markup) => {
    const parent = document.querySelector(selector);
    if (!parent) return;
    const element = document.createElement('div');
    element.className = 'seasonal-decoration';
    element.innerHTML = markup;
    parent.append(element);
    decorations.push(element);
    return element;
  };

  if (theme === 'valentine') {
    mount('.sidebar', '<span class="seasonal-hearts" aria-hidden="true">♡ <b>♥</b> ♡</span>');
    mount('.topbar', '<span class="seasonal-heart" aria-hidden="true">♥</span>');
  }

  if (theme === 'halloween') {
    mount('.sidebar', '<div class="seasonal-haunt"><span aria-hidden="true">🕸️</span><button type="button" aria-label="Esplora la zucca">🎃</button></div>')
      ?.querySelector('button').addEventListener('click', () => reveal('Dolcetto o scherzetto? 🍬 La zucca aveva una scorta segreta.'));
    mount('.topbar', '<div class="seasonal-bat"><button type="button" aria-label="Segui il pipistrello">🦇</button></div>')
      ?.querySelector('button').addEventListener('click', () => reveal('Buu! 👻 Hai trovato il fantasma di PRIME.'));
    mount('.main-footer', '<span class="seasonal-footer-ghost" aria-hidden="true">👻　🎃</span>');
  }

  if (theme === 'christmas') {
    for (const brand of document.querySelectorAll('.sidebar .brand, .compact-brand')) {
      const logo = brand.querySelector('.brand-image');
      if (!logo) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'seasonal-santa';
      button.setAttribute('aria-label', 'PRIME · Ascolta Babbo Natale');
      button.innerHTML = '<img class="seasonal-sleigh" src="/assets/seasonal-sleigh.svg" alt="">';
      logo.before(button);
      button.append(logo);
      button.onclick = () => {
        greeting ??= new Audio('/assets/seasonal-santa-original.mp3');
        greeting.currentTime = 0;
        greeting.play().catch(() => reveal('Oh! Oh! Oh!'));
      };
      decorations.push({ remove() { button.before(logo); button.remove(); } });
    }
    const bulbs = '<div class="seasonal-lights" aria-hidden="true">' + '<i></i>'.repeat(12) + '</div>';
    mount('.topbar', bulbs);
    mount('.main-footer', bulbs);
    const snow = mount('.workspace', '<div class="seasonal-snow" aria-hidden="true">' + '<i></i>'.repeat(20) + '</div>');
    snow?.querySelectorAll('i').forEach((flake, i) => {
      flake.style.setProperty('--snow-x', ((i * 37 + 7) % 100) + '%');
      flake.style.setProperty('--snow-delay', '-' + (i * 1.7) + 's');
      flake.style.setProperty('--snow-time', (12 + i % 8) + 's');
    });
  }

  cleanup = () => {
    decorations.forEach(element => element.remove());
    document.querySelector('.seasonal-reveal')?.remove();
    greeting?.pause();
  };
}

let revealTimer;
function reveal(message) {
  let status = document.querySelector('.seasonal-reveal');
  if (!status) {
    status = document.createElement('div');
    status.className = 'seasonal-reveal';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  status.textContent = message;
  clearTimeout(revealTimer);
  revealTimer = setTimeout(() => status.remove(), 4200);
}
