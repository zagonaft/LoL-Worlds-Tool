// Bracket tree: the knockout stage drawn as a classic elimination bracket.
// Shows the real results, or any player's predicted bracket on the same tree.
import { esc, teamLogo, playerDot } from '../ui.js';
import { scoreBracket, tournamentActual, FEEDERS, matchStatus, slotPointsKey } from '../scoring.js';

const ROUNDS = [
  { title: 'Quarterfinals', slots: ['QF1', 'QF2', 'QF3', 'QF4'] },
  { title: 'Semifinals', slots: ['SF1', 'SF2'] },
  { title: 'Final', slots: ['F'] },
];
const ICON = { won: '✓', lost: '✗' };
const SHORT = { QF1: 'QF 1', QF2: 'QF 2', QF3: 'QF 3', QF4: 'QF 4', SF1: 'SF 1', SF2: 'SF 2', F: 'Final' };

const shortDate = (ms) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const ui = { show: 'results' }; // 'results' or a player id

const isLocked = (ctx) => ctx.settings.knockoutLockMs != null && Date.now() >= ctx.settings.knockoutLockMs;

// Other players' picks stay hidden until the bracket locks.
const canSee = (ctx, playerId) => playerId === ctx.me.id || isLocked(ctx);

// Which two teams a player expects in a slot, following their own picks.
function predictedTeams(bs, picks, slot) {
  if (!FEEDERS[slot]) return bs[slot].teams;
  const [f1, f2] = FEEDERS[slot];
  return [picks[f1] || null, picks[f2] || null];
}

// Series score for each of the slot's two teams, if the match has started.
function slotScores(ctx, bs, slot) {
  const m = ctx.state.matches.find((x) => x.id === bs[slot].matchId);
  const r = m?.result;
  if (!m || !r || !['live', 'final'].includes(r.status)) return { m, scores: null };
  const byCode = { [m.teamA]: r.scoreA, [m.teamB]: r.scoreB };
  return { m, scores: bs[slot].teams.map((code) => (code ? byCode[code] ?? null : null)) };
}

function teamRow(ctx, code, { cls = '', right = '', hint = 'TBD' } = {}) {
  if (!code) return `<div class="tt-team tt-empty"><span class="logo logo-sm logo-tbd">?</span><span class="tt-code">${esc(hint)}</span></div>`;
  const team = ctx.team(code);
  return `<div class="tt-team ${cls}">${teamLogo(team, 'sm')}<span class="tt-code">${esc(team.code)}</span><span class="tt-right">${right}</span></div>`;
}

function resultsBox(ctx, bs, slot) {
  const { m, scores } = slotScores(ctx, bs, slot);
  const { winner } = bs[slot];
  const status = m ? matchStatus(m) : null;
  const rows = bs[slot].teams.map((code, i) => {
    const cls = winner ? (code === winner ? 'won' : 'out') : '';
    const right = scores?.[i] != null ? `<b>${scores[i]}</b>` : '';
    const hint = FEEDERS[slot] ? `${FEEDERS[slot][i]} winner` : 'TBD';
    return teamRow(ctx, code, { cls, right, hint });
  }).join('');
  const meta = status === 'live' ? '<span class="tt-live">LIVE</span>'
    : m?.startMs && status !== 'final' ? `<span>${esc(shortDate(m.startMs))}</span>` : '';
  return { html: rows, meta, done: Boolean(winner) };
}

function picksBox(ctx, bs, picks, scored, slot) {
  const pick = picks[slot];
  const it = scored.items.find((i) => i.slot === slot);
  const rows = predictedTeams(bs, picks, slot).map((code, i) => {
    const sel = code && code === pick;
    const cls = sel ? `picked ${it?.status === 'won' ? 'won' : it?.status === 'lost' ? 'lost' : ''}` : code && pick ? 'out' : '';
    const right = sel ? (ICON[it?.status] || '•') : '';
    const hint = FEEDERS[slot] ? `No ${FEEDERS[slot][i]} pick` : 'TBD';
    return teamRow(ctx, code, { cls, right, hint });
  }).join('');
  const meta = it?.status === 'won' ? `<span class="c-won">+${it.points}</span>` : '';
  return { html: rows, meta, done: Boolean(pick), status: it?.status };
}

