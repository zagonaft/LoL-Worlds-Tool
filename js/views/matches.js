// Matches: your personal betting view. Open matches show the bet editor,
// locked/finished matches show everyone's picks side by side.
import { GAME_PROPS, STAGES, SLOT_LABELS } from '../defaults.js';
import { esc, fmtDay, fmtTime, dayKey, relTime, teamLogo, playerDot, toast } from '../ui.js';
import {
  matchStatus, isMatchOpen, scoreMatchPick, seriesScores, possibleTotals, lengthLabels,
  sideCode, seriesResult, gameActual,
} from '../scoring.js';

const ui = {
  filter: 'upcoming',
  toggled: new Set(), // cards whose default open/closed state was flipped
  gameTab: new Map(),
};

const FILTERS = [
  ['todo', 'Needs my picks'],
  ['upcoming', 'Upcoming'],
  ['results', 'Results'],
  ['all', 'All'],
];

// ---------- labels & options ----------

function code(ctx, match, side) {
  return ctx.team(sideCode(match, side))?.code || 'TBD';
}

export function pickLabel(ctx, match, key, value) {
  if (value == null || value === '') return '—';
  const s = ctx.settings;
  switch (key) {
    case 'winner':
    case 'firstBlood':
    case 'firstDragon':
    case 'firstTower':
    case 'firstBaron':
      return value === 'none' ? 'None' : code(ctx, match, value);
    case 'score':
      return String(value).replace('-', '–');
    case 'totalGames':
      return `${value} games`;
    case 'length':
      return lengthLabels(s.lengthBuckets)[value] ?? '—';
    case 'kills':
      return value === 'push' ? 'Push' : `${value === 'over' ? 'Over' : 'Under'} ${s.killsLine}`;
    default:
      return String(value);
  }
}

function optionsFor(ctx, match, key) {
  const A = code(ctx, match, 'A');
  const B = code(ctx, match, 'B');
  const s = ctx.settings;
  switch (key) {
    case 'winner':
    case 'firstBlood':
    case 'firstDragon':
    case 'firstTower':
      return [['A', A], ['B', B]];
    case 'firstBaron':
      return [['A', A], ['B', B], ['none', 'None']];
    case 'score':
      return seriesScores(match.bestOf).map((sc) => [sc, sc.replace('-', '–')]);
    case 'totalGames':
      return possibleTotals(match.bestOf).map((n) => [n, String(n)]);
    case 'length':
      return lengthLabels(s.lengthBuckets).map((l, i) => [i, l]);
    case 'kills':
      return [['under', `Under ${s.killsLine}`], ['over', `Over ${s.killsLine}`]];
    default:
      return [];
  }
}

const SERIES_BETS = [
  { key: 'winner', label: 'Match winner' },
  { key: 'score', label: 'Series score', minBo: 3 },
  { key: 'totalGames', label: 'Number of games', minBo: 3 },
];

// ---------- rendering ----------

function statusPill(match, status) {
  if (status === 'open') return `<span class="pill pill-open">Open · locks ${relTime(match.startMs)}</span>`;
  if (status === 'live') return `<span class="pill pill-live">● Live</span>`;
  if (status === 'final') return `<span class="pill pill-final">Final</span>`;
  return `<span class="pill pill-locked">Locked${match.startMs < Date.now() ? ' · awaiting result' : ''}</span>`;
}

function teamSide(ctx, match, side, winnerSide) {
  const team = ctx.team(sideCode(match, side));
  const cls = winnerSide ? (winnerSide === side ? 'won' : 'lost') : '';
  return `
    <div class="team team-${side.toLowerCase()} ${cls}">
      ${teamLogo(team)}
      <div class="team-text"><strong>${esc(team?.code || 'TBD')}</strong><span class="team-name">${esc(team?.name || 'To be decided')}</span></div>
    </div>`;
}

function betRow(ctx, match, pick, { key, label, game = null }) {
  const current = game ? pick?.games?.[game]?.[key] : pick?.[key];
  const pts = ctx.settings.points[key];
  const opts = optionsFor(ctx, match, key);
  return `
    <div class="bet-row">
      <div class="bet-label">${esc(label)} <span class="pts">${pts} pt${pts === 1 ? '' : 's'}</span></div>
      <div class="opts opts-${opts.length}">
        ${opts.map(([v, text]) => `
          <button class="opt ${current != null && String(current) === String(v) ? 'sel' : ''}"
            data-action="pick" data-mid="${esc(match.id)}" data-key="${key}" data-game="${game ?? ''}"
            data-value="${esc(v)}" ${typeof v === 'number' ? 'data-num="1"' : ''}>${esc(text)}</button>`).join('')}
      </div>
    </div>`;
}

