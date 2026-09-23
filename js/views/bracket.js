// Bracket: tournament-wide predictions (champion + Swiss pick'em) and the knockout bracket.
import { BRACKET_SLOTS, SLOT_LABELS, REGIONS } from '../defaults.js';
import { esc, fmtDateTime, relTime, teamLogo, playerDot } from '../ui.js';
import { scorePredictions, scoreBracket, tournamentActual, FEEDERS, slotPointsKey } from '../scoring.js';

const PRED_FIELDS = [
  { field: 'champion', label: 'World champion', count: 1, pointsKey: 'champion' },
  { field: 'swiss30', label: 'Go 3-0 in Swiss', count: 2, pointsKey: 'swiss30' },
  { field: 'swiss03', label: 'Go 0-3 in Swiss', count: 2, pointsKey: 'swiss03' },
  { field: 'swissAdvance', label: 'Also make it out of Swiss (3-1 / 3-2)', count: 6, pointsKey: 'swissAdvance' },
];
const SWISS_FIELDS = ['swiss30', 'swiss03', 'swissAdvance'];
const ICON = { won: '✓', lost: '✗', void: '∅', pending: '' };

const isOpen = (ms) => ms == null || Date.now() < ms;

function lockPill(ms) {
  return isOpen(ms)
    ? `<span class="pill pill-open">Open · locks ${relTime(ms)}</span>`
    : `<span class="pill pill-locked">Locked ${fmtDateTime(ms)}</span>`;
}

function asArray(v, n) {
  const a = Array.isArray(v) ? [...v] : v ? [v] : [];
  while (a.length < n) a.push(null);
  return a.slice(0, n);
}

