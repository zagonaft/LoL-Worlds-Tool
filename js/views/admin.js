// Admin: matches & results, tournament results, teams, players, settings.
import { STAGES, BRACKET_SLOTS, SLOT_LABELS, REGIONS, POINT_LABELS, GAME_PROPS, DEFAULT_SETTINGS } from '../defaults.js';
import {
  esc, uid, sha256, fmtDateTime, relTime, toLocalInput, fromLocalInput, openModal, confirmDialog, toast, teamLogo, playerDot,
} from '../ui.js';
import { matchStatus, parseDuration, formatDuration, tournamentActual } from '../scoring.js';
import { autofillGame } from '../lolesports.js';

const ui = { tab: 'matches' };
const TABS = [
  ['matches', 'Matches & results'],
  ['tournament', 'Tournament results'],
  ['teams', 'Teams'],
  ['players', 'Players'],
  ['settings', 'Settings'],
];

const teamOptions = (ctx, selected) => [
  `<option value="TBD" ${selected === 'TBD' || !selected ? 'selected' : ''}>TBD</option>`,
  ...ctx.teams.map((t) => `<option value="${esc(t.code)}" ${t.code === selected ? 'selected' : ''}>${esc(t.code)} · ${esc(t.name)}</option>`),
].join('');

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function matchesTab(ctx) {
  const last = Number(localStorage.getItem(`lwt:${ctx.state.leagueId}:lastSync`) || 0);
  const rows = ctx.state.matches.map((m) => {
    const st = matchStatus(m);
    const r = m.result || {};
    const gamesEntered = (r.games || []).filter((g) => g && g.winner).length;
    return `
      <tr>
        <td>${fmtDateTime(m.startMs)}</td>
        <td>${esc(STAGES[m.stage] || '')}${m.bracketSlot ? ` · ${m.bracketSlot}` : ''}<div class="muted small">${esc(m.label || '')}</div></td>
        <td><strong>${esc(m.teamA || 'TBD')}</strong> vs <strong>${esc(m.teamB || 'TBD')}</strong> <span class="muted">Bo${m.bestOf}</span></td>
        <td><span class="pill pill-${st}">${st}</span>${st === 'live' || st === 'final' ? ` ${r.scoreA ?? 0}–${r.scoreB ?? 0}` : ''}
          ${m.bestOf > 0 && (st === 'final' || st === 'live') ? `<div class="muted small">${gamesEntered} game${gamesEntered === 1 ? '' : 's'} entered</div>` : ''}</td>
        <td class="row-actions">
          <button class="btn btn-sm btn-primary" data-action="editResult" data-mid="${esc(m.id)}">Result</button>
          <button class="btn btn-sm" data-action="editMatch" data-mid="${esc(m.id)}">Edit</button>
          <button class="btn btn-sm btn-ghost" data-action="deleteMatch" data-mid="${esc(m.id)}" aria-label="Delete">🗑</button>
        </td>
      </tr>`;
  }).join('');
  return `
    <div class="toolbar">
      <button class="btn btn-primary" data-action="editMatch">+ Add match</button>
      <button class="btn" data-action="syncNow" ${ctx.settings.liveApi ? '' : 'disabled'}>⟳ Sync &amp; auto-fill now</button>
      ${ctx.demo ? '<button class="btn btn-ghost" data-action="demoData">Add sample matches</button>' : ''}
    </div>
    <p class="muted small">
      ${ctx.settings.liveApi
        ? `Everything is automatic: matches, scores and each game's first blood, dragon, tower, baron, length and kills are imported from LoL Esports every few minutes (while anyone has the app open, and by the results robot on GitHub when nobody does). Use <strong>Result</strong> only to fix a mistake. Last sync on this device: ${last ? relTime(last) : 'never'}.`
        : 'LoL Esports live data is turned off in Settings, so enter results with the <strong>Result</strong> button.'}
    </p>
    ${rows ? `<div class="table-wrap"><table class="admin-table"><thead><tr><th>When</th><th>Stage</th><th>Match</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="empty"><p>No matches yet. Add one, or sync the schedule once Riot publishes it.</p></div>'}`;
}

