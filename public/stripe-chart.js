const COLORS = {
  income: '#27875f',
  pending: '#bf792b',
  cost: '#b8545b',
};

const SERIES = [
  { key: 'income', label: 'Entrate', color: COLORS.income },
  { key: 'pending', label: 'In attesa', color: COLORS.pending },
  { key: 'cost', label: 'Uscite', color: COLORS.cost },
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
    pending: finiteAmount(row?.pending),
    cost: finiteAmount(row?.cost ?? (finiteAmount(row?.fees) + finiteAmount(row?.refunds))),
  }));
}

const esc = value => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const locale = () => document.documentElement.lang === 'en' ? 'en-GB' : 'it-IT';
const euro = value => new Intl.NumberFormat(locale(), {
  style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
}).format(value / 100);
const percent = value => `${value.toFixed(1).replace('.', locale() === 'it-IT' ? ',' : '.')}%`;
const monthLabel = month => {
  const match = month.match(/(?:^|[-/])(\d{2})$/);
  return match ? match[1] : month.slice(0, 5);
};
const monthTotal = row => SERIES.reduce((total, series) => total + row[series.key], 0);

const niceMaximum = value => {
  if (!(value > 0)) return 1;
  const scale = 10 ** Math.floor(Math.log10(value));
  const fraction = value / scale;
  return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * scale;
};

function axes(rows, width = 720, height = 280) {
  const plot = { left: 76, right: width - 14, top: 18, bottom: height - 44 };
  const maxValue = Math.max(0, ...rows.flatMap(row => SERIES.map(series => row[series.key])));
  const maximum = niceMaximum(maxValue);
  const plotHeight = plot.bottom - plot.top;
  let markup = '';
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = maximum * tick / 4;
    const y = plot.bottom - plotHeight * tick / 4;
    markup += `<line class="stripe-gridline" x1="${plot.left}" y1="${y}" x2="${plot.right}" y2="${y}"/><text class="stripe-axis-label" x="${plot.left - 9}" y="${y + 4}" text-anchor="end">${esc(euro(value))}</text>`;
  }
  return { plot, maximum, markup };
}