function editor(ctx, match, pick) {
  const bo = match.bestOf || 1;
  const tab = Math.min(ui.gameTab.get(match.id) || 1, bo);
  const series = SERIES_BETS.filter((b) => !b.minBo || bo >= b.minBo).map((b) => betRow(ctx, match, pick, b)).join('');
  const tabs = bo > 1
    ? `<div class="game-tabs">${Array.from({ length: bo }, (_, i) => {
        const n = i + 1;
        const filled = Object.values(pick?.games?.[n] || {}).filter((v) => v != null).length;
        return `<button class="gtab ${n === tab ? 'active' : ''}" data-action="gameTab" data-mid="${esc(match.id)}" data-game="${n}">
          Game ${n}${filled ? `<span class="gtab-count">${filled}/${GAME_PROPS.length}</span>` : ''}</button>`;
      }).join('')}</div>`
    : '';
  const props = GAME_PROPS.map((p) => betRow(ctx, match, pick, { key: p.key, label: p.label, game: tab })).join('');
  const others = ctx.state.players.filter((p) => p.id !== ctx.me.id);
  return `
    <div class="editor">
      <h4 class="section-label">Series</h4>
      ${series}
      <h4 class="section-label">${bo > 1 ? 'Per game' : 'Game'} <span class="muted small">${bo > 1 ? '(games that aren\'t played don\'t count)' : ''}</span></h4>
      ${tabs}
      ${props}
      ${bo > 1 ? `<div class="editor-foot"><button class="btn btn-sm btn-ghost" data-action="copyG1" data-mid="${esc(match.id)}">Copy Game 1 picks to all games</button></div>` : ''}
      ${others.length ? `
        <div class="who-picked">
          ${others.map((p) => {
            const has = ctx.state.picks.some((x) => x.matchId === match.id && x.playerId === p.id && x.winner);
            return `<span class="chip ${has ? 'chip-ok' : ''}">${playerDot(p)}${esc(p.name)} ${has ? '✓' : '…'}</span>`;
          }).join('')}
          <span class="muted small">Picks are revealed when the match starts.</span>
        </div>` : ''}
    </div>`;
}

const STATUS_ICON = { won: '✓', lost: '✗', void: '∅', pending: '' };

