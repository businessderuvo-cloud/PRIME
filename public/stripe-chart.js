const SERIES = [
  { key: 'income', label: 'Entrate', color: '#9be7b0' },
  { key: 'cost', label: 'Uscite', color: '#ef6461' },
  { key: 'payout', label: 'Accrediti', color: '#85add4' },
];

const finiteAmount = value => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
};

export function normalizeStripeSeries(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(-12).map((row, index) => ({
    month: String(row?.month ?? String(index + 1).padStart(2, '0')),
    income: finiteAmount(row?.income),
    cost: finiteAmount(row?.cost ?? (finiteAmount(row?.fees) + finiteAmount(row?.refunds))),
    payout: finiteAmount(row?.payout ?? row?.payouts),
  }));
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const niceMaximum = value => {
  if (!(value > 0)) return 1;
  const scale = 10 ** Math.floor(Math.log10(value));
  const fraction = value / scale;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * scale;
};

const euro = value => new Intl.NumberFormat('it-IT', {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(value / 100);

function axes(rows, width = 720, height = 280) {
  const plot = { left: 76, right: width - 14, top: 16, bottom: height - 44 };
  const maxValue = Math.max(0, ...rows.flatMap(row => SERIES.map(series => row[series.key])));
  const maximum = niceMaximum(maxValue);
  const plotHeight = plot.bottom - plot.top;
  let markup = '';
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = maximum * tick / 4;
    const y = plot.bottom - plotHeight * tick / 4;
    markup += `<line class="stripe-gridline" x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}"/><text class="stripe-axis-label" x="${plot.left - 8}" y="${y + 4}" text-anchor="end">${esc(euro(value))}</text>`;
  }
  return { plot, maximum, markup };
}

const monthLabel = month => {
  const match = month.match(/(?:^|[-/])(\d{2})$/);
  return match ? match[1] : month.slice(0, 5);
};

function renderBars(rows) {
  const { plot, maximum, markup } = axes(rows);
  const groupWidth = (plot.right - plot.left) / Math.max(rows.length, 1);
  const barWidth = Math.min(15, groupWidth * 0.19);
  const gap = Math.min(3, groupWidth * 0.04);
  const baseline = plot.bottom;
  const bars = rows.map((row, index) => {
    const center = plot.left + groupWidth * (index + 0.5);
    const groupStart = center - (barWidth * 3 + gap * 2) / 2;
    const rects = SERIES.map((series, seriesIndex) => {
      const value = row[series.key];
      const barHeight = (value / maximum) * (plot.bottom - plot.top);
      const x = groupStart + seriesIndex * (barWidth + gap);
      const y = baseline - barHeight;
      return `<rect class="stripe-${series.key}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2"><title>${esc(row.month)} · ${series.label}: ${esc(euro(value))}</title></rect>`;
    }).join('');
    return `${rects}<text class="stripe-month-label" x="${center}" y="${baseline + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="Grafico a barre mensile: entrate, uscite e accrediti"><g>${markup}</g><g>${bars}</g></svg>`;
}

function renderLines(rows) {
  const { plot, maximum, markup } = axes(rows);
  const groupWidth = (plot.right - plot.left) / Math.max(rows.length, 1);
  const seriesMarkup = SERIES.map(series => {
    const points = rows.map((row, index) => {
      const x = plot.left + groupWidth * (index + 0.5);
      const y = plot.bottom - (row[series.key] / maximum) * (plot.bottom - plot.top);
      return { x, y, row, value: row[series.key] };
    });
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const dots = points.map(point => `<circle class="stripe-${series.key}" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="3.2"><title>${esc(point.row.month)} · ${series.label}: ${esc(euro(point.value))}</title></circle>`).join('');
    return `<path class="stripe-line stripe-${series.key}" d="${path}"/>${dots}`;
  }).join('');
  const months = rows.map((row, index) => {
    const x = plot.left + groupWidth * (index + 0.5);
    return `<text class="stripe-month-label" x="${x}" y="${plot.bottom + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="Grafico a linee mensile: entrate, uscite e accrediti"><g>${markup}</g><g>${seriesMarkup}${months}</g></svg>`;
}

function renderPie(rows) {
  const sums = SERIES.map(series => rows.reduce((total, row) => total + row[series.key], 0));
  const total = sums.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) {
    return '<svg class="stripe-chart-svg stripe-pie-svg" viewBox="0 0 320 280" role="img" aria-label="Nessun movimento nel periodo"><text class="stripe-empty-label" x="160" y="144" text-anchor="middle">Nessun movimento nel periodo</text></svg>';
  }
  const cx = 160, cy = 138, radius = 106;
  let angle = -Math.PI / 2;
  const wedges = SERIES.map((series, index) => {
    const value = sums[index];
    if (!(value > 0)) return '';
    const sweep = value / total * Math.PI * 2;
    const end = angle + sweep;
    let path;
    if (sweep >= Math.PI * 2 - 1e-8) {
      path = `<circle class="stripe-${series.key}" cx="${cx}" cy="${cy}" r="${radius}"/>`;
    } else {
      const x1 = cx + radius * Math.cos(angle), y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
      path = `<path class="stripe-${series.key}" d="M ${cx} ${cy} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z"/>`;
    }
    angle = end;
    return `<g>${path}<title>${series.label}: ${esc(euro(value))} (${(value / total * 100).toFixed(1)}%)</title></g>`;
  }).join('');
  return `<svg class="stripe-chart-svg stripe-pie-svg" viewBox="0 0 320 280" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafico a torta: entrate ${esc(euro(sums[0]))}, uscite ${esc(euro(sums[1]))}, accrediti ${esc(euro(sums[2]))}">${wedges}</svg>`;
}

export function renderStripeChartSvg(source, style = 'bars') {
  const rows = normalizeStripeSeries(source);
  if (style === 'pie') return renderPie(rows);
  if (!rows.length) return '<svg class="stripe-chart-svg" viewBox="0 0 720 280" role="img" aria-label="Nessun dato disponibile"><text class="stripe-empty-label" x="360" y="140" text-anchor="middle">Nessun dato disponibile</text></svg>';
  return style === 'line' ? renderLines(rows) : renderBars(rows);
}

export function wireStripeChart(panel, source) {
  if (!panel) return;
  const chart = panel.querySelector('.stripe-chart');
  if (!chart) return;
  const controls = document.createElement('div');
  controls.className = 'stripe-chart-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Stile grafico');
  for (const [style, label] of [['bars', 'Barre'], ['line', 'Linee'], ['pie', 'Torta']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(style === 'bars'));
    button.addEventListener('click', () => {
      controls.querySelectorAll('button').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      chart.dataset.style = style;
      chart.innerHTML = renderStripeChartSvg(source, style);
    });
    controls.append(button);
  }
  chart.innerHTML = renderStripeChartSvg(source, 'bars');
  chart.dataset.style = 'bars';
  panel.insertBefore(controls, chart);
}
