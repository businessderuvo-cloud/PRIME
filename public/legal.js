(() => {
  const button = document.querySelector('#theme');
  const icons = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    moon: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>'
  };
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    button.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">' + icons[theme === 'light' ? 'moon' : 'sun'] + '</svg>';
    button.setAttribute('aria-label', 'Attiva tema ' + (theme === 'light' ? 'scuro' : 'chiaro'));
    try { localStorage.setItem('prime-landing-theme', theme); } catch {}
  }
  let saved = 'dark';
  try { saved = localStorage.getItem('prime-landing-theme') || 'dark'; } catch {}
  setTheme(saved === 'light' ? 'light' : 'dark');
  button.addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
})();