function tournamentTab(ctx) {
  const a = ctx.league.actual || {};
  const actual = tournamentActual(ctx.league, ctx.state.matches);
  const chips = (field) => ctx.teams.map((t) => {
    const on = (actual[field] || []).includes(t.code);
    return `<button class="chip ${on ? 'chip-active' : ''}" data-action="toggleActual" data-field="${field}" data-code="${esc(t.code)}">${esc(t.code)}</button>`;
  }).join('');
  return `
    <section class="card">
      <div class="card-head"><h2>Swiss stage</h2></div>
      <p class="muted small">This fills itself in from the Swiss match results (3 wins = through, 3 losses = out), so you don't need to touch it. Only tap a team if something is wrong; your correction then takes priority over the automatic result for that row.${['swiss30', 'swiss03', 'swissAdvance'].some((f) => a[f]?.length) ? ' <button class="btn btn-sm btn-ghost" data-action="resetActual">Undo my corrections</button>' : ''}</p>
      <h4 class="section-label">Went 3-0</h4><div class="chip-grid">${chips('swiss30')}</div>
      <h4 class="section-label">Went 0-3</h4><div class="chip-grid">${chips('swiss03')}</div>
      <h4 class="section-label">Advanced with 3-1 or 3-2</h4><div class="chip-grid">${chips('swissAdvance')}</div>
      <label class="check"><input type="checkbox" data-change="swissDone" ${actual.swissDone ? 'checked' : ''} ${actual.swissDone && !a.swissDone ? 'disabled' : ''}> Swiss stage is finished (all other teams are out)${actual.swissDone && !a.swissDone ? ' <span class="muted small">(detected automatically)</span>' : ''}</label>
    </section>
    <section class="card">
      <div class="card-head"><h2>Champion</h2></div>
      <p class="muted small">Filled in automatically from the Final's result${actual.champion ? ` (currently <strong>${esc(actual.champion)}</strong>)` : ''}. Override only if needed.</p>
      <select id="champion-override" data-change="championOverride">
        <option value="">Automatic (from the Final)</option>
        ${ctx.teams.map((t) => `<option value="${esc(t.code)}" ${a.champion === t.code ? 'selected' : ''}>${esc(t.code)} · ${esc(t.name)}</option>`).join('')}
      </select>
    </section>`;
}

function teamsTab(ctx) {
  return `
    <div class="toolbar"><button class="btn btn-primary" data-action="editTeams">Edit teams</button></div>
    <div class="team-list">
      ${REGIONS.map((region) => {
        const teams = ctx.teams.filter((t) => (t.region || 'Other') === region);
        if (!teams.length) return '';
        return `<div class="team-group"><h4 class="section-label">${esc(region)}</h4>
          ${teams.map((t) => `<div class="team-row">${teamLogo(t, 'sm')}<strong>${esc(t.code)}</strong><span>${esc(t.name)}</span></div>`).join('')}</div>`;
      }).join('')}
    </div>`;
}

function playersTab(ctx) {
  const admins = ctx.league.admins || [];
  return `
    <div class="table-wrap"><table class="admin-table">
      <thead><tr><th>Player</th><th>Role</th><th></th></tr></thead>
      <tbody>${ctx.state.players.map((p) => `
        <tr>
          <td>${playerDot(p)} ${esc(p.name)} ${p.id === ctx.me.id ? '<span class="muted small">(you)</span>' : ''}</td>
          <td>${admins.includes(p.id) ? '<span class="pill pill-open">Admin</span>' : 'Player'}</td>
          <td class="row-actions">
            <button class="btn btn-sm" data-action="toggleAdmin" data-pid="${esc(p.id)}">${admins.includes(p.id) ? 'Remove admin' : 'Make admin'}</button>
            <button class="btn btn-sm" data-action="resetPin" data-pid="${esc(p.id)}">Reset PIN</button>
            <button class="btn btn-sm btn-ghost" data-action="removePlayer" data-pid="${esc(p.id)}" aria-label="Remove">🗑</button>
          </td>
        </tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">Admins can add matches, enter results and change settings.</p>`;
}

function settingsTab(ctx) {
  const s = ctx.settings;
  return `
    <div class="toolbar">
      <button class="btn btn-primary" data-action="editSettings">Edit settings</button>
      <button class="btn" data-action="backup">Download backup (JSON)</button>
    </div>
    <dl class="settings-list">
      <dt>League name</dt><dd>${esc(ctx.league.name)}</dd>
      <dt>Tournament predictions lock</dt><dd>${fmtDateTime(s.predictionsLockMs)}</dd>
      <dt>Knockout bracket locks</dt><dd>${fmtDateTime(s.knockoutLockMs)}</dd>
      <dt>Total kills line</dt><dd>${s.killsLine}</dd>
      <dt>Game length buckets</dt><dd>${s.lengthBuckets.join(' / ')} minutes</dd>
      <dt>LoL Esports live data</dt><dd>${s.liveApi ? 'On' : 'Off'}</dd>
    </dl>
    <section class="card">
      <div class="card-head"><h2>Results robot</h2></div>
      <p class="muted small">A small robot on GitHub imports scores and fills in every game's results every 10 minutes during Worlds, even when nobody has the app open. It needs this league ID, saved once as a GitHub secret called <code>LEAGUE_ID</code> (repo → Settings → Secrets and variables → Actions → New repository secret).</p>
      <div class="copy-row"><input id="league-id" readonly value="${esc(ctx.state.leagueId)}"><button class="btn btn-primary" data-action="copyLeagueId">Copy</button></div>
    </section>`;
}

