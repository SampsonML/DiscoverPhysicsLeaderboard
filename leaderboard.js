// DiscoverPhysics leaderboard renderer
// No build step, no framework. Fetches data/results.json, populates the
// leaderboard table and the per-world heatmap.

const COLUMNS = [
  { key: 'rank',        label: '#',           sortable: false, type: 'rank' },
  { key: 'model',       label: 'Model',       sortable: true,  type: 'model' },
  { key: 'pass_5',      label: 'Pass@5',      sortable: true,  type: 'passbar', desc: true },
  { key: 'pass_3',      label: 'Pass@3',      sortable: true,  type: 'pass',    desc: true },
  { key: 'pass_1',      label: 'Pass@1',      sortable: true,  type: 'pass',    desc: true },
  { key: 'explanation', label: 'Explanation', sortable: true,  type: 'score',   desc: true },
  { key: 'mse',         label: 'Norm. MSE',   sortable: true,  type: 'mse',     desc: false }
];

let state = {
  data: null,
  sortKey: 'pass_5',
  sortDir: 'desc'
};

async function load() {
  try {
    const res = await fetch('data/results.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    renderTable();
    renderHeatmap();
    renderFigures();
    renderMetadata();
  } catch (err) {
    document.querySelector('#results-table').innerHTML =
      `<div class="loading">Failed to load results: ${err.message}</div>`;
  }
}

function flatten(entry) {
  return {
    raw: entry,
    model: entry.model,
    pass_1: entry.pass_at_k['1'].mean,
    pass_3: entry.pass_at_k['3'].mean,
    pass_5: entry.pass_at_k['5'].mean,
    explanation: entry.explanation_score.mean,
    explanation_se: entry.explanation_score.se,
    mse: entry.normalized_mse.mean
  };
}

function compare(a, b, key, dir) {
  let av = a[key], bv = b[key];
  if (typeof av === 'string') {
    return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  }
  if (av == null) av = -Infinity;
  if (bv == null) bv = -Infinity;
  return dir === 'asc' ? av - bv : bv - av;
}

function renderTable() {
  const root = document.querySelector('#results-table');
  if (!state.data) return;

  let rows = state.data.results.map(flatten);
  rows.sort((a, b) => compare(a, b, state.sortKey, state.sortDir));
  const maxPass5 = Math.max(...rows.map(r => r.pass_5 || 0), 1);

  let html = '<table class="leaderboard"><thead><tr>';
  for (const col of COLUMNS) {
    const sortAttr = col.sortable ? 'data-sortable' : '';
    let cls = '';
    if (state.sortKey === col.key) cls = state.sortDir === 'desc' ? 'sorted-desc' : 'sorted-asc';
    html += `<th class="${cls}" ${sortAttr} data-key="${col.key}">${col.label}</th>`;
  }
  html += '</tr></thead><tbody>';

  rows.forEach((r, i) => {
    html += '<tr>';
    for (const col of COLUMNS) {
      html += '<td>' + cellHtml(col, r, i, maxPass5) + '</td>';
    }
    html += '</tr>';
  });

  html += '</tbody></table>';
  root.innerHTML = html;

  root.querySelectorAll('th[data-sortable]').forEach(th => {
    th.addEventListener('click', () => {
      const k = th.dataset.key;
      if (state.sortKey === k) {
        state.sortDir = state.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        state.sortKey = k;
        const col = COLUMNS.find(c => c.key === k);
        state.sortDir = col.desc ? 'desc' : 'asc';
      }
      renderTable();
    });
  });
}

function cellHtml(col, r, i, maxPass5) {
  switch (col.type) {
    case 'rank':
      return `<span class="rank ${i === 0 ? 'rank-1' : ''}">${i + 1}</span>`;
    case 'model':
      return `<span class="model-cell">${escapeHtml(r.model)}</span>`;
    case 'passbar': {
      const pct = r.pass_5 || 0;
      const fillW = (pct / maxPass5) * 100;
      const isTop = i === 0;
      return `<span class="pass-bar ${isTop ? 'is-top' : ''}">` +
             `<span class="bar"><span class="fill" style="width:${fillW}%"></span></span>` +
             `<span>${pct.toFixed(1)}</span></span>`;
    }
    case 'pass':
      return `<span class="num-cell">${r[col.key].toFixed(1)}</span>`;
    case 'score': {
      const se = r.explanation_se != null
        ? ` <span class="se">±${r.explanation_se.toFixed(2)}</span>` : '';
      return `<span class="num-cell">${r.explanation.toFixed(2)}${se}</span>`;
    }
    case 'mse':
      return `<span class="num-cell">${formatMSE(r.mse)}</span>`;
    default:
      return '';
  }
}

function formatMSE(v) {
  if (v == null) return '—';
  if (v === 0) return '0';
  if (v < 0.001) return v.toExponential(1);
  if (v < 1) return v.toFixed(3);
  if (v >= 1000) return v.toExponential(1);
  return v.toFixed(2);
}

function renderMetadata() {
  const meta = document.querySelector('#meta-stamp');
  if (meta && state.data?.metadata) {
    const m = state.data.metadata;
    meta.textContent = `${m.benchmark_version} · updated ${m.last_updated}`;
  }
}

function renderHeatmap() {
  const root = document.querySelector('#heatmap-table');
  if (!root || !state.data) return;

  const worlds = state.data.metadata.worlds;
  const rows = [...state.data.results].sort(
    (a, b) => b.pass_at_k['5'].mean - a.pass_at_k['5'].mean
  );

  let html = '<table class="heatmap"><thead><tr>';
  html += '<th class="hm-corner"></th>';
  for (const w of worlds) {
    html += `<th class="hm-world"><span>${escapeHtml(w)}</span></th>`;
  }
  html += '</tr></thead><tbody>';

  for (const r of rows) {
    html += `<tr><th class="hm-model">${escapeHtml(r.model)}</th>`;
    for (const w of worlds) {
      const cell = r.per_world?.[w];
      if (!cell) {
        html += '<td class="hm-cell hm-empty">—</td>';
        continue;
      }
      const score = cell.explanation_score.mean;
      const se = cell.explanation_score.se;
      const err = cell.geom_pos_err.mean;
      const seStr = se != null ? ` ± ${se.toFixed(2)}` : '';
      const tip = `${r.model} · ${w}\n` +
                  `n = ${cell.n}\n` +
                  `explanation ${score.toFixed(2)}${seStr}\n` +
                  `geom_pos_err ${formatMSE(err)}`;
      const cls = score >= 0.5 ? ' hm-dark' : '';
      html += `<td class="hm-cell${cls}" style="--score:${score.toFixed(3)}" `
            + `title="${escapeHtml(tip)}">${score.toFixed(2)}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  root.innerHTML = html;
}

// ---------------- Figures ----------------

const PLOT_FONT    = 'Inconsolata, Menlo, monospace';
// Phosphor / Lab CRT palette — must mirror the CSS root variables in style.css.
const COLOR_ACCENT = '#ffb000';   // CRT amber
const COLOR_INK    = '#c8e8c8';   // phosphor green text
const COLOR_RULE   = '#1a3024';   // dim trace
const COLOR_PAPER  = '#07100c';   // oscilloscope black
const COLOR_MUTED  = '#6b8c75';   // faded phosphor

function renderFigures() {
  if (!state.data || typeof Plotly === 'undefined') return;
  renderPareto();
  renderPassK();
}

function renderPareto() {
  const el = document.querySelector('#pareto-plot');
  if (!el) return;
  el.innerHTML = '';

  const rows = [...state.data.results].sort(
    (a, b) => b.pass_at_k['5'].mean - a.pass_at_k['5'].mean
  );
  const mses = rows.map(r => r.normalized_mse.mean);
  const nonzero = mses.filter(m => m > 0);
  // Plotly's log axis can't render zero. Floor 0-valued MSEs at one decade
  // below the smallest non-zero value so the point still appears; the hover
  // tooltip continues to show the true (zero) value via customdata.
  const floor = nonzero.length ? Math.min(...nonzero) / 10 : 1e-5;
  const xs = mses.map(m => m > 0 ? m : floor);
  const ys = rows.map(r => r.explanation_score.mean);
  // Y-axis tops out just above the highest data point, rounded up to the
  // next 0.1 for clean tick labels.
  const yMax = Math.min(1, Math.ceil((Math.max(...ys) + 0.05) * 10) / 10);

  // Only the top-2 models (by Pass@5) get on-plot labels. The rest are
  // identifiable via hover.
  const TOP_LABELS = 2;
  const labelText = rows.map((r, i) => i < TOP_LABELS ? '  ' + r.model : '');
  const sizes  = rows.map((_, i) => i < TOP_LABELS ? 14 : 10);
  const colors = rows.map((_, i) => i === 0 ? COLOR_ACCENT : COLOR_INK);
  const opacities = rows.map((_, i) => i < TOP_LABELS ? 0.95 : 0.55);

  const trace = {
    x: xs,
    y: ys,
    text: labelText,
    textposition: 'middle right',
    textfont: { size: 12, family: PLOT_FONT, color: COLOR_INK },
    mode: 'markers+text',
    type: 'scatter',
    marker: {
      size: sizes,
      color: colors,
      opacity: opacities,
      line: { color: COLOR_INK, width: 0.5 }
    },
    customdata: rows.map(r => [r.model, r.normalized_mse.mean, r.explanation_score.se]),
    hovertemplate:
      '<b>%{customdata[0]}</b><br>' +
      'Norm. MSE: %{customdata[1]:.4g}<br>' +
      'Explanation: %{y:.2f} ± %{customdata[2]:.2f}' +
      '<extra></extra>',
    cliponaxis: false,
  };

  Plotly.newPlot(el, [trace], {
    xaxis: {
      title: { text: 'Norm. MSE (log; lower is better)', standoff: 12 },
      type: 'log',
      gridcolor: COLOR_RULE,
      zeroline: false
    },
    yaxis: {
      title: { text: 'Explanation score (higher is better)', standoff: 12 },
      range: [0, yMax],
      gridcolor: COLOR_RULE,
      zeroline: false
    },
    margin: { t: 30, r: 60, b: 70, l: 75 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: PLOT_FONT, size: 12, color: COLOR_INK },
    showlegend: false,
    annotations: [{
      text: 'Hover for model names / details',
      xref: 'paper', yref: 'paper',
      x: 0.99, y: 0.02,
      xanchor: 'right', yanchor: 'bottom',
      showarrow: false,
      font: {
        family: PLOT_FONT,
        size: 11,
        color: COLOR_MUTED
      }
    }],
    hoverlabel: {
      bgcolor: COLOR_INK,
      bordercolor: COLOR_INK,
      font: { color: COLOR_PAPER, family: PLOT_FONT }
    },
  }, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  });
}

function renderPassK() {
  const el = document.querySelector('#passk-plot');
  if (!el) return;
  el.innerHTML = '';

  const rows = [...state.data.results].sort(
    (a, b) => b.pass_at_k['5'].mean - a.pass_at_k['5'].mean
  );
  const ks = [1, 2, 3, 4, 5];

  const traces = rows.map((r, i) => ({
    x: ks,
    y: ks.map(k => r.pass_at_k[String(k)].mean),
    error_y: {
      type: 'data',
      array: ks.map(k => r.pass_at_k[String(k)].se ?? 0),
      visible: true,
      thickness: 1,
      width: 3,
      color: 'rgba(0,0,0,0.3)',
    },
    name: r.model,
    mode: 'lines+markers',
    line: {
      width: i === 0 ? 2.5 : 1.4,
      color: i === 0 ? COLOR_ACCENT : undefined,
    },
    marker: {
      size: i === 0 ? 8 : 5,
      color: i === 0 ? COLOR_ACCENT : undefined,
    },
    type: 'scatter',
    hovertemplate:
      '<b>%{fullData.name}</b><br>' +
      'k = %{x}<br>' +
      'Pass@k = %{y:.2f}%' +
      '<extra></extra>',
  }));

  Plotly.newPlot(el, traces, {
    xaxis: {
      title: { text: 'k (seeds sampled)', standoff: 12 },
      dtick: 1,
      range: [0.7, 5.3],
      gridcolor: COLOR_RULE,
      zeroline: false
    },
    yaxis: {
      title: { text: 'Pass@k (%)', standoff: 12 },
      gridcolor: COLOR_RULE,
      zerolinecolor: COLOR_RULE,
      rangemode: 'tozero',
    },
    margin: { t: 30, r: 240, b: 70, l: 75 },
    paper_bgcolor: 'transparent',
    plot_bgcolor: 'transparent',
    font: { family: PLOT_FONT, size: 12, color: COLOR_INK },
    legend: {
      orientation: 'v',
      x: 1.02, y: 1,
      xanchor: 'left', yanchor: 'top',
      bgcolor: 'rgba(0,0,0,0)',
      font: { family: PLOT_FONT, size: 11 },
      itemsizing: 'constant',
    },
    hoverlabel: {
      bgcolor: COLOR_INK,
      bordercolor: COLOR_INK,
      font: { color: COLOR_PAPER, family: PLOT_FONT }
    },
  }, {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['lasso2d', 'select2d'],
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function loadWorlds() {
  try {
    const res = await fetch('data/worlds.json');
    if (!res.ok) return;
    const { worlds } = await res.json();
    const root = document.querySelector('#worlds-grid');
    if (!root) return;
    root.innerHTML = worlds.map((w, i) => `
      <div class="world-card">
        <div class="world-num">B.${i + 1}</div>
        <h3>${w.name}</h3>
        <p class="world-tag">${w.tagline}</p>
        <p class="world-desc">${w.description}</p>
        <code class="world-eq">${w.equation}</code>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load worlds:', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  load();
  loadWorlds();
});
