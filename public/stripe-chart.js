const COLORS = {
  income: '#27875f',
  pending: '#bf792b',
  cost: '#b8545b',
};

const SERIES = [
  { key: 'income', color: COLORS.income },
  { key: 'pending', color: COLORS.pending },
  { key: 'cost', color: COLORS.cost },
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
const english = () => document.documentElement.lang === 'en';
const text = (it, en) => english() ? en : it;
const seriesLabel = series => ({
  income: text('Entrate', 'Income'),
  pending: text('In attesa', 'Pending'),
  cost: text('Uscite', 'Expenses'),
}[series.key]);
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
      const label = seriesLabel(series);
      return `<rect class="stripe-${series.key}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="2" tabindex="0" aria-label="${esc(row.month)} · ${label}: ${esc(euro(value))}, ${percent(share)} ${text('del mese', 'of month')} "><title>${esc(row.month)} · ${label}: ${esc(euro(value))} · ${percent(share)} ${text('del mese', 'of month')}</title></rect>`;
    }).join('');
    return `${rects}<text class="stripe-month-label" x="${center}" y="${plot.bottom + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="${text('Grafico a barre mensile con importi e quote percentuali', 'Monthly bar chart with amounts and percentages')}"><g>${markup}</g><g>${bars}</g></svg>`;
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
    const path = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    const label = seriesLabel(series);
    const dots = points.map(point => `<circle class="stripe-${series.key} stripe-line-point" cx="${point.x.toFixed(2)}" cy="${point.y.toFixed(2)}" r="4" tabindex="0" aria-label="${esc(point.row.month)} · ${label}: ${esc(euro(point.value))}, ${percent(point.share)} ${text('del mese', 'of month')}"><title>${esc(point.row.month)} · ${label}: ${esc(euro(point.value))} · ${percent(point.share)} ${text('del mese', 'of month')}</title></circle>`).join('');
    return `<path class="stripe-line stripe-${series.key}" d="${path}"/>${dots}`;
  }).join('');
  const months = rows.map((row, index) => {
    const x = plot.left + groupWidth * (index + 0.5);
    return `<text class="stripe-month-label" x="${x}" y="${plot.bottom + 23}" text-anchor="middle">${esc(monthLabel(row.month))}</text>`;
  }).join('');
  return `<svg class="stripe-chart-svg" viewBox="0 0 720 280" preserveAspectRatio="none" role="img" aria-label="${text('Grafico a linee mensile con importi e quote percentuali', 'Monthly line chart with amounts and percentages')}"><g>${markup}</g><g>${seriesMarkup}${months}</g></svg>`;
}

function totals(rows) {
  const sums = SERIES.map(series => rows.reduce((total, row) => total + row[series.key], 0));
  return { sums, total: sums.reduce((sum, amount) => sum + amount, 0) };
}

function renderSummary(rows) {
  const { sums, total } = totals(rows);
  const items = SERIES.map((series, index) => `<div class="stripe-chart-summary-item stripe-summary-${series.key}"><span class="stripe-chart-summary-label"><i aria-hidden="true"></i>${seriesLabel(series)}</span><strong>${esc(euro(sums[index]))}</strong><small>${percent(total ? sums[index] / total * 100 : 0)} ${text('del totale mostrato', 'of displayed total')}</small></div>`).join('');
  return `<div class="stripe-chart-summary" aria-label="${text('Totali del periodo', 'Period totals')}">${items}</div>`;
}

function renderPie(rows) {
  const { sums, total } = totals(rows);
  if (!(total > 0)) return `<div class="stripe-pie-empty">${text('Nessun movimento nel periodo', 'No activity in this period')}</div>`;
  const items = SERIES.map((series, index) => `<div class="stripe-pie-row stripe-summary-${series.key}"><i aria-hidden="true"></i><span>${seriesLabel(series)}</span><strong>${esc(euro(sums[index]))}</strong><small>${percent(sums[index] / total * 100)}</small></div>`).join('');
  const label = SERIES.map((series, index) => `${seriesLabel(series)} ${esc(euro(sums[index]))}, ${percent(sums[index] / total * 100)}`).join('; ');
  const cx = 125, cy = 125, radius = 112;
  let angle = -Math.PI / 2;
  const slices = SERIES.map((series, index) => {
    const value = sums[index];
    if (!(value > 0)) return '';
    const sweep = value / total * Math.PI * 2;
    const end = angle + sweep;
    let shape;
    if (sweep >= Math.PI * 2 - 1e-8) {
      shape = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${series.color}"/>`;
    } else {
      const x1 = cx + radius * Math.cos(angle), y1 = cy + radius * Math.sin(angle);
      const x2 = cx + radius * Math.cos(end), y2 = cy + radius * Math.sin(end);
      shape = `<path d="M${cx} ${cy} L${x1.toFixed(2)} ${y1.toFixed(2)} A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z" fill="${series.color}" stroke="#15181a" stroke-width="2"><title>${seriesLabel(series)}: ${esc(euro(value))} · ${percent(value / total * 100)}</title></path>`;
    }
    angle = end;
    return shape;
  }).join('');
  return `<div class="stripe-pie-layout"><svg class="stripe-chart-svg stripe-pie-svg" viewBox="0 0 250 250" role="img" aria-label="${text('Ripartizione', 'Breakdown')}: ${label}">${slices}</svg><div class="stripe-pie-legend"><p class="stripe-pie-total"><span>${text('Totale periodo', 'Period total')}</span><strong>${esc(euro(total))}</strong></p>${items}<p>${text('Quote calcolate sul totale dei movimenti visualizzati.', 'Percentages are based on all displayed activity.')}</p></div></div>`;
}

export function renderStripeChartSvg(source, style = 'bars') {
  const rows = normalizeStripeSeries(source);
  if (style === 'pie') return renderPie(rows);
  if (!rows.length) return `<div class="stripe-chart-empty">${text('Nessun dato disponibile', 'No data available')}</div>`;
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
  controls.setAttribute('aria-label', text('Stile grafico', 'Chart style'));
  const summary = document.createElement('div');
  summary.className = 'stripe-chart-summary-wrap';
  summary.innerHTML = renderSummary(rows);
  for (const [style, label] of [['bars', text('Barre', 'Bars')], ['line', text('Linee', 'Lines')], ['pie', text('Torta', 'Pie')]]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-pressed', String(style === 'bars'));
    button.addEventListener('click', () => {
      controls.querySelectorAll('button').forEach(control => control.setAttribute('aria-pressed', String(control === button)));
      chart.dataset.style = style;
      chart.style.display = 'block';
      chart.style.gridTemplateColumns = 'none';
      chart.style.minWidth = '0';
      chart.innerHTML = renderStripeChartSvg(rows, style);
      summary.hidden = style === 'pie' || !rows.length;
    });
    controls.append(button);
  }
  chart.innerHTML = renderStripeChartSvg(rows, 'bars');
  chart.dataset.style = 'bars';
  chart.style.display = 'block';
  chart.style.removeProperty('grid-template-columns');
  chart.style.removeProperty('height');
  chart.style.removeProperty('min-height');
  chart.style.removeProperty('overflow');
  summary.hidden = !rows.length;
  panel.insertBefore(controls, chart);
  chart.after(summary);
}