export function html(ctx) {
  const body = { matches: matchesTab, tournament: tournamentTab, teams: teamsTab, players: playersTab, settings: settingsTab }[ui.tab](ctx);
  return `
    <div class="subtabs">${TABS.map(([k, label]) => `<button class="chip ${ui.tab === k ? 'chip-active' : ''}" data-action="adminTab" data-tab="${k}">${label}</button>`).join('')}</div>
    ${body}`;
}

// ---------------------------------------------------------------------------
// Match editor
// ---------------------------------------------------------------------------

function matchEditor(ctx, match) {
  const m = match || { stage: 'swiss', bestOf: 1, startMs: Date.now() + 86400000 };
  openModal({
    title: match ? 'Edit match' : 'Add match',
    body: `
      <form class="stack" data-form>
        <div class="grid-2">
          <label class="field"><span>Team A</span><select name="teamA">${teamOptions(ctx, m.teamA)}</select></label>
          <label class="field"><span>Team B</span><select name="teamB">${teamOptions(ctx, m.teamB)}</select></label>
        </div>
        <div class="grid-3">
          <label class="field"><span>Stage</span><select name="stage">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}" ${m.stage === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label class="field"><span>Best of</span><select name="bestOf">${[1, 3, 5].map((n) => `<option value="${n}" ${Number(m.bestOf) === n ? 'selected' : ''}>Bo${n}</option>`).join('')}</select></label>
          <label class="field"><span>Bracket slot</span><select name="bracketSlot"><option value="">None</option>${BRACKET_SLOTS.map((s) => `<option value="${s}" ${m.bracketSlot === s ? 'selected' : ''}>${SLOT_LABELS[s]}</option>`).join('')}</select></label>
        </div>
        <label class="field"><span>Label (optional)</span><input name="label" value="${esc(m.label || '')}" placeholder="e.g. Round 2 (1-0)"></label>
        <label class="field"><span>Start time (your local time). Betting locks at this time.</span><input type="datetime-local" name="start" required value="${toLocalInput(m.startMs)}"></label>
        <label class="check"><input type="checkbox" name="locked" ${m.locked ? 'checked' : ''}> Lock betting now (even before the start time)</label>
        <details><summary class="muted small">LoL Esports link (optional)</summary>
          <label class="field"><span>LoL Esports match ID, used by Auto-fill. Filled in automatically by Sync.</span><input name="esportsMatchId" value="${esc(m.esportsMatchId || '')}"></label>
        </details>
        <p class="error small" hidden data-err></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save match</button></div>
      </form>`,
    onMount(el, close) {
      el.querySelector('[data-form]').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const err = el.querySelector('[data-err]');
        const data = {
          teamA: fd.get('teamA'),
          teamB: fd.get('teamB'),
          stage: fd.get('stage'),
          bestOf: Number(fd.get('bestOf')),
          bracketSlot: fd.get('bracketSlot') || null,
          label: fd.get('label').toString().trim(),
          startMs: fromLocalInput(fd.get('start')),
          locked: fd.get('locked') === 'on',
          esportsMatchId: fd.get('esportsMatchId')?.toString().trim() || null,
          updatedAt: Date.now(),
        };
        if (data.teamA === data.teamB && data.teamA !== 'TBD') { err.textContent = 'Pick two different teams.'; err.hidden = false; return; }
        if (!data.startMs) { err.textContent = 'Set a start time.'; err.hidden = false; return; }
        if (data.bracketSlot) {
          const clash = ctx.state.matches.find((x) => x.bracketSlot === data.bracketSlot && x.id !== match?.id);
          if (clash) { err.textContent = `${SLOT_LABELS[data.bracketSlot]} is already used by ${clash.teamA} vs ${clash.teamB}.`; err.hidden = false; return; }
        }
        const id = match?.id || `m_${uid(10)}`;
        if (!match) data.createdAt = Date.now();
        if (await ctx.save(ctx.paths.match(id), data)) {
          close();
          toast('Match saved', 'success');
        }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Result editor
// ---------------------------------------------------------------------------

function seg(name, options, value) {
  return `<div class="seg">${options.map(([v, label]) => `
    <label><input type="radio" name="${name}" value="${esc(v)}" ${String(value ?? '') === String(v) ? 'checked' : ''}><span>${esc(label)}</span></label>`).join('')}</div>`;
}

function resultEditor(ctx, match) {
  const A = match.teamA || 'A';
  const B = match.teamB || 'B';
  const r = match.result || {};
  const games = r.games || [];
  const sides = [['A', A], ['B', B], ['', '—']];
  const gameBlock = (n) => {
    const g = games[n - 1] || {};
    return `
      <div class="game-edit" data-game="${n}">
        <div class="game-edit-head"><strong>Game ${n}${g.auto ? ' <span class="pill pill-open" title="Filled in automatically from LoL Esports">auto</span>' : ''}</strong>
          ${match.esportsMatchId && ctx.settings.liveApi ? `<button type="button" class="btn btn-sm" data-autofill="${n}">⚡ Auto-fill</button>` : ''}
        </div>
        <div class="af-status muted small" data-af-status="${n}"></div>
        <div class="ge-row"><span>Winner</span>${seg(`g${n}-winner`, sides, g.winner)}</div>
        ${GAME_PROPS.filter((p) => p.type === 'side' || p.type === 'sideOrNone').map((p) => `
          <div class="ge-row"><span>${p.label}</span>${seg(`g${n}-${p.key}`, p.type === 'sideOrNone' ? [['A', A], ['B', B], ['none', 'None'], ['', '—']] : sides, g[p.key])}</div>`).join('')}
        <div class="ge-row"><span>Game length</span><input name="g${n}-duration" placeholder="mm:ss" value="${esc(formatDuration(g.durationSec))}" inputmode="numeric"></div>
        <div class="ge-row"><span>Total kills</span><input name="g${n}-kills" type="number" min="0" value="${esc(g.totalKills ?? '')}"></div>
      </div>`;
  };

  openModal({
    title: `Result · ${A} vs ${B}`,
    wide: true,
    body: `
      <form class="stack" data-form>
        <div class="result-top">
          <label class="field"><span>Status</span>${seg('status', [['scheduled', 'Not started'], ['live', 'Live'], ['final', 'Final']], r.status || 'scheduled')}</label>
          <label class="field"><span>Series score</span>
            <div class="score-inputs"><b>${esc(A)}</b><input name="scoreA" type="number" min="0" max="3" value="${r.scoreA ?? 0}"><i>–</i><input name="scoreB" type="number" min="0" max="3" value="${r.scoreB ?? 0}"><b>${esc(B)}</b></div>
          </label>
        </div>
        <label class="check"><input type="checkbox" name="manual" ${r.manual ? 'checked' : ''}> Keep my score/status (don't let the LoL Esports sync overwrite them)</label>
        <p class="muted small">Enter what happened in each game. Game winners update the series score automatically. Leave games that weren't played empty.</p>
        <div class="games-edit">${Array.from({ length: match.bestOf || 1 }, (_, i) => gameBlock(i + 1)).join('')}</div>
        <p class="error small" hidden data-err></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save result</button></div>
      </form>`,
    onMount(el, close) {
      const form = el.querySelector('[data-form]');
      const recount = () => {
        let a = 0;
        let b = 0;
        for (let n = 1; n <= match.bestOf; n++) {
          const w = form.querySelector(`input[name="g${n}-winner"]:checked`)?.value;
          if (w === 'A') a++;
          if (w === 'B') b++;
        }
        form.scoreA.value = a;
        form.scoreB.value = b;
        const need = Math.ceil(match.bestOf / 2);
        if (a >= need || b >= need) form.querySelector('input[name="status"][value="final"]').checked = true;
        else if (a + b > 0) form.querySelector('input[name="status"][value="live"]').checked = true;
      };
      form.addEventListener('change', (e) => { if (/^g\d+-winner$/.test(e.target.name)) recount(); });

      const setRadio = (name, value) => {
        const input = form.querySelector(`input[name="${name}"][value="${value ?? ''}"]`);
        if (input) input.checked = true;
      };
      el.querySelectorAll('[data-autofill]').forEach((btn) => {
        btn.onclick = async () => {
          const n = Number(btn.dataset.autofill);
          const status = el.querySelector(`[data-af-status="${n}"]`);
          btn.disabled = true;
          status.textContent = 'Reading the game timeline from LoL Esports…';
          try {
            const res = await autofillGame(match, n, { onProgress: (c) => { status.textContent = `Reading the game timeline from LoL Esports… (${c} requests)`; } });
            ['winner', 'firstBlood', 'firstDragon', 'firstTower', 'firstBaron'].forEach((k) => { if (res[k] != null) setRadio(`g${n}-${k}`, res[k]); });
            form[`g${n}-duration`].value = formatDuration(res.durationSec);
            form[`g${n}-kills`].value = res.totalKills;
            recount();
            const unsure = ['firstBlood', 'firstDragon', 'firstTower', 'firstBaron'].filter((k) => res[k] == null);
            status.innerHTML = `✓ Filled in. Please double-check before saving: the winner is a best guess and the length is approximate (pauses count).${unsure.length ? ` Couldn't tell: ${unsure.join(', ')}.` : ''}`;
            status.className = 'af-status small ok';
          } catch (err) {
            status.textContent = `Auto-fill failed: ${err.message} Enter this game by hand.`;
            status.className = 'af-status small error';
          } finally {
            btn.disabled = false;
          }
        };
      });

      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const err = el.querySelector('[data-err]');
        const out = [];
        for (let n = 1; n <= match.bestOf; n++) {
          const val = (k) => fd.get(`g${n}-${k}`) || null;
          const durText = fd.get(`g${n}-duration`)?.toString() || '';
          const durationSec = parseDuration(durText);
          if (durText && durationSec == null) { err.textContent = `Game ${n}: length must look like 31:45.`; err.hidden = false; return; }
          const killsText = fd.get(`g${n}-kills`)?.toString() || '';
          const g = {
            winner: val('winner'),
            firstBlood: val('firstBlood'),
            firstDragon: val('firstDragon'),
            firstTower: val('firstTower'),
            firstBaron: val('firstBaron'),
            durationSec,
            totalKills: killsText === '' ? null : Number(killsText),
          };
          if (games[n - 1]?.auto) g.auto = true; // don't let the robot redo a game you checked
          out.push(Object.values(g).some((v) => v != null) ? g : null);
        }
        while (out.length && out[out.length - 1] === null) out.pop();
        const status = fd.get('status');
        const scoreA = Number(fd.get('scoreA'));
        const scoreB = Number(fd.get('scoreB'));
        if (status === 'final' && scoreA === scoreB) { err.textContent = 'A finished series needs a winner: check the series score.'; err.hidden = false; return; }
        const result = {
          status,
          scoreA,
          scoreB,
          manual: fd.get('manual') === 'on',
          games: out.map((g) => g || {}),
          settledBy: ctx.me.id,
          updatedAt: Date.now(),
        };
        if (await ctx.save(ctx.paths.match(match.id), { result })) {
          close();
          toast('Result saved: points updated', 'success');
        }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Teams editor
// ---------------------------------------------------------------------------

function teamsEditor(ctx) {
  const row = (t = {}) => `
    <tr data-orig="${esc(t.code || '')}">
      <td><input name="code" value="${esc(t.code || '')}" maxlength="6" required></td>
      <td><input name="name" value="${esc(t.name || '')}" required></td>
      <td><select name="region">${REGIONS.map((r) => `<option ${((t.region || 'Other') === r) ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
      <td><input name="image" value="${esc(t.image || '')}" placeholder="logo URL (optional)"></td>
      <td><button type="button" class="btn btn-sm btn-ghost" data-del aria-label="Remove">✕</button></td>
    </tr>`;
  openModal({
    title: 'Edit teams',
    wide: true,
    body: `
      <form class="stack" data-form>
        <p class="muted small">Changing a team's code updates it everywhere (matches, predictions, brackets). Codes should match LoL Esports (e.g. HLE, GEN, T1) so the schedule sync recognizes them.</p>
        <div class="table-wrap"><table class="edit-table">
          <thead><tr><th>Code</th><th>Name</th><th>Region</th><th>Logo</th><th></th></tr></thead>
          <tbody data-rows>${ctx.teams.map(row).join('')}</tbody>
        </table></div>
        <button type="button" class="btn btn-sm" data-add>+ Add team</button>
        <p class="error small" hidden data-err></p>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Save teams</button></div>
      </form>`,
    onMount(el, close) {
      const tbody = el.querySelector('[data-rows]');
      el.querySelector('[data-add]').onclick = () => tbody.insertAdjacentHTML('beforeend', row());
      tbody.addEventListener('click', (e) => { if (e.target.matches('[data-del]')) e.target.closest('tr').remove(); });
      el.querySelector('[data-form]').onsubmit = async (e) => {
        e.preventDefault();
        const err = el.querySelector('[data-err]');
        const rows = [...tbody.querySelectorAll('tr')].map((tr) => ({
          orig: tr.dataset.orig,
          code: tr.querySelector('[name=code]').value.trim().toUpperCase(),
          name: tr.querySelector('[name=name]').value.trim(),
          region: tr.querySelector('[name=region]').value,
          image: tr.querySelector('[name=image]').value.trim() || null,
        })).filter((t) => t.code);
        const codes = rows.map((t) => t.code);
        const dupe = codes.find((c, i) => codes.indexOf(c) !== i);
        if (dupe) { err.textContent = `Code ${dupe} is used twice.`; err.hidden = false; return; }
        if (codes.includes('TBD')) { err.textContent = '"TBD" is reserved.'; err.hidden = false; return; }
        const teams = rows.map(({ orig, ...t }) => t);
        if (!(await ctx.save(ctx.paths.league(), { teams }))) return;
        const renames = rows.filter((t) => t.orig && t.orig !== t.code).map((t) => [t.orig, t.code]);
        if (renames.length) await cascadeRenames(ctx, new Map(renames));
        close();
        toast('Teams saved', 'success');
      };
    },
  });
}

async function cascadeRenames(ctx, map) {
  const rn = (c) => (c && map.has(c) ? map.get(c) : c);
  const rnArr = (a) => (Array.isArray(a) ? a.map(rn) : a);
  for (const m of ctx.state.matches) {
    if (map.has(m.teamA) || map.has(m.teamB)) await ctx.save(ctx.paths.match(m.id), { teamA: rn(m.teamA), teamB: rn(m.teamB) });
  }
  for (const p of ctx.state.predictions) {
    const next = { champion: rn(p.champion), swiss30: rnArr(p.swiss30), swiss03: rnArr(p.swiss03), swissAdvance: rnArr(p.swissAdvance) };
    // Written directly (not ctx.save) so a locked prediction doesn't stop the rename.
    try { await ctx.store.set(ctx.paths.prediction(p.id), JSON.parse(JSON.stringify(next)), { merge: true }); } catch { /* locked */ }
  }
  for (const b of ctx.state.brackets) {
    const picks = Object.fromEntries(Object.entries(b.picks || {}).map(([k, v]) => [k, rn(v)]));
    try { await ctx.store.set(ctx.paths.bracket(b.id), { picks }, { merge: true }); } catch { /* locked */ }
  }
  const a = ctx.league.actual || {};
  await ctx.save(ctx.paths.league(), {
    actual: { swiss30: rnArr(a.swiss30 || []), swiss03: rnArr(a.swiss03 || []), swissAdvance: rnArr(a.swissAdvance || []), champion: rn(a.champion || null) },
  });
}

// ---------------------------------------------------------------------------
// Settings editor
// ---------------------------------------------------------------------------

function settingsEditor(ctx) {
  const s = ctx.settings;
  openModal({
    title: 'League settings',
    wide: true,
    body: `
      <form class="stack" data-form>
        <label class="field"><span>League name</span><input name="name" value="${esc(ctx.league.name)}" required maxlength="40"></label>
        <div class="grid-2">
          <label class="field"><span>Tournament predictions lock at</span><input type="datetime-local" name="predictionsLock" value="${toLocalInput(s.predictionsLockMs)}"></label>
          <label class="field"><span>Knockout bracket locks at</span><input type="datetime-local" name="knockoutLock" value="${toLocalInput(s.knockoutLockMs)}"></label>
        </div>
        <div class="grid-2">
          <label class="field"><span>Total kills line (use .5 to avoid ties)</span><input type="number" step="0.5" min="0" name="killsLine" value="${s.killsLine}"></label>
          <label class="field"><span>Game length buckets (minutes)</span>
            <div class="inline-inputs">${s.lengthBuckets.map((b, i) => `<input type="number" min="1" name="bucket${i}" value="${b}">`).join('')}</div>
          </label>
        </div>
        <fieldset class="field"><legend>Points per correct pick</legend>
          <div class="points-grid">${Object.entries(POINT_LABELS).map(([k, label]) => `
            <label><span>${esc(label)}</span><input type="number" min="0" name="pt-${k}" value="${s.points[k]}"></label>`).join('')}</div>
        </fieldset>
        <label class="check"><input type="checkbox" name="liveApi" ${s.liveApi ? 'checked' : ''}> Use LoL Esports live data (score widget, schedule sync, auto-fill)</label>
        <label class="field"><span>Schedule sync ignores matches before</span><input type="date" name="since" value="${new Date(s.scheduleSinceMs).toISOString().slice(0, 10)}"></label>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" data-reset>Reset points to defaults</button>
          <button type="submit" class="btn btn-primary">Save settings</button>
        </div>
      </form>`,
    onMount(el, close) {
      const form = el.querySelector('[data-form]');
      el.querySelector('[data-reset]').onclick = () => {
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS.points)) form[`pt-${k}`].value = v;
      };
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const points = Object.fromEntries(Object.keys(POINT_LABELS).map((k) => [k, Math.max(0, Number(fd.get(`pt-${k}`)) || 0)]));
        const buckets = s.lengthBuckets.map((_, i) => Number(fd.get(`bucket${i}`))).filter((n) => n > 0).sort((a, b) => a - b);
        const settings = {
          predictionsLockMs: fromLocalInput(fd.get('predictionsLock')),
          knockoutLockMs: fromLocalInput(fd.get('knockoutLock')),
          killsLine: Number(fd.get('killsLine')) || s.killsLine,
          lengthBuckets: buckets.length ? buckets : s.lengthBuckets,
          points,
          liveApi: fd.get('liveApi') === 'on',
          scheduleSinceMs: Date.parse(`${fd.get('since')}T00:00:00Z`) || s.scheduleSinceMs,
        };
        if (await ctx.save(ctx.paths.league(), { name: fd.get('name').toString().trim(), settings })) {
          close();
          toast('Settings saved', 'success');
        }
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Sample data for demo mode
// ---------------------------------------------------------------------------

async function addDemoData(ctx) {
  const now = Date.now();
  const h = 3600000;
  const d = 24 * h;
  const g = (winner, fb, fd, ft, fbar, min, kills) => ({ winner, firstBlood: fb, firstDragon: fd, firstTower: ft, firstBaron: fbar, durationSec: min * 60, totalKills: kills });
  const matches = [
    { id: 'demo1', teamA: 'GEN', teamB: 'G2', stage: 'swiss', label: 'Round 1', bestOf: 1, startMs: now - d, result: { status: 'final', scoreA: 1, scoreB: 0, games: [g('A', 'A', 'A', 'B', 'A', 29.5, 21)] } },
    { id: 'demo2', teamA: 'BLG', teamB: 'TL', stage: 'swiss', label: 'Round 1', bestOf: 1, startMs: now - d + h, result: { status: 'final', scoreA: 0, scoreB: 1, games: [g('B', 'B', 'A', 'B', 'B', 34, 30)] } },
    { id: 'demo3', teamA: 'HLE', teamB: 'KC', stage: 'swiss', label: 'Round 3 (2-0)', bestOf: 3, startMs: now - 30 * 60000, result: { status: 'live', scoreA: 1, scoreB: 0, games: [g('A', 'B', 'A', 'A', 'A', 31, 24)] } },
    { id: 'demo4', teamA: 'T1', teamB: 'AL', stage: 'swiss', label: 'Round 2', bestOf: 1, startMs: now + 2 * h },
    { id: 'demo5', teamA: 'TES', teamB: 'C9', stage: 'swiss', label: 'Round 4 (2-1)', bestOf: 3, startMs: now + d },
    { id: 'demo6', teamA: 'GEN', teamB: 'TES', stage: 'knockout', bracketSlot: 'QF1', label: '', bestOf: 5, startMs: now + 3 * d },
    { id: 'demo7', teamA: 'HLE', teamB: 'TL', stage: 'knockout', bracketSlot: 'QF2', label: '', bestOf: 5, startMs: now + 3 * d + 4 * h },
    { id: 'demo8', teamA: 'BLG', teamB: 'T1', stage: 'knockout', bracketSlot: 'QF3', label: '', bestOf: 5, startMs: now + 4 * d },
    { id: 'demo9', teamA: 'AL', teamB: 'KC', stage: 'knockout', bracketSlot: 'QF4', label: '', bestOf: 5, startMs: now + 4 * d + 4 * h },
  ];
  for (const { id, ...m } of matches) await ctx.save(ctx.paths.match(id), { ...m, createdAt: now }, { merge: false });
  await ctx.save(ctx.paths.league(), { settings: { predictionsLockMs: now + 2 * d, knockoutLockMs: now + 3 * d } });
  toast('Sample matches added (lock times moved so you can try everything)', 'success');
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const findMatch = (ctx, id) => ctx.state.matches.find((m) => m.id === id);

export const actions = {
  adminTab(el, ctx) { ui.tab = el.dataset.tab; ctx.render(); },
  editMatch(el, ctx) { matchEditor(ctx, el.dataset.mid ? findMatch(ctx, el.dataset.mid) : null); },
  editResult(el, ctx) { resultEditor(ctx, findMatch(ctx, el.dataset.mid)); },
  async deleteMatch(el, ctx) {
    const m = findMatch(ctx, el.dataset.mid);
    if (!(await confirmDialog(`Delete ${m.teamA} vs ${m.teamB} and everyone's picks for it?`, { okText: 'Delete', danger: true }))) return;
    for (const p of ctx.state.picks.filter((x) => x.matchId === m.id)) await ctx.store.remove(`${ctx.paths.picks()}/${p.id}`);
    await ctx.store.remove(ctx.paths.match(m.id));
    toast('Match deleted');
  },
  async syncNow(el, ctx) {
    el.disabled = true;
    el.textContent = 'Syncing…';
    await ctx.sync();
    ctx.render();
  },
  demoData(el, ctx) { return addDemoData(ctx); },
  async toggleActual(el, ctx) {
    const { field, code } = el.dataset;
    // Start from what's shown (automatic or corrected), then apply the correction.
    const a = { ...(ctx.league.actual || {}) };
    const shown = tournamentActual(ctx.league, ctx.state.matches);
    for (const f of ['swiss30', 'swiss03', 'swissAdvance']) if (!a[f]?.length) a[f] = shown[f];
    const list = new Set(a[field] || []);
    if (list.has(code)) list.delete(code);
    else {
      list.add(code);
      // A team can only be in one Swiss outcome.
      for (const other of ['swiss30', 'swiss03', 'swissAdvance']) {
        if (other !== field && (a[other] || []).includes(code)) {
          await ctx.save(ctx.paths.league(), { actual: { [other]: (a[other] || []).filter((c) => c !== code) } });
        }
      }
    }
    await ctx.save(ctx.paths.league(), { actual: { [field]: [...list] } });
  },
  async copyLeagueId() {
    const input = document.getElementById('league-id');
    input.select();
    try { await navigator.clipboard.writeText(input.value); } catch { document.execCommand('copy'); }
    toast('League ID copied', 'success');
  },
  async resetActual(el, ctx) {
    await ctx.save(ctx.paths.league(), { actual: { swiss30: [], swiss03: [], swissAdvance: [] } });
    toast('Back to automatic Swiss results', 'success');
  },
  editTeams(el, ctx) { teamsEditor(ctx); },
  editSettings(el, ctx) { settingsEditor(ctx); },
  async toggleAdmin(el, ctx) {
    const admins = new Set(ctx.league.admins || []);
    const pid = el.dataset.pid;
    if (admins.has(pid)) {
      if (admins.size === 1) { toast('The league needs at least one admin.', 'error'); return; }
      admins.delete(pid);
    } else admins.add(pid);
    await ctx.save(ctx.paths.league(), { admins: [...admins] });
  },
  resetPin(el, ctx) {
    const p = ctx.state.players.find((x) => x.id === el.dataset.pid);
    openModal({
      title: `New PIN for ${p.name}`,
      body: `<form class="stack" data-form>
        <label class="field"><span>New PIN (4–8 digits)</span><input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required></label>
        <div class="form-actions"><button class="btn btn-primary" type="submit">Save PIN</button></div></form>`,
      onMount(m, close) {
        m.querySelector('[data-form]').onsubmit = async (e) => {
          e.preventDefault();
          const pinHash = await sha256(`${ctx.state.leagueId}:${new FormData(e.target).get('pin')}`);
          if (await ctx.save(ctx.paths.player(p.id), { pinHash })) { close(); toast('PIN updated', 'success'); }
        };
      },
    });
  },
  async removePlayer(el, ctx) {
    const p = ctx.state.players.find((x) => x.id === el.dataset.pid);
    if (p.id === ctx.me.id) { toast("You can't remove yourself.", 'error'); return; }
    if (!(await confirmDialog(`Remove ${p.name} and all of their picks?`, { okText: 'Remove', danger: true }))) return;
    for (const pk of ctx.state.picks.filter((x) => x.playerId === p.id)) await ctx.store.remove(`${ctx.paths.picks()}/${pk.id}`);
    await ctx.store.remove(ctx.paths.prediction(p.id));
    await ctx.store.remove(ctx.paths.bracket(p.id));
    await ctx.store.remove(ctx.paths.player(p.id));
    await ctx.save(ctx.paths.league(), { admins: (ctx.league.admins || []).filter((id) => id !== p.id) });
    toast(`${p.name} removed`);
  },
  backup(el, ctx) {
    const { league, players, matches, picks, predictions, brackets } = ctx.state;
    const data = { exportedAt: new Date().toISOString(), league, players: players.map(({ pinHash, ...p }) => p), matches, picks, predictions, brackets };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `worlds-bets-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export const changes = {
  async swissDone(el, ctx) { await ctx.save(ctx.paths.league(), { actual: { swissDone: el.checked } }); },
  async championOverride(el, ctx) { await ctx.save(ctx.paths.league(), { actual: { champion: el.value || null } }); },
};
