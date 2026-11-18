// Token Radar dashboard: renders window.RADAR (written by main.ts from the sealed snapshot).
// No network, no framework. The board is sortable and filterable, each row opens a detail
// view with its farm plan, and the live-token protocols are kept in their own table.
// Deep links: #detail=<slug> opens a protocol, #cat=<category> and #q=<text> preset filters.

(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) {
    document.body.innerHTML = '<p style="padding:40px">Token Radar: no data. Run main.ts to write data.js.</p>';
    return;
  }
  var rows = R.rows;
  var live = R.live;
  // The snapshot's watchlist slugs: the floor the board must cover.
  var watchSet = new Set(R.watchlist || []);

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    if (n == null) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + Math.round(n);
  }
  function pct(n) {
    if (n == null) return '—';
    var s = (n > 0 ? '+' : '') + n.toFixed(2) + '%';
    return '<span class="' + (n > 0 ? 'up' : n < 0 ? 'down' : '') + '">' + s + '</span>';
  }
  function ageText(d) {
    if (d == null) return '—';
    if (d < 30) return d + 'd';
    if (d < 365) return Math.round(d / 30) + 'mo';
    return (d / 365).toFixed(1) + 'y';
  }

  // ---- Header stats -------------------------------------------------------
  var stats = $('stats');
  var statItems = [
    ['Board rows', R.board_size],
    ['Watchlist covered', R.watchlist_size + ' / ' + R.watchlist_size],
    ['Early finds', R.early_size],
    ['Live tokens aside', R.live_size],
    ['Model', R.model_version],
  ];
  stats.innerHTML = statItems.map(function (it) {
    return '<div><dt>' + it[0] + '</dt><dd>' + it[1] + '</dd></div>';
  }).join('');
  $('asof').textContent = 'Snapshot as of ' + R.as_of + ' · ' + R.source + ' · floor $' +
    (R.floor_usd / 1e6) + 'M TVL';
  $('board-size').textContent = R.board_size;

  // ---- Category multiples -------------------------------------------------
  var multBody = document.querySelector('#multiples tbody');
  var multRows = [{ category: 'All categories (global fallback)', live_count: null, multiple: R.multiples.global, from_global: true }]
    .concat(R.multiples.by_category);
  multBody.innerHTML = multRows.map(function (m) {
    return '<tr><td>' + esc(m.category) + (m.from_global ? ' *' : '') + '</td>' +
      '<td class="num">' + (m.live_count == null ? '—' : m.live_count) + '</td>' +
      '<td class="num">' + m.multiple.toFixed(3) + '×</td></tr>';
  }).join('');

  // ---- Filters ------------------------------------------------------------
  var catSel = $('cat');
  var chainSel = $('chain');
  var categories = [];
  var chains = [];
  rows.forEach(function (r) {
    if (r.category && categories.indexOf(r.category) < 0) categories.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  categories.sort();
  chains.sort();
  categories.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
  });
  chains.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; chainSel.appendChild(o);
  });

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', limit: 50 };
  var hash = new URLSearchParams((location.hash || '').slice(1));
  if (hash.get('cat')) { state.cat = hash.get('cat'); catSel.value = state.cat; }
  if (hash.get('q')) { state.q = hash.get('q'); $('q').value = state.q; }
  if (hash.get('chain')) { state.chain = hash.get('chain'); chainSel.value = state.chain; }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var out = rows.filter(function (r) {
      if (state.watch && !watchSet.has(r.slug)) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var by = {
      rank: function (a, b) { return a.rank - b.rank; },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd; },
      growth: function (a, b) { return (b.change_7d || 0) - (a.change_7d || 0); },
      age: function (a, b) { return (b.age_days || 0) - (a.age_days || 0); },
    }[state.sort];
    out.sort(by);
    return out;
  }

  function renderBoard() {
    var list = filtered();
    var shown = state.limit === 'all' ? list : list.slice(0, state.limit);
    $('count').textContent = '· ' + list.length + ' of ' + rows.length + ' rows' +
      (list.length > shown.length ? ' (showing ' + shown.length + ')' : '');
    $('empty').hidden = list.length > 0;
    $('rows').innerHTML = shown.map(function (r) {
      return '<tr data-slug="' + esc(r.slug) + '">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td class="name">' + esc(r.name) + '<span class="slug">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + (watchSet.has(r.slug) ? ' <span class="tag watch">watchlist</span>' : '') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num">' + pct(r.change_7d) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
  }

  function openDetail(slug) {
    var r = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].slug === slug) { r = rows[i]; break; }
    if (!r) return;
    document.querySelectorAll('#rows tr').forEach(function (tr) {
      tr.classList.toggle('selected', tr.getAttribute('data-slug') === slug);
    });
    var d = $('detail');
    d.hidden = false;
    var mult = r.category_multiple;
    var base = r.tvl_usd * mult;
    var catHasMultiple = R.multiples.by_category.some(function (m) { return m.category === r.category; });
    var multSource = catHasMultiple
      ? 'The multiple is the median mcap/TVL of live-token protocols in the ' + esc(r.category || 'same') + ' category, read from this snapshot.'
      : 'The multiple is the global median mcap/TVL of all live-token protocols in this snapshot, because the ' + esc(r.category || 'same') + ' category has too few live tokens to set its own.';
    $('detail-body').innerHTML =
      '<h3>' + esc(r.name) + ' <span class="count">rank ' + r.rank + ' · ' + esc(r.slug) + '</span></h3>' +
      '<p class="sub">' + esc(r.category || 'No category') + ' · ' + esc((r.chains || []).join(', ') || '—') +
      ' · listed ' + esc(r.listed_at || 'unknown') + (watchSet.has(r.slug) ? ' · <span class="tag watch">watchlist</span>' : '') + '</p>' +
      '<dl class="detail-grid">' +
      '<div><dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>TVL</dt><dd>' + money(r.tvl_usd) + '</dd></div>' +
      '<div><dt>Category multiple</dt><dd>' + mult.toFixed(3) + '×</dd></div>' +
      '<div><dt>Base (TVL × multiple)</dt><dd>' + money(base) + '</dd></div>' +
      '<div><dt>Growth multiplier</dt><dd>' + r.growth_multiplier.toFixed(2) + '×</dd></div>' +
      '<div><dt>Maturity multiplier</dt><dd>' + r.maturity_multiplier.toFixed(2) + '×</dd></div>' +
      '<div><dt>Chain breadth</dt><dd>' + r.breadth_multiplier.toFixed(2) + '×</dd></div>' +
      '<div><dt>7-day TVL change</dt><dd>' + (r.change_7d == null ? '—' : (r.change_7d > 0 ? '+' : '') + r.change_7d.toFixed(2) + '%') + '</dd></div>' +
      '<div><dt>Age</dt><dd>' + ageText(r.age_days) + '</dd></div>' +
      '<div><dt>Token status</dt><dd>Pre-token — no token recorded</dd></div>' +
      '</dl>' +
      '<p class="model-line">Implied = ' + money(r.tvl_usd) + ' × ' + mult.toFixed(3) + ' × ' +
      r.growth_multiplier.toFixed(2) + ' × ' + r.maturity_multiplier.toFixed(2) + ' × ' +
      r.breadth_multiplier.toFixed(2) + ' = ' + money(r.implied_value_usd) +
      '. ' + multSource + '</p>' +
      '<h4>Farm plan — how to farm ' + esc(r.name) + '</h4>' +
      '<ol class="steps">' + (r.farm_steps || []).map(function (s, i) {
        return '<li><span class="step-no">' + (i + 1) + '</span>' + esc(s) + '</li>';
      }).join('') + '</ol>';
    d.scrollIntoView({ behavior: 'auto', block: 'start' });
  }

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) openDetail(tr.getAttribute('data-slug'));
  });

  // ---- Live tokens --------------------------------------------------------
  $('live-rows').innerHTML = live.map(function (p) {
    return '<tr><td class="name">' + esc(p.name) + '<span class="slug">' + esc(p.slug) + '</span></td>' +
      '<td>' + esc(p.category || '—') + '</td>' +
      '<td>' + esc((p.chains || []).slice(0, 2).join(', ') || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td>' +
      '<td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + pct(p.change_7d) + '</td></tr>';
  }).join('');

  // ---- Wire controls ------------------------------------------------------
  $('q').addEventListener('input', function () { state.q = this.value; renderBoard(); });
  catSel.addEventListener('change', function () { state.cat = this.value; renderBoard(); });
  chainSel.addEventListener('change', function () { state.chain = this.value; renderBoard(); });
  $('watch').addEventListener('change', function () { state.watch = this.checked; renderBoard(); });
  $('sort').addEventListener('change', function () { state.sort = this.value; renderBoard(); });
  $('limit').addEventListener('change', function () {
    state.limit = this.value === 'all' ? 'all' : parseInt(this.value, 10);
    renderBoard();
  });

  renderBoard();
  var detailSlug = hash.get('detail');
  if (detailSlug) openDetail(detailSlug);
})();
