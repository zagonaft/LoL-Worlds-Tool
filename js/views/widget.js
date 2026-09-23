// Floating live score widget (and a full-screen version at #/widget).
// Live data comes from LoL Esports; if that's unavailable it falls back to the
// score an admin entered in the app.
import { getLiveSnapshot } from '../lolesports.js';
import { esc, relTime, teamLogo } from '../ui.js';
import { matchStatus } from '../scoring.js';

const ui = {
  open: localStorage.getItem('lwt:widget:open') === '1',
  anyLeague: localStorage.getItem('lwt:widget:any') === '1',
};
let live = null;
let liveError = null;
let lastFetch = 0;
let timer = null;
let ctxRef = null;
let fullPage = false;

const DRAGON_COLORS = {
  ocean: '#3aa0ff', infernal: '#ff6b3d', mountain: '#b08850', cloud: '#cfe3ff',
  hextech: '#29d9d0', chemtech: '#7ddc3a', elder: '#c07bff',
};

function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(tick, ms);
}

async function tick() {
  const enabled = ctxRef?.league && ctxRef.settings.liveApi;
  if (enabled && document.visibilityState === 'visible') {
    try {
      live = await getLiveSnapshot({ anyLeague: ui.anyLeague });
      liveError = null;
    } catch (err) {
      live = null;
      liveError = err.message;
    }
    lastFetch = Date.now();
    paint();
  }
  schedule(live && (ui.open || fullPage) ? 15000 : 60000);
}

export function update(ctx, opts = {}) {
  ctxRef = ctx;
  const wasFull = fullPage;
  fullPage = !!opts.fullPage;
  if (!timer || (fullPage && !wasFull)) schedule(300);
  paint();
}

function fmtGold(g) {
  return `${(g / 1000).toFixed(1)}k`;
}

function statsTable(stats) {
  const { blue, red } = stats;
  const dragons = (list) => list.map((d) => `<i class="drake" title="${esc(d)}" style="background:${DRAGON_COLORS[d] || '#999'}"></i>`).join('') || '<span class="muted">0</span>';
  const row = (label, b, r, lead = true) => {
    const cls = (x, y) => (lead && x > y ? 'lead' : '');
    return `<tr><td class="${cls(b, r)}">${b}</td><th>${label}</th><td class="${cls(r, b)}">${r}</td></tr>`;
  };
  return `
    <table class="lw-stats">
      <thead><tr><th class="side-blue">${esc(blue.code)}</th><th></th><th class="side-red">${esc(red.code)}</th></tr></thead>
      <tbody>
        ${row('Kills', blue.kills, red.kills)}
        <tr><td class="${blue.gold > red.gold ? 'lead' : ''}">${fmtGold(blue.gold)}</td><th>Gold</th><td class="${red.gold > blue.gold ? 'lead' : ''}">${fmtGold(red.gold)}</td></tr>
        ${row('Towers', blue.towers, red.towers)}
        <tr><td>${dragons(blue.dragons)}</td><th>Dragons</th><td>${dragons(red.dragons)}</td></tr>
        ${row('Barons', blue.barons, red.barons)}
        ${row('Inhibs', blue.inhibitors, red.inhibitors)}
      </tbody>
    </table>`;
}

function myPickLine(ctx, match) {
  if (!match || !ctx.me) return '';
  const pick = ctx.state.picks.find((p) => p.matchId === match.id && p.playerId === ctx.me.id);
  if (!pick?.winner) return '';
  const code = pick.winner === 'A' ? match.teamA : match.teamB;
  return `<div class="lw-pick">Your pick: <strong>${esc(code)}</strong>${pick.score ? ` ${esc(pick.score.replace('-', '–'))}` : ''}</div>`;
}

function findOurMatch(ctx, snap) {
  const codes = snap.teams.map((t) => String(t.code).toUpperCase());
  return ctx.state.matches.find((m) => m.esportsMatchId === snap.esportsMatchId)
    || ctx.state.matches.find((m) => codes.includes(String(m.teamA).toUpperCase()) && codes.includes(String(m.teamB).toUpperCase()) && matchStatus(m) !== 'final');
}

