// The server selects the edition. Browser preferences never grant capabilities.
export const baseExcludedEntities = ['commissions', 'signature_requests'];
export const baseExcludedPages = [...baseExcludedEntities, 'connect', 'mail', 'assistant', 'roadmap', 'stripe'];
export function baseApiAllowed(pathname) {
  if (/^\/api\/billing\/(?:upgrade(?:\/quote|\/request)?|status)$/.test(pathname)) return true;
  if (/^\/api\/billing\/(?:checkout|payments|crypto-order\/[a-f0-9-]{36}(?:\/prepare)?)$/.test(pathname)) return true;
  const entity = /^\/api\/entities\/([^/]+)/.exec(pathname)?.[1];
  if (entity) return !baseExcludedEntities.includes(entity);
  return /^\/api\/(?:me|account|logout|preferences|agents|members|map|audit|search|dashboard|matching|backups|backup-device|territory|media|documents|kyb)(?:\/|$)/.test(pathname);
}
