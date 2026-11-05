const italyDate = new Intl.DateTimeFormat('it-IT', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const holidays = {
  '01-01': { it: 'Buon anno!', en: 'Happy New Year!' },
  '02-14': { it: 'Buon San Valentino!', en: 'Happy Valentine’s Day!' },
  '10-31': { it: 'Buon Halloween!', en: 'Happy Halloween!' },
  '12-25': {
    it: 'Buon Natale! Prova il tema Natale e clicca sul logo PRIME… Non sono l’unica che ha gli auguri da farti.',
    en: 'Merry Christmas! Try the Christmas theme and click the PRIME logo… I’m not the only one who wants to wish you a Merry Christmas.',
  },
};

export function validVanessaNameDay(value) {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return false;
  const [month, day] = value.split('-').map(Number);
  const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day > 0 && day <= monthLengths[month - 1];
}

export function claimVanessaGreeting(db, { userId, channel, now, english = false }) {
  const parts = Object.fromEntries(italyDate.formatToParts(now).map(({ type, value }) => [type, value]));
  const monthDay = parts.month + '-' + parts.day;
  const holiday = holidays[monthDay]?.[english ? 'en' : 'it'];
  const nameDay = db.prepare('SELECT month_day FROM vanessa_name_days WHERE user_id = ?').get(userId)?.month_day;
  const nameGreeting = nameDay === monthDay ? (english ? 'Happy name day!' : 'Buon onomastico!') : '';
  const greeting = [holiday, nameGreeting].filter(Boolean).join(' ');
  if (!greeting) return '';

  // Keep one row per user and channel. SQLite resolves concurrent opens atomically.
  const localDate = parts.year + '-' + monthDay;
  const claim = db.prepare(`
    INSERT INTO vanessa_greeting_days(user_id, channel, local_date) VALUES (?, ?, ?)
    ON CONFLICT(user_id, channel) DO UPDATE SET local_date = excluded.local_date
    WHERE excluded.local_date > vanessa_greeting_days.local_date
  `).run(userId, channel, localDate);
  return claim.changes ? greeting : '';
}
