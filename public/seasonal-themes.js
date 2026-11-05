export const seasonalThemes = [
  { id: 'valentine', name: 'San Valentino', dates: '14 febbraio', month: 2, first: 14, last: 14, palette: 'Nero e viola' },
  { id: 'halloween', name: 'Halloween', dates: '31 ottobre', month: 10, first: 31, last: 31, palette: 'Nero e arancione' },
  { id: 'christmas', name: 'Natale', dates: '21–30 dicembre', month: 12, first: 21, last: 30, palette: 'Nero e rosso scuro' },
];

const romeDate = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome', month: 'numeric', day: 'numeric',
});

const seasonalPlan = edition => ['full', 'pro', 'vip', 'elite', 'secret'].includes(edition);

function calendarDay(date) {
  const parts = romeDate.formatToParts(date);
  const month = Number(parts.find(part => part.type === 'month').value);
  const day = Number(parts.find(part => part.type === 'day').value);
  return { month, day };
}

export function activeSeasonalTheme(edition, date = new Date()) {
  if (!seasonalPlan(edition)) return '';
  const { month, day } = calendarDay(date);
  return seasonalThemes.find(theme => theme.month === month && day >= theme.first && day <= theme.last)?.id || '';
}

export function activeNewYearFireworks(edition, date = new Date()) {
  if (!seasonalPlan(edition)) return false;
  const { month, day } = calendarDay(date);
  return (month === 12 && day === 31) || (month === 1 && day === 1);
}

export function demoSeasonalThemes(plan) {
  return ['pro', 'vip', 'elite', 'secret'].includes(plan) ? seasonalThemes : [];
}
