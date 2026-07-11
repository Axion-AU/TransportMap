/**
 * Admin UI (§4.1, §4.2, §4.4). Single self-contained page; talks to /api/*
 * with a bearer token kept in localStorage. The embedded script deliberately
 * avoids template literals so this file needs no escaping gymnastics.
 */
export function renderAdminPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Meat Grinder</title>
<style>
  :root { --bg:#101418; --card:#1a2027; --ink:#e6e8ea; --dim:#8b949e; --acc:#4cc38a;
          --warn:#e5b567; --bad:#e5484d; --line:#2b3440; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink);
         font:14px/1.45 system-ui, -apple-system, sans-serif; }
  header { display:flex; gap:12px; align-items:center; padding:10px 16px;
           border-bottom:1px solid #2b3440; position:sticky; top:0; background:var(--bg); }
  header h1 { font-size:15px; margin:0 12px 0 0; }
  nav button { background:none; border:none; color:var(--dim); padding:6px 10px;
               cursor:pointer; font-size:14px; border-radius:6px; }
  nav button.active { color:var(--ink); background:var(--card); }
  main { padding:16px; max-width:1100px; margin:0 auto; }
  .card { background:var(--card); border:1px solid #2b3440; border-radius:10px;
          padding:12px 14px; margin-bottom:12px; }
  .meta { color:var(--dim); font-size:12px; display:flex; gap:10px; flex-wrap:wrap; }
  .tag { border:1px solid #2b3440; border-radius:999px; padding:1px 8px; }
  .tag.risk-high { color:var(--bad); border-color:var(--bad); }
  .tag.risk-medium { color:var(--warn); border-color:var(--warn); }
  textarea { width:100%; min-height:84px; margin-top:8px; background:#0d1117;
             color:var(--ink); border:1px solid #2b3440; border-radius:8px; padding:8px;
             font:inherit; resize:vertical; }
  .counter { font-size:12px; color:var(--dim); }
  .counter.over { color:var(--bad); font-weight:600; }
  .row { display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap; }
  button.act { background:#232b34; color:var(--ink); border:1px solid #2b3440;
               border-radius:7px; padding:6px 12px; cursor:pointer; }
  button.act.primary { background:var(--acc); color:#08130d; border:none; font-weight:600; }
  button.act.danger { color:var(--bad); }
  select, input[type=text], input[type=datetime-local], input[type=url] {
    background:#0d1117; color:var(--ink); border:1px solid #2b3440; border-radius:7px;
    padding:6px 8px; font:inherit; }
  table { border-collapse:collapse; width:100%; font-size:13px; }
  th, td { text-align:left; padding:4px 8px; border-bottom:1px solid #2b3440; }
  th { color:var(--dim); font-weight:500; }
  .muted { color:var(--dim); }
  .big { font-size:26px; font-weight:700; }
  svg { background:#0d1117; border:1px solid #2b3440; border-radius:8px; }
  pre { white-space:pre-wrap; background:#0d1117; padding:8px; border-radius:8px; }
  form.newtake label { display:block; margin-top:10px; color:var(--dim); font-size:12px; }
</style>
</head>
<body>
<header>
  <h1>Meat Grinder</h1>
  <nav id="nav"></nav>
  <span style="flex:1"></span>
  <button class="act" onclick="setToken()">token</button>
  <button class="act" onclick="setEditorName()" id="whoami">who</button>
</header>
<main id="main">Loading…</main>
<script>
'use strict';
var TABS = ['Queue','Pool','New take','Replies','Performance','Ops'];
var state = { tab: 'Queue' };
var LIMITS = { mastodon: 500, bluesky: 300 };

function token() { return localStorage.getItem('grinder_token') || ''; }
function setToken() {
  var t = prompt('Admin API token:', token());
  if (t !== null) { localStorage.setItem('grinder_token', t); render(); }
}
function editorName() { return localStorage.getItem('grinder_editor') || ''; }
function setEditorName() {
  var n = prompt('Your name (recorded as editor/approver):', editorName());
  if (n !== null) { localStorage.setItem('grinder_editor', n); updateWho(); }
}
function updateWho() {
  document.getElementById('whoami').textContent = editorName() || 'who?';
}
function requireEditor() {
  if (!editorName()) setEditorName();
  return editorName();
}

function api(path, opts) {
  opts = opts || {};
  opts.headers = Object.assign({ 'Authorization': 'Bearer ' + token() }, opts.headers || {});
  if (opts.body && typeof opts.body !== 'string') {
    opts.body = JSON.stringify(opts.body);
    opts.headers['Content-Type'] = 'application/json';
  }
  return fetch(path, opts).then(function (r) {
    return r.json().then(function (j) {
      if (!r.ok) throw new Error(j.error || r.status);
      return j;
    });
  });
}

function el(tag, attrs, children) {
  var e = document.createElement(tag);
  attrs = attrs || {};
  Object.keys(attrs).forEach(function (k) {
    if (k === 'onclick' || k === 'oninput' || k === 'onchange') e[k] = attrs[k];
    else if (k === 'text') e.textContent = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  });
  (children || []).forEach(function (c) { if (c) e.appendChild(c); });
  return e;
}

function lengthFor(platform, text) {
  if (platform === 'bluesky' && typeof Intl.Segmenter === 'function') {
    var n = 0, it = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
    for (var s of it) { n++; }
    return n;
  }
  return text.length;
}

function fail(e) { alert(e.message || e); }

/* ---------- Queue + Pool cards ---------- */

function expiryOptions(current) {
  var sel = el('select', {});
  [['','expiry…'],['6','6h'],['24','24h'],['48','48h'],['168','7d'],['336','14d'],['custom','custom…']]
    .forEach(function (o) {
      sel.appendChild(el('option', { value: o[0], text: o[1] }));
    });
  sel.onchange = function () {
    var v = sel.value, iso = null;
    if (v === 'custom') {
      var d = prompt('Expiry (ISO8601, e.g. 2026-07-14T09:00:00Z):', current || '');
      if (d) iso = new Date(d).toISOString();
    } else if (v) {
      iso = new Date(Date.now() + Number(v) * 3600 * 1000).toISOString();
    }
    if (iso) api('/api/posts/' + sel.dataset.id + '/expiry', { method: 'POST', body: { freshness_expiry: iso } })
      .then(render).catch(fail);
  };
  return sel;
}

function postCard(p, pool) {
  var counter = el('span', { class: 'counter' });
  var ta = el('textarea', { text: p.text_final });
  function updateCount() {
    var n = lengthFor(p.platform, ta.value);
    counter.textContent = n + ' / ' + LIMITS[p.platform] + (p.platform === 'bluesky' ? ' graphemes' : '');
    counter.className = 'counter' + (n > LIMITS[p.platform] ? ' over' : '');
  }
  ta.oninput = updateCount;

  var meta = el('div', { class: 'meta' }, [
    el('span', { class: 'tag', text: p.platform }),
    el('span', { class: 'tag', text: p.topic }),
    el('span', { class: 'tag', text: p.archetype }),
    el('span', { class: 'tag risk-' + p.risk_tier, text: 'risk: ' + p.risk_tier }),
    p.predicted_score != null ? el('span', { class: 'tag', text: 'score ' + Number(p.predicted_score).toFixed(1) + '/10' }) : null,
    el('span', { class: 'tag', text: p.origin }),
    el('span', { text: 'expires ' + new Date(p.freshness_expiry).toLocaleString() }),
    p.link_url ? el('a', { href: p.link_url, target: '_blank', text: 'link' }) : null,
    p.platform_post_url ? el('a', { href: p.platform_post_url, target: '_blank', text: 'live post' }) : null
  ]);

  var exp = expiryOptions(p.freshness_expiry); exp.dataset.id = p.id;
  var row = el('div', { class: 'row' }, [counter, el('span', { style: 'flex:1' }), exp]);
  var actions = el('div', { class: 'row' });

  function act(label, cls, fn) {
    actions.appendChild(el('button', { class: 'act ' + cls, text: label, onclick: fn }));
  }

  act('Save edit', '', function () {
    api('/api/posts/' + p.id + '/edit', { method: 'POST', body: { text: ta.value, editor: requireEditor() } })
      .then(render).catch(fail);
  });
  if (!pool) {
    act('Approve', 'primary', function () {
      var who = requireEditor(); if (!who) return;
      api('/api/posts/' + p.id + '/approve', { method: 'POST', body: { approver: who } })
        .then(render).catch(fail);
    });
  } else {
    if (p.status === 'scheduled') {
      act('Unschedule', '', function () {
        api('/api/posts/' + p.id + '/unschedule', { method: 'POST', body: {} }).then(render).catch(fail);
      });
    } else {
      act('Fire now', 'primary', function () {
        if (!confirm('Publish this post to ' + p.platform + ' immediately?')) return;
        api('/api/posts/' + p.id + '/fire', { method: 'POST', body: {} }).then(render).catch(fail);
      });
    }
  }
  act('Dismiss', 'danger', function () {
    api('/api/posts/' + p.id + '/dismiss', { method: 'POST', body: {} }).then(render).catch(fail);
  });

  var card = el('div', { class: 'card' }, [meta, ta, row, actions]);
  updateCount();
  return card;
}

function viewQueue(main) {
  api('/api/posts?status=generated').then(function (posts) {
    main.innerHTML = '';
    if (posts.length === 0) main.appendChild(el('p', { class: 'muted', text: 'Review queue is empty.' }));
    posts.forEach(function (p) { main.appendChild(postCard(p, false)); });
  }).catch(fail);
}

function viewPool(main) {
  Promise.all([api('/api/posts?status=approved'), api('/api/posts?status=scheduled'), api('/api/stats')])
    .then(function (res) {
      main.innerHTML = '';
      main.appendChild(el('p', { class: 'muted',
        text: 'Approved pool — the scheduler picks timing from here (never content). High-risk posts only ever fire via the Fire now button. Expired to date: ' + res[2].expired_total }));
      res[1].forEach(function (p) { main.appendChild(postCard(p, true)); });
      res[0].forEach(function (p) { main.appendChild(postCard(p, true)); });
      if (res[0].length + res[1].length === 0) main.appendChild(el('p', { class: 'muted', text: 'Pool is empty.' }));
    }).catch(fail);
}

/* ---------- New take ---------- */

function viewNewTake(main) {
  main.innerHTML = '';
  var f = el('form', { class: 'newtake card' });
  function field(label, input) { f.appendChild(el('label', { text: label })); f.appendChild(input); return input; }
  var platform = field('Platform', el('select', { html:
    '<option value="mastodon">mastodon</option><option value="bluesky">bluesky</option>' }));
  var text = field('Text', el('textarea', {}));
  var counter = el('span', { class: 'counter' }); f.appendChild(counter);
  text.oninput = function () {
    var n = lengthFor(platform.value, text.value);
    counter.textContent = n + ' / ' + LIMITS[platform.value];
    counter.className = 'counter' + (n > LIMITS[platform.value] ? ' over' : '');
  };
  var topic = field('Topic', el('input', { type: 'text', placeholder: 'transport, housing, …' }));
  var archetype = field('Archetype', el('select', { html:
    ['data_drop','outrage_hook','question','policy_explainer','quote_card','thread_starter']
      .map(function (a) { return '<option>' + a + '</option>'; }).join('') }));
  var risk = field('Risk tier', el('select', { html:
    '<option>low</option><option>medium</option><option>high</option>' }));
  var link = field('Link URL (optional)', el('input', { type: 'url' }));
  var submit = el('button', { class: 'act primary', text: 'Create take', type: 'button' });
  f.appendChild(el('div', { class: 'row' }, [submit]));
  submit.onclick = function () {
    api('/api/posts', { method: 'POST', body: {
      platform: platform.value, text: text.value, topic: topic.value,
      archetype: archetype.value, risk_tier: risk.value,
      link_url: link.value || undefined, author: requireEditor() || undefined
    }}).then(function () { state.tab = 'Queue'; render(); }).catch(fail);
  };
  main.appendChild(el('p', { class: 'muted',
    text: 'Manual takes enter at generated and go through the same review gate — even self-authored posts get a second look before pooling.' }));
  main.appendChild(f);
}

/* ---------- Replies ---------- */

function viewReplies(main) {
  Promise.all([api('/api/replies'), api('/api/mentions?triage=escalate'), api('/api/mentions?triage=pending')])
    .then(function (res) {
      main.innerHTML = '';
      var drafts = res[0].filter(function (d) { return d.status === 'draft'; });
      main.appendChild(el('h3', { text: 'Reply drafts (' + drafts.length + ')' }));
      drafts.forEach(function (d) {
        var ta = el('textarea', { text: d.text_final });
        var card = el('div', { class: 'card' }, [
          el('div', { class: 'meta' }, [
            el('span', { class: 'tag', text: d.platform }),
            el('span', { text: '@' + d.author_handle })
          ]),
          el('p', { class: 'muted', text: d.mention_text }),
          ta,
          el('div', { class: 'row' }, [
            el('button', { class: 'act', text: 'Save edit', onclick: function () {
              api('/api/replies/' + d.id + '/edit', { method: 'POST', body: { text: ta.value } }).then(render).catch(fail);
            } }),
            el('button', { class: 'act primary', text: 'Approve + post now', onclick: function () {
              var who = requireEditor(); if (!who) return;
              api('/api/replies/' + d.id + '/approve', { method: 'POST', body: { approver: who } }).then(render).catch(fail);
            } }),
            el('button', { class: 'act danger', text: 'Dismiss', onclick: function () {
              api('/api/replies/' + d.id + '/dismiss', { method: 'POST', body: {} }).then(render).catch(fail);
            } })
          ])
        ]);
        main.appendChild(card);
      });

      function mentionList(title, mentions) {
        main.appendChild(el('h3', { text: title + ' (' + mentions.length + ')' }));
        mentions.forEach(function (m) {
          main.appendChild(el('div', { class: 'card' }, [
            el('div', { class: 'meta' }, [
              el('span', { class: 'tag', text: m.platform }),
              el('span', { text: '@' + m.author_handle }),
              m.triage_reason ? el('span', { text: m.triage_reason }) : null
            ]),
            el('p', { text: m.text }),
            el('div', { class: 'row' }, [
              el('button', { class: 'act', text: 'Draft reply', onclick: function () {
                var t = prompt('Reply text:'); if (!t) return;
                api('/api/mentions/' + m.id + '/draft', { method: 'POST', body: { text: t } }).then(render).catch(fail);
              } }),
              el('button', { class: 'act danger', text: 'Ignore', onclick: function () {
                api('/api/mentions/' + m.id + '/triage', { method: 'POST', body: { action: 'ignore' } }).then(render).catch(fail);
              } })
            ])
          ]));
        });
      }
      mentionList('Escalated mentions', res[1]);
      mentionList('Pending triage', res[2]);
    }).catch(fail);
}

/* ---------- Performance ---------- */

function scatterSvg(points) {
  var w = 520, h = 300, pad = 34;
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', w); svg.setAttribute('height', h);
  if (points.length === 0) return svg;
  var ys = points.map(function (p) { return p.reward; });
  var ymin = Math.min.apply(null, ys.concat([0])), ymax = Math.max.apply(null, ys.concat([0.001]));
  function sx(v) { return pad + (v / 10) * (w - 2 * pad); }
  function sy(v) { return h - pad - ((v - ymin) / (ymax - ymin || 1)) * (h - 2 * pad); }
  function line(x1, y1, x2, y2) {
    var l = document.createElementNS(svg.namespaceURI, 'line');
    l.setAttribute('x1', x1); l.setAttribute('y1', y1);
    l.setAttribute('x2', x2); l.setAttribute('y2', y2);
    l.setAttribute('stroke', '#2b3440'); svg.appendChild(l);
  }
  line(pad, h - pad, w - pad, h - pad); line(pad, pad, pad, h - pad);
  if (ymin < 0 && ymax > 0) line(pad, sy(0), w - pad, sy(0));
  points.forEach(function (p) {
    var c = document.createElementNS(svg.namespaceURI, 'circle');
    c.setAttribute('cx', sx(p.predicted_score)); c.setAttribute('cy', sy(p.reward));
    c.setAttribute('r', 4); c.setAttribute('fill', '#4cc38a'); c.setAttribute('fill-opacity', '0.75');
    var t = document.createElementNS(svg.namespaceURI, 'title');
    t.textContent = p.text_final.slice(0, 120) + ' — predicted ' + p.predicted_score + ', reward ' + p.reward.toFixed(2);
    c.appendChild(t); svg.appendChild(c);
  });
  return svg;
}

function viewPerformance(main) {
  var platform = state.perfPlatform || 'mastodon';
  Promise.all([api('/api/calibration?platform=' + platform), api('/api/arms')])
    .then(function (res) {
      var cal = res[0], arms = res[1];
      main.innerHTML = '';
      var toggle = el('div', { class: 'row' });
      ['mastodon', 'bluesky'].forEach(function (pl) {
        toggle.appendChild(el('button', { class: 'act' + (pl === platform ? ' primary' : ''), text: pl,
          onclick: function () { state.perfPlatform = pl; render(); } }));
      });
      main.appendChild(toggle);

      var rho = cal.spearman == null ? 'n/a (need ≥3 posts)' : cal.spearman.toFixed(2);
      main.appendChild(el('div', { class: 'card' }, [
        el('div', { class: 'muted', text: 'Predicted score vs realised reward — Spearman ρ, trailing 90d (' + cal.n + ' posts)' }),
        el('div', { class: 'big', text: String(rho) }),
        el('p', { class: 'muted', text: 'ρ > 0.3 sustained: score is informative, consider raising the culling bar. |ρ| < 0.15: the score is vibes; demote to display-only. Quarterly human call — never automated.' }),
        scatterSvg(cal.points)
      ]));

      function missList(title, list) {
        var card = el('div', { class: 'card' }, [el('h3', { text: title })]);
        list.forEach(function (m) {
          card.appendChild(el('p', {}, [
            el('span', { class: 'tag', text: 'predicted ' + m.predicted_score + ' / reward ' + m.reward.toFixed(2) + ' ' }),
            el('span', { text: ' ' + m.text_final })
          ]));
        });
        if (list.length === 0) card.appendChild(el('p', { class: 'muted', text: 'No data yet.' }));
        return card;
      }
      missList; // used below
      main.appendChild(missList('Biggest misses — model loved it, it flopped', cal.overconfident));
      main.appendChild(missList('Biggest misses — model underrated it', cal.underrated));

      var armsCard = el('div', { class: 'card' }, [el('h3', { text: 'Slot/archetype arms (pulled only)' })]);
      var tbl = el('table', { html: '<tr><th>platform</th><th>slot</th><th>archetype</th><th>mean</th><th>var</th><th>pulls</th></tr>' });
      arms.slot_arms.forEach(function (a) {
        tbl.appendChild(el('tr', { html: '<td>' + a.platform + '</td><td>' + a.slot + '</td><td>' + a.archetype +
          '</td><td>' + a.mean.toFixed(3) + '</td><td>' + a.variance.toFixed(3) + '</td><td>' + a.n_pulls + '</td>' }));
      });
      armsCard.appendChild(tbl);
      main.appendChild(armsCard);

      var cadCard = el('div', { class: 'card' }, [el('h3', { text: 'Cadence' })]);
      var ctbl = el('table', { html: '<tr><th>platform</th><th>day</th><th>level</th><th>target</th><th>actual</th><th>day reward</th></tr>' });
      arms.cadence_days.forEach(function (d) {
        ctbl.appendChild(el('tr', { html: '<td>' + d.platform + '</td><td>' + d.date + '</td><td>' + d.volume_level +
          '</td><td>' + d.target_volume + '</td><td>' + d.actual_volume + '</td><td>' +
          (d.day_reward == null ? '—' : d.day_reward.toFixed(3)) + '</td>' }));
      });
      cadCard.appendChild(ctbl);
      main.appendChild(cadCard);
    }).catch(fail);
}

/* ---------- Ops ---------- */

function viewOps(main) {
  Promise.all([api('/api/stats'), api('/api/style-rules'), api('/api/config')])
    .then(function (res) {
      main.innerHTML = '';
      var stats = res[0];
      var counts = el('div', { class: 'card' }, [el('h3', { text: 'Pipeline' })]);
      var tbl = el('table', { html: '<tr><th>status</th><th>platform</th><th>count</th></tr>' });
      stats.by_status.forEach(function (s) {
        tbl.appendChild(el('tr', { html: '<td>' + s.status + '</td><td>' + s.platform + '</td><td>' + s.c + '</td>' }));
      });
      counts.appendChild(tbl);
      main.appendChild(counts);

      var rules = el('div', { class: 'card' }, [el('h3', { text: 'Style rule proposals (monthly diff analysis)' })]);
      res[1].forEach(function (r) {
        rules.appendChild(el('div', {}, [
          el('div', { class: 'meta' }, [
            el('span', { class: 'tag', text: r.month }),
            el('span', { class: 'tag', text: r.status })
          ]),
          el('pre', { text: r.rules }),
          r.status === 'proposed' ? el('div', { class: 'row' }, [
            el('button', { class: 'act primary', text: 'Approve into prompt', onclick: function () {
              var who = requireEditor(); if (!who) return;
              api('/api/style-rules/' + r.id + '/review', { method: 'POST', body: { decision: 'approved', reviewer: who } }).then(render).catch(fail);
            } }),
            el('button', { class: 'act danger', text: 'Reject', onclick: function () {
              var who = requireEditor(); if (!who) return;
              api('/api/style-rules/' + r.id + '/review', { method: 'POST', body: { decision: 'rejected', reviewer: who } }).then(render).catch(fail);
            } })
          ]) : null
        ]));
      });
      if (res[1].length === 0) rules.appendChild(el('p', { class: 'muted', text: 'None yet.' }));
      main.appendChild(rules);

      var cfg = el('div', { class: 'card' }, [el('h3', { text: 'Config overrides' })]);
      cfg.appendChild(el('p', { class: 'muted', text: 'Keys present in the config table (defaults apply otherwise). Edit via prompt as JSON.' }));
      res[2].forEach(function (c) {
        cfg.appendChild(el('div', { class: 'row' }, [
          el('span', { class: 'tag', text: c.key }),
          el('span', { class: 'muted', text: (c.value.length > 90 ? c.value.slice(0, 90) + '…' : c.value) }),
          el('button', { class: 'act', text: 'edit', onclick: function () {
            var v = prompt('JSON value for ' + c.key + ':', c.value);
            if (v === null) return;
            try { JSON.parse(v); } catch (e) { return alert('invalid JSON'); }
            api('/api/config', { method: 'PUT', body: { key: c.key, value: JSON.parse(v) } }).then(render).catch(fail);
          } })
        ]));
      });
      cfg.appendChild(el('div', { class: 'row' }, [
        el('button', { class: 'act', text: 'add key', onclick: function () {
          var k = prompt('Config key:'); if (!k) return;
          var v = prompt('JSON value:'); if (v === null) return;
          try { JSON.parse(v); } catch (e) { return alert('invalid JSON'); }
          api('/api/config', { method: 'PUT', body: { key: k, value: JSON.parse(v) } }).then(render).catch(fail);
        } })
      ]));
      main.appendChild(cfg);

      var log = el('div', { class: 'card' }, [el('h3', { text: 'Recent events' })]);
      stats.recent_events.forEach(function (ev) {
        log.appendChild(el('p', { class: ev.level === 'error' ? '' : 'muted',
          text: ev.created_at + ' [' + ev.level + '] ' + ev.kind + (ev.detail ? ' — ' + ev.detail : '') }));
      });
      main.appendChild(log);
    }).catch(fail);
}

/* ---------- shell ---------- */

function render() {
  var nav = document.getElementById('nav');
  nav.innerHTML = '';
  TABS.forEach(function (t) {
    var b = el('button', { text: t, class: t === state.tab ? 'active' : '',
      onclick: function () { state.tab = t; render(); } });
    nav.appendChild(b);
  });
  updateWho();
  var main = document.getElementById('main');
  if (!token()) {
    main.innerHTML = '';
    main.appendChild(el('p', { text: 'Set the admin API token to begin.' }));
    return;
  }
  if (state.tab === 'Queue') viewQueue(main);
  else if (state.tab === 'Pool') viewPool(main);
  else if (state.tab === 'New take') viewNewTake(main);
  else if (state.tab === 'Replies') viewReplies(main);
  else if (state.tab === 'Performance') viewPerformance(main);
  else viewOps(main);
}
render();
</script>
</body>
</html>`;
}
