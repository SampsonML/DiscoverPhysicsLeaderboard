// DiscoverPhysics leaderboard renderer
// No build step, no framework. Fetches JSON, populates table, handles sort/filter.

const COLUMNS = [
  { key: 'rank',          label: '#',          sortable: false, type: 'rank' },
  { key: 'model_display', label: 'Model',      sortable: true,  type: 'model' },
  { key: 'type',          label: 'Type',       sortable: true,  type: 'type' },
  { key: 'pass_5',        label: 'Pass@5',     sortable: true,  type: 'passbar', desc: true },
  { key: 'pass_3',        label: 'Pass@3',     sortable: true,  type: 'pass',    desc: true },
  { key: 'pass_1',        label: 'Pass@1',     sortable: true,  type: 'pass',    desc: true },
  { key: 'explanation',   label: 'Explanation',sortable: true,  type: 'score',   desc: true },
  { key: 'mse',           label: 'Norm. MSE',  sortable: true,  type: 'mse',     desc: false },
  { key: 'release_date',  label: 'Released',   sortable: true,  type: 'date',    desc: true }
];

let state = {
  data: null,
  sortKey: 'pass_5',
  sortDir: 'desc',
  typeFilter: 'all'
};

async function load() {
  try {
    const res = await fetch('data/results.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.data = await res.json();
    renderTable();
    renderMetadata();
  } catch (err) {
    document.querySelector('#results-table').innerHTML =
      `<div class="loading">Failed to load results: ${err.message}</div>`;
  }
}

function flatten(entry) {
  return {
    raw: entry,
    model_display: entry.model_display,
    organization: entry.organization,
    type: entry.type,
    release_date: entry.release_date || '',
    pass_1: entry.pass_at_k['1'].mean,
    pass_3: entry.pass_at_k['3'].mean,
    pass_5: entry.pass_at_k['5'].mean,
    pass_5_se: entry.pass_at_k['5'].se,
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

  if (state.typeFilter !== 'all') {
    rows = rows.filter(r => r.type === state.typeFilter);
  }

  rows.sort((a, b) => compare(a, b, state.sortKey, state.sortDir));

  const maxPass5 = Math.max(...rows.map(r => r.pass_5 || 0), 1);

  // header
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

  // wire up sort
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
      return `<span class="model-cell">${r.model_display}</span>` +
             `<span class="model-org">${r.organization}</span>`;
    case 'type':
      return `<span class="type-badge ${r.type}">${r.type === 'open-source' ? 'open' : 'proprietary'}</span>`;
    case 'passbar': {
      const pct = (r.pass_5 || 0);
      const fillW = (pct / maxPass5) * 100;
      const isTop = i === 0;
      return `<span class="pass-bar ${isTop ? 'is-top' : ''}">` +
             `<span class="bar"><span class="fill" style="width:${fillW}%"></span></span>` +
             `<span>${pct.toFixed(1)}</span></span>`;
    }
    case 'pass':
      return `<span class="num-cell">${r[col.key].toFixed(1)}</span>`;
    case 'score': {
      const se = r.explanation_se != null ? ` <span class="se">±${r.explanation_se.toFixed(2)}</span>` : '';
      return `<span class="num-cell">${r.explanation.toFixed(2)}${se}</span>`;
    }
    case 'mse':
      return `<span class="num-cell">${formatMSE(r.mse)}</span>`;
    case 'date':
      return `<span class="num-cell">${r.release_date}</span>`;
    default:
      return '';
  }
}

function formatMSE(v) {
  if (v == null) return '—';
  if (v < 0.001) return v.toExponential(1);
  if (v < 1) return v.toFixed(3);
  return v.toFixed(2);
}

function renderMetadata() {
  const meta = document.querySelector('#meta-stamp');
  if (meta && state.data?.metadata) {
    meta.textContent = `v${state.data.metadata.benchmark_version} · updated ${state.data.metadata.last_updated}`;
  }
}

// filter pills
document.addEventListener('click', e => {
  if (e.target.classList.contains('filter-pill')) {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    state.typeFilter = e.target.dataset.filter;
    renderTable();
  }
});

// Worlds grid
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