function renderBars(rows) {
  const { plot, maximum, markup } = axes(rows);
  const groupWidth = (plot.right - plot.left) / rows.length;
  const barWidth = Math.min(15, groupWidth * 0.19);
  const gap = Math.min(3, groupWidth * 0.04);
  const bars = rows.map((row, index) => {
    const center = plot.left + groupWidth * (index + 0.5);
    const groupStart = center - (barWidth * 3 + gap * 2) / 2;
    const total = monthTotal(row);
    const rects = SERIES.map((series, seriesIndex) => {
      const value = row[series.key];
      const barHeight = value > 0 ? Math.max(1.5, (value / maximum) * (plot.bottom - plot.top)) : 0;
      const x = groupStart + seriesIndex * (barWidth + gap);
      const y = plot.bottom - barHeight;
      const share = total ? value / total * 100 : 0;
      return `<rect class="stripe-${series.key}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2" tabindex="0" aria-label="${esc(row.month)} · ${series.label}: ${esc(euro(value))}, ${percent(share)} del mese"><title>${esc(row.month)} · ${series.label}: ${esc(euro(value))} · ${percent(share)} del mese</title></rect>`;
    }).join('');
    return `${rects}<text class="stripe-month-label" x="${center}" y="${plot.bottom + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="Grafico a barre mensile con importi e quote percentuali"><g>${markup}</g><g>${bars}</g></svg>`;
}

function renderLines(rows) {
  const { plot, maximum, markup } = axes(rows);
  const groupWidth = (plot.right - plot.left) / rows.length;
  const seriesMarkup = SERIES.map(series => {
    const points = rows.map((row, index) => ({
      x: plot.left + groupWidth * (index + 0.5),
      y: plot.bottom - (row[series.key] / maximum) * (plot.bottom - plot.top),
      row,
      value: row[series.key],
      share: monthTotal(row) ? row[series.key] / monthTotal(row) * 100 : 0,
    }));
    const path = points.map((point, index) => {
      if (!index) return `M${point.x.toFixed(2)},${point.y.toFixed(2)}`;
      const previous = points[index - 1];
      const beforePrevious = points[Math.max(0, index - 2)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const c1x = previous.x + (point.x - beforePrevious.x) / 6;
      const c1y = previous.y + (point.y - beforePrevious.y) / 6;
      const c2x = point.x - (next.x - previous.x) / 6;
      const c2y = point.y - (next.y - previous.y) / 6;
      return `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${point.x.toFixed(2)},${point.y.toFixed(2)}`;
    }).join(' ');
    const hitAreas = points.map(point => `<circle class="stripe-line-hit" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="8" fill="transparent" stroke="transparent" tabindex="0" aria-label="${esc(point.row.month)} · ${series.label}: ${esc(euro(point.value))}, ${percent(point.share)} del mese"><title>${esc(point.row.month)} · ${series.label}: ${esc(euro(point.value))} · ${percent(point.share)} del mese</title></circle>`).join('');
    return `<path class="stripe-line stripe-${series.key}" d="${path}"/>${hitAreas}`;
  }).join('');
  const months = rows.map((row, index) => {
    const x = plot.left + groupWidth * (index + 0.5);
    return `<text class="stripe-month-label" x="${x}" y="${plot.bottom + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="Grafico a linee mensile con importi e quote percentuali"><g>${markup}</g><g>${seriesMarkup}${months}</g></svg>`;
}

function totals(rows) {
  const sums = SERIES.map(series => rows.reduce((total, row) => total + row[series.key], 0));
  return { sums, total: sums.reduce((sum, amount) => sum + amount, 0) };
}

function renderSummary(rows) {
  const { sums, total } = totals(rows);
  const items = SERIES.map((series, index) => `<div class="stripe-chart-summary-item stripe-summary-${series.key}"><span class="stripe-chart-summary-label"><i aria-hidden="true"></i>${series.label}</span><strong>${esc(euro(sums[index]))}</strong><small>${percent(total ? sums[index] / total * 100 : 0)} del totale mostrato</small></div>`).join('');
  return `<div class="stripe-chart-summary" aria-label="Totali del periodo">${items}</div>`;
}

function renderPie(rows) {
  const { sums, total } = totals(rows);
  if (!(total > 0)) return '<div class="stripe-pie-empty">Nessun movimento nel periodo</div>';
  const items = SERIES.map((series, index) => `<div class="stripe-pie-row stripe-summary-${series.key}"><i aria-hidden="true"></i><span>${series.label}</span><strong>${esc(euro(sums[index]))}</strong><small>${percent(sums[index] / total * 100)}</small></div>`).join('');
  let edge = 0;
  const stops = SERIES.map((series, index) => {
    const next = edge + (sums[index] / total * 100);
    const stop = `${series.color} ${edge.toFixed(2)}% ${next.toFixed(2)}%`;
    edge = next;
    return stop;
  }).join(',');
  const label = SERIES.map((series, index) => `${series.label} ${esc(euro(sums[index]))}, ${percent(sums[index] / total * 100)}`).join('; ');
  return `<div class="stripe-pie-layout"><div class="stripe-pie-wheel" role="img" aria-label="Ripartizione: ${label}" style="background:conic-gradient(${stops})"></div><div class="stripe-pie-legend"><p class="stripe-pie-total"><span>Totale periodo</span><strong>${esc(euro(total))}</strong></p>${items}<p>Quote calcolate sul totale dei movimenti visualizzati.</p></div></div>`;
}

export function renderStripeChartSvg(source, style = 'bars') {
  const rows = normalizeStripeSeries(source);
  if (style === 'pie') return renderPie(rows);
  if (!rows.length) return '<div class="stripe-chart-empty">Nessun dato disponibile</div>';
  return style === 'line' ? renderLines(rows) : renderBars(rows);
}

export function wireStripeChart(panel, source) {
  if (!panel) return;
  const chart = panel.querySelector('.stripe-chart');
  if (!chart) return;
  const rows = normalizeStripeSeries(source);
  const controls = document.createElement('div');
  controls.className = 'stripe-chart-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', 'Stile grafico');
  const summary = document.createElement('div');
  summary.className = 'stripe-chart-summary-wrap';
  summary.innerHTML = renderSummary(rows);
  for (const [style, label] of [['bars', 'Barre'], ['line', 'Linee'], ['pie', 'Torta']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(style === 'bars'));
    button.addEventListener('click', () => {
      controls.querySelectorAll('button').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      chart.dataset.style = style;
      chart.innerHTML = renderStripeChartSvg(rows, style);
      summary.hidden = style === 'pie' || !rows.length;
    });
    controls.append(button);
  }
  chart.innerHTML = renderStripeChartSvg(rows, 'bars');
  chart.dataset.style = 'bars';
  summary.hidden = !rows.length;
  panel.insertBefore(controls, chart);
  chart.after(summary);
}
