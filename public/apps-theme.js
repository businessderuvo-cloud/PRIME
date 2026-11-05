const themeButton = document.querySelector('#apps-theme');
const themeKey = 'prime-landing-theme';
const applyTheme = (theme) => {
  const light = theme === 'light';
  document.documentElement.dataset.theme = light ? 'light' : 'dark';
  themeButton.textContent = light ? '☾' : '☀';
  themeButton.setAttribute('aria-label', light ? 'Attiva tema scuro' : 'Attiva tema chiaro');
};
let theme = 'dark';
try { theme = localStorage.getItem(themeKey) || 'dark'; } catch {}
applyTheme(theme);
themeButton.hidden = false;
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try { localStorage.setItem(themeKey, next); } catch {}
});