function compareTable(ctx, match) {
  const players = ctx.state.players;
  const s = ctx.settings;
  const picks = new Map(players.map((p) => [p.id, ctx.state.picks.find((x) => x.matchId === match.id && x.playerId === p.id)]));
  const scored = new Map(players.map((p) => [p.id, scoreMatchPick(match, picks.get(p.id), s)]));
  const sr = seriesResult(match);
  const games = match.result?.games || [];
  const bo = match.bestOf || 1;

  const cell = (p, key, game) => {
    const pick = picks.get(p.id);
    const value = game ? pick?.games?.[game]?.[key] : pick?.[key];
    const it = scored.get(p.id).items.find((i) => i.key === key && i.game === game);
    const st = it?.status || '';
    return `<td class="c-${st}">${esc(pickLabel(ctx, match, key, value))} <span class="st">${STATUS_ICON[st] || ''}</span></td>`;
  };
  const row = (label, key, actual, game = null) => `
    <tr><th scope="row">${esc(label)}</th><td class="actual">${esc(pickLabel(ctx, match, key, actual))}</td>${players.map((p) => cell(p, key, game)).join('')}</tr>`;

  let body = '';
  for (const b of SERIES_BETS) {
    if (b.minBo && bo < b.minBo) continue;
    body += row(b.label, b.key, sr?.[b.key] ?? null);
  }
  for (let n = 1; n <= bo; n++) {
    const game = games[n - 1];
    const anyPick = players.some((p) => Object.values(picks.get(p.id)?.games?.[n] || {}).some((v) => v != null));
    if (!game && !anyPick) continue;
    if (sr && n > sr.totalGames && !game) {
      body += `<tr class="game-head"><th colspan="${players.length + 2}">Game ${n} <span class="muted">(not played, picks void)</span></th></tr>`;
      continue;
    }
    body += `<tr class="game-head"><th colspan="${players.length + 2}">Game ${n}${game?.winner ? ` · won by ${esc(code(ctx, match, game.winner))}` : ''}</th></tr>`;
    for (const p of GAME_PROPS) {
      // Skip bets nobody made that don't have a result yet.
      const actual = gameActual(game, p.key, s);
      const picked = players.some((pl) => picks.get(pl.id)?.games?.[n]?.[p.key] != null);
      if (picked || actual != null) body += row(p.label, p.key, actual, n);
    }
  }
  const totals = players.map((p) => {
    const r = scored.get(p.id);
    return `<td><strong>${r.points}</strong> <span class="muted small">${r.correct}/${r.settled}</span></td>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table class="compare">
        <thead><tr><th></th><th>Result</th>${players.map((p) => `<th>${playerDot(p)}${esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th scope="row">Points</th><td></td>${totals}</tr></tfoot>
      </table>
    </div>`;
}

function card(ctx, match) {
  const status = matchStatus(match);
  const open = status === 'open';
  // Expand what needs attention: live matches and ones starting within 48 hours.
  const defaultExpanded = status === 'live' || (open && match.startMs - Date.now() < 48 * 3600000);
  const expanded = ui.toggled.has(match.id) ? !defaultExpanded : defaultExpanded;
  const mine = ctx.state.picks.find((x) => x.matchId === match.id && x.playerId === ctx.me.id);
  const my = scoreMatchPick(match, mine, ctx.settings);
  const sr = seriesResult(match);
  const showScore = status === 'live' || status === 'final';
  const r = match.result || {};
  const stage = [STAGES[match.stage] || '', match.bracketSlot ? SLOT_LABELS[match.bracketSlot] : match.label || '']
    .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ');
  const needsPick = open && !mine?.winner;

  return `
    <article class="match-card status-${status} ${needsPick ? 'needs-pick' : ''}" id="match-${esc(match.id)}">
      <header class="mc-head" data-action="toggle" data-mid="${esc(match.id)}">
        <span class="mc-meta"><span class="mc-time">${fmtTime(match.startMs)}</span> · ${esc(stage)} · Bo${match.bestOf}</span>
        ${statusPill(match, status)}
      </header>
      <div class="mc-teams" data-action="toggle" data-mid="${esc(match.id)}">
        ${teamSide(ctx, match, 'A', sr?.winner)}
        <div class="mc-score">${showScore ? `<span>${r.scoreA ?? 0}</span><i>–</i><span>${r.scoreB ?? 0}</span>` : '<i>vs</i>'}</div>
        ${teamSide(ctx, match, 'B', sr?.winner)}
      </div>
      <footer class="mc-foot" data-action="toggle" data-mid="${esc(match.id)}">
        <span>${needsPick ? '<span class="warn">You haven\'t picked yet</span>' : mine ? `Your picks: ${my.items.length}` : '<span class="muted">No picks</span>'}
          ${my.settled ? ` · <strong class="gain">+${my.points} pts</strong> <span class="muted">(${my.correct}/${my.settled} correct)</span>` : ''}</span>
        <span class="chev">${expanded ? '▴' : '▾'}</span>
      </footer>
      ${expanded ? `<div class="mc-body">${open ? editor(ctx, match, mine) : compareTable(ctx, match)}</div>` : ''}
    </article>`;
}

function summary(ctx) {
  const rows = ctx.standings;
  const row = rows.find((r) => r.player.id === ctx.me.id);
  const todo = ctx.state.matches.filter((m) => isMatchOpen(m) && !ctx.state.picks.some((p) => p.matchId === m.id && p.playerId === ctx.me.id && p.winner)).length;
  const pct = row?.settled ? Math.round((row.correct / row.settled) * 100) : null;
  return `
    <section class="summary">
      <div class="stat"><span class="stat-num">#${row?.rank ?? '–'}</span><span class="stat-label">of ${rows.length}</span></div>
      <div class="stat"><span class="stat-num">${row?.total ?? 0}</span><span class="stat-label">points</span></div>
      <div class="stat"><span class="stat-num">${pct == null ? '–' : pct + '%'}</span><span class="stat-label">correct</span></div>
      <button class="stat stat-btn ${todo ? 'hot' : ''}" data-action="filter" data-value="todo"><span class="stat-num">${todo}</span><span class="stat-label">need picks</span></button>
    </section>`;
}

export function html(ctx) {
  const all = ctx.state.matches;
  const me = ctx.me.id;
  let list;
  if (ui.filter === 'todo') list = all.filter((m) => isMatchOpen(m) && !ctx.state.picks.some((p) => p.matchId === m.id && p.playerId === me && p.winner));
  else if (ui.filter === 'results') list = all.filter((m) => matchStatus(m) === 'final').reverse();
  else if (ui.filter === 'all') list = all;
  else list = all.filter((m) => matchStatus(m) !== 'final');

  let body = '';
  let lastDay = null;
  for (const m of list) {
    const d = dayKey(m.startMs);
    if (d !== lastDay) {
      body += `<h3 class="day-head">${fmtDay(m.startMs)}</h3>`;
      lastDay = d;
    }
    body += card(ctx, m);
  }
  const empty = {
    todo: 'You\'re all caught up. Nothing left to pick right now. 🎉',
    upcoming: 'No upcoming matches yet.',
    results: 'No finished matches yet.',
    all: 'No matches yet.',
  }[ui.filter];
  const adminHint = all.length === 0
    ? (ctx.isAdmin
      ? `<p><a class="btn btn-primary" href="#/admin">Add matches in Admin</a> (you can sync the whole Worlds schedule from LoL Esports once Riot publishes it).</p>`
      : '<p class="muted">Your league admin still needs to add the matches.</p>')
    : '';

  return `
    ${summary(ctx)}
    <div class="filters" role="tablist">
      ${FILTERS.map(([k, label]) => `<button class="chip ${ui.filter === k ? 'chip-active' : ''}" data-action="filter" data-value="${k}">${label}</button>`).join('')}
    </div>
    ${list.length ? body : `<div class="empty"><p>${empty}</p>${adminHint}</div>`}`;
}

// ---------- actions ----------

function myPick(ctx, matchId) {
  return ctx.state.picks.find((p) => p.matchId === matchId && p.playerId === ctx.me.id);
}

export const actions = {
  filter(el, ctx) {
    ui.filter = el.dataset.value;
    ctx.render();
  },
  toggle(el, ctx) {
    const id = el.dataset.mid;
    if (ui.toggled.has(id)) ui.toggled.delete(id); else ui.toggled.add(id);
    ctx.render();
  },
  gameTab(el, ctx) {
    ui.gameTab.set(el.dataset.mid, Number(el.dataset.game));
    ctx.render();
  },
  async pick(el, ctx) {
    const { mid, key, game } = el.dataset;
    const match = ctx.state.matches.find((m) => m.id === mid);
    if (!match || !isMatchOpen(match)) {
      toast('Betting is closed for this match.', 'error');
      ctx.render();
      return;
    }
    const existing = myPick(ctx, mid);
    let value = el.dataset.num ? Number(el.dataset.value) : el.dataset.value;
    const current = game ? existing?.games?.[game]?.[key] : existing?.[key];
    if (current != null && String(current) === String(value)) value = null; // tap again to clear

    const patch = { matchId: mid, playerId: ctx.me.id, updatedAt: Date.now() };
    if (game) patch.games = { [game]: { [key]: value } };
    else patch[key] = value;
    // Picking an exact score also fills in the winner and number of games (if not picked yet).
    if (key === 'score' && value) {
      const [a, b] = value.split('-').map(Number);
      if (!existing?.winner) patch.winner = a > b ? 'A' : 'B';
      if (!existing?.totalGames) patch.totalGames = a + b;
    }
    await ctx.save(ctx.paths.pick(mid, ctx.me.id), patch);
  },
  async copyG1(el, ctx) {
    const match = ctx.state.matches.find((m) => m.id === el.dataset.mid);
    const g1 = myPick(ctx, match.id)?.games?.[1];
    if (!g1 || !Object.values(g1).some((v) => v != null)) {
      toast('Make your Game 1 picks first.', 'error');
      return;
    }
    const games = {};
    for (let n = 2; n <= match.bestOf; n++) games[n] = { ...g1 };
    const ok = await ctx.save(ctx.paths.pick(match.id, ctx.me.id), { matchId: match.id, playerId: ctx.me.id, games, updatedAt: Date.now() });
    if (ok) toast('Copied to all games', 'success');
  },
};