function teamSelect(ctx, { field, index, value, taken }) {
  const groups = REGIONS.map((region) => {
    const teams = ctx.teams.filter((t) => (t.region || 'Other') === region);
    if (!teams.length) return '';
    return `<optgroup label="${esc(region)}">${teams.map((t) => `
      <option value="${esc(t.code)}" ${t.code === value ? 'selected' : ''} ${taken.has(t.code) && t.code !== value ? 'disabled' : ''}>${esc(t.code)} · ${esc(t.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  return `<select id="pred-${field}-${index}" data-change="predict" data-field="${field}" data-index="${index}">
    <option value="">Pick a team</option>${groups}</select>`;
}

function predictionsSection(ctx, actual) {
  const lockMs = ctx.settings.predictionsLockMs;
  const P = ctx.settings.points;
  const head = `
    <div class="card-head">
      <div><h2>Tournament predictions</h2><p class="muted small">Make these before the Swiss stage starts.</p></div>
      ${lockPill(lockMs)}
    </div>`;

  if (isOpen(lockMs)) {
    const mine = ctx.state.predictions.find((p) => p.id === ctx.me.id) || {};
    const taken = new Set(SWISS_FIELDS.flatMap((f) => asArray(mine[f], 6)).filter(Boolean));
    const rows = PRED_FIELDS.map(({ field, label, count, pointsKey }) => {
      const values = asArray(mine[field], count);
      const selects = values.map((v, i) => teamSelect(ctx, { field, index: i, value: v, taken: field === 'champion' ? new Set() : taken })).join('');
      return `<div class="pred-row">
        <div class="bet-label">${esc(label)} <span class="pts">${P[pointsKey]} pts${count > 1 ? ' each' : ''}</span></div>
        <div class="pred-selects pred-${count}">${selects}</div>
      </div>`;
    }).join('');
    return `<section class="card">${head}${rows}</section>`;
  }

  // Locked: show everyone's predictions.
  const players = ctx.state.players;
  const scored = new Map(players.map((p) => [p.id, scorePredictions(ctx.state.predictions.find((x) => x.id === p.id), actual, P)]));
  const actualText = {
    champion: actual.champion || '—',
    swiss30: (actual.swiss30 || []).join(', ') || '—',
    swiss03: (actual.swiss03 || []).join(', ') || '—',
    swissAdvance: [...(actual.swiss30 || []), ...(actual.swissAdvance || [])].join(', ') || '—',
  };
  const body = PRED_FIELDS.map(({ field, label, count }) => {
    const cells = players.map((p) => {
      const picks = asArray(ctx.state.predictions.find((x) => x.id === p.id)?.[field], count).filter(Boolean);
      if (!picks.length) return '<td class="muted">—</td>';
      return `<td>${picks.map((code) => {
        const it = scored.get(p.id).items.find((i) => i.key === field && i.pick === code);
        return `<span class="tag c-${it?.status || ''}">${esc(code)} ${ICON[it?.status] || ''}</span>`;
      }).join(' ')}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(label)}</th><td class="actual">${esc(actualText[field])}</td>${cells}</tr>`;
  }).join('');
  const totals = players.map((p) => `<td><strong>${scored.get(p.id).points}</strong></td>`).join('');
  return `
    <section class="card">${head}
      <div class="table-wrap"><table class="compare">
        <thead><tr><th></th><th>Actual</th>${players.map((p) => `<th>${playerDot(p)}${esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>${body}</tbody>
        <tfoot><tr><th scope="row">Points</th><td></td>${totals}</tr></tfoot>
      </table></div>
    </section>`;
}

// Which two teams a player expects in each slot, following their own picks.
function predictedTeams(bs, picks, slot) {
  if (!FEEDERS[slot]) return bs[slot].teams;
  const [f1, f2] = FEEDERS[slot];
  return [picks[f1] || null, picks[f2] || null];
}

function slotBox(ctx, bs, picks, slot, open) {
  const teams = predictedTeams(bs, picks, slot);
  const actualWinner = bs[slot].winner;
  const eliminated = new Set(Object.values(bs).map((s) => s.loser).filter(Boolean));
  const rows = teams.map((code, i) => {
    if (!code) {
      const hint = FEEDERS[slot] ? `Pick ${FEEDERS[slot][i]} winner` : 'TBD';
      return `<div class="slot-team empty">${hint}</div>`;
    }
    const team = ctx.team(code);
    const sel = picks[slot] === code;
    let st = '';
    if (sel && actualWinner) st = actualWinner === code ? 'c-won' : 'c-lost';
    else if (sel && eliminated.has(code)) st = 'c-lost';
    const tag = open ? 'button' : 'div';
    return `<${tag} class="slot-team ${sel ? 'sel' : ''} ${st} ${actualWinner === code ? 'real-winner' : ''}"
        ${open ? `data-action="bracketPick" data-slot="${slot}" data-code="${esc(code)}"` : ''}>
        ${teamLogo(team, 'sm')}<span>${esc(team.code)}</span>${sel ? '<span class="pick-mark">your pick</span>' : ''}
      </${tag}>`;
  }).join('');
  return `<div class="slot"><div class="slot-label">${SLOT_LABELS[slot]} <span class="pts">${ctx.settings.points[slotPointsKey(slot)]} pts</span></div>${rows}</div>`;
}

function bracketSection(ctx, actual) {
  const bs = actual.bstate;
  const lockMs = ctx.settings.knockoutLockMs;
  const open = isOpen(lockMs);
  const picks = ctx.state.brackets.find((b) => b.id === ctx.me.id)?.picks || {};
  const hasQF = ['QF1', 'QF2', 'QF3', 'QF4'].some((s) => bs[s].teams.some(Boolean));
  const head = `
    <div class="card-head">
      <div><h2>Knockout bracket</h2><p class="muted small">Pick every winner from the quarterfinals to the final.</p></div>
      ${lockPill(lockMs)}
    </div>`;
  if (!hasQF) {
    return `<section class="card">${head}
      <div class="empty"><p>The bracket opens once the quarterfinal matchups are known.</p>
      <p class="muted small">An admin adds the knockout matches (or syncs them from LoL Esports) and tags them QF1–QF4, SF1, SF2 and F.</p></div>
    </section>`;
  }
  const champ = picks.F ? ctx.team(picks.F) : null;
  const tree = `
    <div class="bracket">
      <div class="round"><h4>Quarterfinals</h4>${['QF1', 'QF2', 'QF3', 'QF4'].map((s) => slotBox(ctx, bs, picks, s, open)).join('')}</div>
      <div class="round"><h4>Semifinals</h4>${['SF1', 'SF2'].map((s) => slotBox(ctx, bs, picks, s, open)).join('')}</div>
      <div class="round"><h4>Final</h4>${slotBox(ctx, bs, picks, 'F', open)}
        <div class="champion ${champ ? '' : 'empty'}">${champ ? `${teamLogo(champ, 'lg')}<strong>${esc(champ.code)}</strong><span class="muted small">your champion</span>` : '<span class="muted">Your champion appears here</span>'}</div>
      </div>
    </div>`;

  let everyone = '';
  if (!open) {
    const players = ctx.state.players;
    const scored = new Map(players.map((p) => [p.id, scoreBracket(ctx.state.brackets.find((b) => b.id === p.id), bs, ctx.settings.points)]));
    everyone = `
      <h3 class="section-label">Everyone's bracket</h3>
      <div class="table-wrap"><table class="compare">
        <thead><tr><th></th><th>Winner</th>${players.map((p) => `<th>${playerDot(p)}${esc(p.name)}</th>`).join('')}</tr></thead>
        <tbody>${BRACKET_SLOTS.map((slot) => `
          <tr><th scope="row">${SLOT_LABELS[slot]}</th><td class="actual">${esc(bs[slot].winner || '—')}</td>
          ${players.map((p) => {
            const it = scored.get(p.id).items.find((i) => i.slot === slot);
            return it ? `<td class="c-${it.status}">${esc(it.pick)} <span class="st">${ICON[it.status]}</span></td>` : '<td class="muted">—</td>';
          }).join('')}</tr>`).join('')}
        </tbody>
        <tfoot><tr><th scope="row">Points</th><td></td>${players.map((p) => `<td><strong>${scored.get(p.id).points}</strong></td>`).join('')}</tr></tfoot>
      </table></div>`;
  }
  return `<section class="card">${head}${tree}${everyone}</section>`;
}

export function html(ctx) {
  const actual = tournamentActual(ctx.league, ctx.state.matches);
  return `${predictionsSection(ctx, actual)}${bracketSection(ctx, actual)}`;
}

export const changes = {
  async predict(el, ctx) {
    if (!isOpen(ctx.settings.predictionsLockMs)) return;
    const { field } = el.dataset;
    const def = PRED_FIELDS.find((f) => f.field === field);
    const mine = ctx.state.predictions.find((p) => p.id === ctx.me.id) || {};
    const value = el.value || null;
    const data = { playerId: ctx.me.id, updatedAt: Date.now() };
    if (def.count === 1) {
      data[field] = value;
    } else {
      const arr = asArray(mine[field], def.count);
      arr[Number(el.dataset.index)] = value;
      data[field] = arr;
    }
    await ctx.save(ctx.paths.prediction(ctx.me.id), data);
  },
};

export const actions = {
  async bracketPick(el, ctx) {
    if (!isOpen(ctx.settings.knockoutLockMs)) return;
    const { slot, code } = el.dataset;
    const bs = tournamentActual(ctx.league, ctx.state.matches).bstate;
    const picks = { ...(ctx.state.brackets.find((b) => b.id === ctx.me.id)?.picks || {}) };
    if (picks[slot] === code) delete picks[slot]; else picks[slot] = code;
    // Changing an early pick can invalidate later ones.
    for (const s of ['SF1', 'SF2', 'F']) {
      if (picks[s] && !predictedTeams(bs, picks, s).includes(picks[s])) delete picks[s];
    }
    await ctx.save(ctx.paths.bracket(ctx.me.id), { playerId: ctx.me.id, picks, updatedAt: Date.now() }, { merge: false });
  },
};