function tree(ctx, bs, mode) {
  const viewing = mode === 'results' ? null : ctx.state.players.find((p) => p.id === mode);
  const picks = viewing ? ctx.state.brackets.find((b) => b.id === viewing.id)?.picks || {} : null;
  const scored = viewing ? scoreBracket({ picks }, bs, ctx.settings.points) : null;

  const cols = ROUNDS.map(({ title, slots }, r) => {
    const span = 8 / slots.length;
    const cells = slots.map((slot, i) => {
      const box = viewing ? picksBox(ctx, bs, picks, scored, slot) : resultsBox(ctx, bs, slot);
      // Line colour: gold once a winner is known (or picked), green/red for a decided pick.
      const line = box.status === 'won' ? 'ln-won' : box.status === 'lost' ? 'ln-lost' : box.done ? 'ln-on' : '';
      const pos = slot === 'F' ? 'to-champ' : i % 2 ? 'bottom' : 'top';
      return `<div class="tt-cell ${pos} ${line} ${r ? 'fed' : ''}" style="grid-row: ${i * span + 1} / span ${span}">
        <div class="tt-match">
          <div class="tt-head"><span>${SHORT[slot]}</span>${box.meta}</div>
          ${box.html}
        </div>
      </div>`;
    }).join('');
    return `<div class="tt-col"><h4>${title}</h4><div class="tt-grid">${cells}</div></div>`;
  }).join('');

  const champCode = viewing ? picks.F : bs.F.winner;
  const champ = champCode ? ctx.team(champCode) : null;
  const fStatus = viewing ? scored.items.find((i) => i.slot === 'F')?.status : null;
  const champLabel = viewing ? `${esc(viewing.name)}'s champion${fStatus === 'won' ? ' ✓' : fStatus === 'lost' ? ' ✗' : ''}` : 'World champion';
  const champCol = `
    <div class="tt-col tt-champ-col"><h4>Champion</h4>
      <div class="tt-grid"><div class="tt-cell fed ${champ ? 'ln-on' : ''}" style="grid-row: 1 / span 8">
        <div class="tt-champ ${champ ? '' : 'empty'} ${fStatus ? `c-${fStatus}` : ''}">
          <span class="tt-trophy">🏆</span>
          ${champ ? `${teamLogo(champ, 'lg')}<strong>${esc(champ.code)}</strong>` : '<strong class="muted">?</strong>'}
          <span class="muted small">${champLabel}</span>
        </div>
      </div></div>
    </div>`;

  const summary = viewing
    ? `<p class="muted small tt-summary">${playerDot(viewing)}<span><strong>${esc(viewing.name)}</strong>: ${scored.points} pts from the bracket so far${Object.keys(picks).length ? '' : ' · no picks made'}</span></p>`
    : '';
  return `${summary}<p class="muted small tt-swipe">Swipe sideways to see the final →</p><div class="tt-wrap"><div class="tt">${cols}${champCol}</div></div>`;
}

export function html(ctx) {
  const bs = tournamentActual(ctx.league, ctx.state.matches).bstate;
  if (ui.show !== 'results' && !canSee(ctx, ui.show)) ui.show = 'results';
  const hasQF = ROUNDS[0].slots.some((s) => bs[s].teams.some(Boolean));
  const chips = [['results', 'Results', true], ...ctx.state.players.map((p) => [p.id, p.id === ctx.me.id ? `${p.name} (you)` : p.name, canSee(ctx, p.id)])]
    .map(([k, label, ok]) => `<button class="chip ${ui.show === k ? 'chip-active' : ''}" data-action="treeShow" data-value="${esc(k)}" ${ok ? '' : 'disabled title="Visible once the bracket locks"'}>${esc(label)}</button>`)
    .join('');
  const P = ctx.settings.points;
  return `
    <section class="card">
      <div class="card-head">
        <div><h2>Bracket tree</h2><p class="muted small">Quarterfinals to the final. Switch to a player to see their predicted bracket (${P[slotPointsKey('QF1')]} / ${P[slotPointsKey('SF1')]} / ${P[slotPointsKey('F')]} pts per correct QF / SF / Final pick).</p></div>
      </div>
      <div class="filters">${chips}</div>
      ${hasQF ? tree(ctx, bs, ui.show) : '<div class="empty"><p>The tree fills in once the quarterfinal matchups are known.</p></div>'}
      ${!isLocked(ctx) ? '<p class="muted small">Other players\' brackets show up here once the knockout picks lock. Make your picks in the Bracket tab.</p>' : ''}
    </section>`;
}

export const actions = {
  treeShow(el, ctx) {
    ui.show = el.dataset.value;
    ctx.render();
  },
};