function paint() {
  const el = document.getElementById('live-widget');
  if (!el) return;
  const ctx = ctxRef;
  if (!ctx?.league || (!ctx.me && !fullPage)) {
    el.hidden = true;
    return;
  }
  const now = Date.now();
  const manual = ctx.state.matches.find((m) => matchStatus(m, now) === 'live');
  const next = ctx.state.matches.find((m) => m.startMs > now && matchStatus(m, now) === 'open');
  const open = ui.open || fullPage;
  el.hidden = false;
  el.className = `live-widget ${open ? 'is-open' : ''} ${fullPage ? 'is-full' : ''}`;

  let pill;
  let body;
  if (live) {
    const [a, b] = live.teams;
    const ours = findOurMatch(ctx, live);
    pill = `<span class="live-dot"></span><strong>${esc(a?.code)} ${a?.wins ?? 0}–${b?.wins ?? 0} ${esc(b?.code)}</strong>`;
    body = `
      <div class="lw-meta"><span class="live-dot"></span> LIVE · ${esc(live.league)}${live.blockName ? ` · ${esc(live.blockName)}` : ''} · Bo${live.bestOf}</div>
      <div class="lw-teams">
        <div class="lw-team">${teamLogo(ctx.team(a?.code) || a, 'lg')}<strong>${esc(a?.code)}</strong></div>
        <div class="lw-score">${a?.wins ?? 0}<i>–</i>${b?.wins ?? 0}</div>
        <div class="lw-team">${teamLogo(ctx.team(b?.code) || b, 'lg')}<strong>${esc(b?.code)}</strong></div>
      </div>
      ${myPickLine(ctx, ours)}
      ${live.stats ? `<div class="lw-game">Game ${live.gameNumber}${live.stats.gameState === 'paused' ? ' · paused' : ''} <span class="muted small">(~1 min delay)</span></div>${statsTable(live.stats)}`
        : `<div class="lw-game muted">${live.gameNumber ? `Game ${live.gameNumber} starting…` : 'Between games'}</div>`}
      ${!live.isWorlds ? '<p class="muted small">Not a Worlds match: showing other leagues because that option is on.</p>' : ''}`;
  } else if (manual) {
    const r = manual.result || {};
    const A = ctx.team(manual.teamA);
    const B = ctx.team(manual.teamB);
    pill = `<span class="live-dot"></span><strong>${esc(manual.teamA)} ${r.scoreA ?? 0}–${r.scoreB ?? 0} ${esc(manual.teamB)}</strong>`;
    body = `
      <div class="lw-meta"><span class="live-dot"></span> LIVE · Bo${manual.bestOf}</div>
      <div class="lw-teams">
        <div class="lw-team">${teamLogo(A, 'lg')}<strong>${esc(manual.teamA)}</strong></div>
        <div class="lw-score">${r.scoreA ?? 0}<i>–</i>${r.scoreB ?? 0}</div>
        <div class="lw-team">${teamLogo(B, 'lg')}<strong>${esc(manual.teamB)}</strong></div>
      </div>
      ${myPickLine(ctx, manual)}
      <p class="muted small">Score as entered in the app${ctx.settings.liveApi ? (liveError ? ' (LoL Esports live data unavailable right now)' : '') : ''}.</p>`;
  } else if (next) {
    const A = ctx.team(next.teamA);
    const B = ctx.team(next.teamB);
    pill = `<span class="muted">Next:</span> <strong>${esc(next.teamA)} vs ${esc(next.teamB)}</strong> <span class="muted">${relTime(next.startMs)}</span>`;
    body = `
      <div class="lw-meta">NEXT MATCH · Bo${next.bestOf}</div>
      <div class="lw-teams">
        <div class="lw-team">${teamLogo(A, 'lg')}<strong>${esc(next.teamA)}</strong></div>
        <div class="lw-score small-score">${relTime(next.startMs)}</div>
        <div class="lw-team">${teamLogo(B, 'lg')}<strong>${esc(next.teamB)}</strong></div>
      </div>
      ${myPickLine(ctx, next) || (!ctx.me || ctx.state.picks.some((p) => p.matchId === next.id && p.playerId === ctx.me.id) ? '' : `<div class="lw-pick warn">You haven't picked yet</div>`)}`;
  } else if (!fullPage) {
    el.hidden = true; // nothing live or coming up: stay out of the way
    return;
  } else {
    body = '<p class="muted">Nothing live and nothing scheduled right now.</p>';
  }

  if (!open) {
    el.innerHTML = `<button class="lw-pill" data-action="widgetToggle" aria-label="Open live score">${pill}</button>`;
    return;
  }
  el.innerHTML = `
    <div class="lw-card">
      <div class="lw-head">
        <strong>Live score</strong>
        <span class="lw-head-actions">
          ${fullPage ? '<a class="btn btn-sm btn-ghost" href="#/matches">Open app</a>' : '<a class="icon-btn" href="#/widget" title="Full screen">⤢</a><button class="icon-btn" data-action="widgetToggle" aria-label="Minimize">▾</button>'}
        </span>
      </div>
      <div class="lw-body">${body}</div>
      <div class="lw-foot">
        <a href="https://lolesports.com/live/worlds" target="_blank" rel="noopener">Watch on lolesports.com ↗</a>
        ${ctx.settings.liveApi ? `<label class="check small"><input type="checkbox" data-change="widgetAny" ${ui.anyLeague ? 'checked' : ''}> Show other leagues when Worlds isn't live</label>` : ''}
        ${ctx.settings.liveApi && lastFetch ? `<span class="muted small">${liveError ? 'LoL Esports live data is unavailable right now.' : `Updated ${relTime(lastFetch)}`}</span>` : ''}
      </div>
    </div>`;
}

export const actions = {
  widgetToggle() {
    ui.open = !ui.open;
    localStorage.setItem('lwt:widget:open', ui.open ? '1' : '0');
    paint();
    if (ui.open) schedule(0);
  },
};

export const changes = {
  widgetAny(el) {
    ui.anyLeague = el.checked;
    localStorage.setItem('lwt:widget:any', ui.anyLeague ? '1' : '0');
    schedule(0);
  },
};
