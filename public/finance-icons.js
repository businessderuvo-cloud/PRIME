const paths={
 income:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
 payments:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 10h18M7 15h4"/>',
 pending:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 fees:'<path d="m6 18 12-12"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
 transfers:'<path d="M3 7h17m-5-4 5 4-5 4M21 17H4m5-4-5 4 5 4"/>',
 adjustments:'<path d="M4 4v6h6M4 10a8 8 0 1 1 1 8"/>',
 cost:'<path d="M12 21V9m-5 5 5-5 5 5M4 9V4h16v5"/>',
 link:'<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/>',
 invoice:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
 balance:'<path d="M3 9h18L12 3 3 9Zm1 12h16M5 9v8m7-8v8m7-8v8M3 17h18"/>',
 report:'<path d="M4 3v17h17M8 16v-4m5 4V8m5 8V5"/>',
 connect:'<rect x="3" y="3" width="18" height="18" rx="5"/><path d="m8 13 3 3 5-7M8 7h3"/>'
};
const iconNamespace='finance-'+Math.random().toString(36).slice(2);
let iconSequence=0;
export function financeIcon(key,className='',relief=false){
 const reliefPaths={pending:'<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',transfers:'<path d="m3 8 9-5 9 5H3Zm1 13h16M6 11v6m6-6v6m6-6v6M4 18h16"/>',adjustments:'<path d="M4 4v6h6M4 10a8 8 0 1 1 1 8M12 8v5l3 2"/>'};
 const glyph=(relief&&reliefPaths[key])||paths[key]||paths.payments;
 if(!relief)return `<svg class="finance-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyph}</svg>`;
 const id=iconNamespace+'-'+(++iconSequence);
 return `<svg class="finance-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".28" stop-color="currentColor"/><stop offset=".7" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".65"/></linearGradient></defs><g class="finance-icon-relief" transform="translate(0 .65)">${glyph}</g><g class="finance-icon-ink" stroke="url(#${id})">${glyph}</g></svg>`;
}
