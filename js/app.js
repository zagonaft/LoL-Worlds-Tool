// App entry point: loads the league, keeps live subscriptions, routes between views.
import { FIREBASE_CONFIG } from './config.js';
import { createStore } from './store.js';
import { DEFAULT_TEAMS, DEFAULT_SETTINGS, DEFAULT_POINTS, TOURNAMENT_NAME } from './defaults.js';
import { esc, uid, toast, openModal, playerDot } from './ui.js';
import { computeStandings } from './scoring.js';
import { syncSchedule } from './sync.js';
import * as matchesView from './views/matches.js';
import * as bracketView from './views/bracket.js';
import * as standingsView from './views/standings.js';
import * as adminView from './views/admin.js';
import * as loginView from './views/login.js';
import * as widget from './views/widget.js';

const VIEWS = {
  matches: { title: 'Matches', view: matchesView },
  bracket: { title: 'Bracket', view: bracketView },
  standings: { title: 'Standings', view: standingsView },
  admin: { title: 'Admin', view: adminView, adminOnly: true },
};

const LEAGUE_KEY = 'lwt:league';
const params = new URLSearchParams(location.search);

const state = {
  leagueId: params.get('league') || localStorage.getItem(LEAGUE_KEY),
  league: undefined, // undefined = loading, null = not found
  players: [],
  matches: [],
  picks: [],
  predictions: [],
  brackets: [],
  loaded: new Set(),
  meId: null,
  loadError: null,
};

let store;

export const paths = {
  league: () => `leagues/${state.leagueId}`,
  players: () => `leagues/${state.leagueId}/players`,
  player: (id) => `leagues/${state.leagueId}/players/${id}`,
  matches: () => `leagues/${state.leagueId}/matches`,
  match: (id) => `leagues/${state.leagueId}/matches/${id}`,
  picks: () => `leagues/${state.leagueId}/picks`,
  pick: (matchId, playerId) => `leagues/${state.leagueId}/picks/${matchId}__${playerId}`,
  predictions: () => `leagues/${state.leagueId}/predictions`,
  prediction: (id) => `leagues/${state.leagueId}/predictions/${id}`,
  brackets: () => `leagues/${state.leagueId}/brackets`,
  bracket: (id) => `leagues/${state.leagueId}/brackets/${id}`,
};

const meKey = () => `lwt:${state.leagueId}:me`;

// Everything a view needs, in one object.
const ctx = {
  state,
  paths,
  get store() { return store; },
  get league() { return state.league; },
  get settings() {
    const s = state.league?.settings || {};
    return { ...DEFAULT_SETTINGS, ...s, points: { ...DEFAULT_POINTS, ...(s.points || {}) } };
  },
  get teams() { return state.league?.teams || []; },
  team(code) {
    if (!code || code === 'TBD') return null;
    return this.teams.find((t) => t.code === code) || { code, name: code };
  },
  get me() { return state.players.find((p) => p.id === state.meId) || null; },
  get isAdmin() {
    const admins = state.league?.admins || [];
    return !!state.meId && (admins.length === 0 || admins.includes(state.meId));
  },
  get demo() { return store?.mode === 'local'; },
  standings: [],
  login(playerId) {
    state.meId = playerId;
    localStorage.setItem(meKey(), playerId);
    render();
  },
  logout() {
    state.meId = null;
    localStorage.removeItem(meKey());
    render();
  },
  render: () => render(),
  async save(path, data, opts = { merge: true }) {
    try {
      await store.set(path, data, opts);
      return true;
    } catch (err) {
      reportError(err);
      return false;
    }
  },
  async sync({ quiet = false } = {}) {
    try {
      const r = await syncSchedule({ store, paths, league: state.league, matches: state.matches });
      if (!quiet) toast(`Synced ${r.found} matches (${r.created} new, ${r.updated} updated)`, 'success');
      localStorage.setItem(`lwt:${state.leagueId}:lastSync`, String(Date.now()));
      return r;
    } catch (err) {
      if (!quiet) toast(`Sync failed: ${err.message}`, 'error');
      return null;
    }
  },
};

function reportError(err) {
  console.error(err);
  if (err?.code === 'permission-denied') toast('Locked: betting on this has closed.', 'error');
  else toast(`Error: ${err?.message || err}`, 'error');
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function route() {
  const r = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (r === 'widget') return 'widget';
  return VIEWS[r] ? r : 'matches';
}

function currentView() {
  const r = route();
  if (!state.league || !ctx.me) return loginView;
  if (VIEWS[r]?.adminOnly && !ctx.isAdmin) return matchesView;
  return VIEWS[r]?.view || matchesView;
}

function header() {
  const me = ctx.me;
  const r = route();
  const myRow = ctx.standings.find((row) => row.player.id === me?.id);
  const tabs = Object.entries(VIEWS)
    .filter(([, v]) => !v.adminOnly || ctx.isAdmin)
    .map(([key, v]) => `<a href="#/${key}" class="tab ${r === key ? 'active' : ''}">${v.title}</a>`)
    .join('');
  return `
    <header class="topbar">
      <div class="topbar-row">
        <a class="brand" href="#/matches"><span class="brand-mark">◆</span><span class="brand-name">${esc(state.league.name || TOURNAMENT_NAME)}</span></a>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-sm" data-action="invite" title="Invite friends">Invite</button>
          <button class="me-chip" data-action="switchPlayer" title="Switch player">
            ${playerDot(me)}<span>${esc(me.name)}</span><strong>${myRow ? myRow.total : 0} pts</strong>
          </button>
        </div>
      </div>
      <nav class="tabs">${tabs}</nav>
    </header>
    ${ctx.demo ? `<div class="demo-banner">Demo mode: data is only saved in this browser. Add your Firebase config to share it with friends (see README).</div>` : ''}`;
}

function landing() {
  return `
    <div class="landing">
      <div class="landing-card">
        <div class="brand-mark big">◆</div>
        <h1>${TOURNAMENT_NAME} Pick'em</h1>
        <p class="muted">Fake-bet with your friends on every Worlds match: winners, series scores, first blood, dragons, game length and your bracket.</p>
        ${state.league === null ? `<p class="warn">That league link doesn't exist (or was mistyped). Create a new one below, or ask your friend for the link again.</p>` : ''}
        <form id="create-league" class="stack">
          <label class="field"><span>League name</span>
            <input id="league-name" name="name" maxlength="40" value="Worlds 2026 Bets" required>
          </label>
          <button class="btn btn-primary" type="submit">Create league</button>
        </form>
        <p class="muted small">Already have an invite link? Just open it; it takes you straight to your league.</p>
        ${store?.mode === 'local' ? `<p class="muted small">Running in demo mode (no Firebase config yet).</p>` : ''}
      </div>
    </div>`;
}

function render() {
  const root = document.getElementById('app');
  // Keep focus + caret in the input being typed in while live data re-renders the page.
  const active = document.activeElement;
  const focus = active && active.id && root.contains(active)
    ? { id: active.id, value: active.value, start: active.selectionStart, end: active.selectionEnd }
    : null;

  const isWidget = route() === 'widget';
  document.body.classList.toggle('widget-page', isWidget);

  if (!state.leagueId || state.league === null) {
    root.innerHTML = landing();
  } else if (state.league === undefined || !state.loaded.has('players')) {
    root.innerHTML = state.loadError
      ? `<div class="landing"><div class="landing-card"><h1>Can't load the league</h1><p>${esc(state.loadError)}</p>
          <p class="muted">If you just set up Firebase, check that the Firestore database exists and the security rules from <code>firestore.rules</code> are published (see README).</p></div></div>`
      : `<div class="loading"><div class="spinner"></div>Loading league…</div>`;
  } else if (isWidget) {
    root.innerHTML = '';
  } else {
    if (state.meId && !ctx.me && state.loaded.has('players')) {
      state.meId = null;
      localStorage.removeItem(meKey());
    }
    ctx.standings = computeStandings({
      players: state.players,
      matches: state.matches,
      picks: state.picks,
      predictions: state.predictions,
      brackets: state.brackets,
      league: state.league,
      settings: ctx.settings,
    });
    const view = currentView();
    root.innerHTML = `${ctx.me ? header() : ''}<main id="view" class="view">${view.html(ctx)}</main>`;
  }

  if (focus) {
    const el = document.getElementById(focus.id);
    if (el && el !== document.activeElement) {
      if ('value' in el && focus.value != null) el.value = focus.value;
      el.focus();
      try { el.setSelectionRange(focus.start, focus.end); } catch { /* not a text input */ }
    }
  }
  widget.update(ctx, { fullPage: isWidget && !!state.league });
}

// ---------------------------------------------------------------------------
// Events: views declare handlers by name, the HTML references them with
// data-action="name" (clicks) and data-change="name" (inputs/selects).
// ---------------------------------------------------------------------------

const globalActions = {
  switchPlayer() {
    openModal({
      title: 'Switch player',
      body: `<p>You're playing as <strong>${esc(ctx.me?.name)}</strong> on this device.</p>
        <div class="form-actions">
          <button class="btn" data-close-me>Stay</button>
          <button class="btn btn-primary" data-logout>Switch player</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-close-me]').onclick = close;
        el.querySelector('[data-logout]').onclick = () => { close(); ctx.logout(); };
      },
    });
  },
  invite() {
    const link = `${location.origin}${location.pathname}?league=${state.leagueId}`;
    openModal({
      title: 'Invite your friends',
      body: `<p>Send this link to your friends. Anyone with it can join the league, so keep it within the group.</p>
        <div class="copy-row"><input id="invite-link" readonly value="${esc(link)}"><button class="btn btn-primary" data-copy>Copy</button></div>
        ${ctx.demo ? `<p class="warn small">You're in demo mode, so this link only works in this browser. Set up Firebase first (see README).</p>` : ''}
        <p class="muted small">Tip: open <code>${esc(link)}#/widget</code> for a full-screen live score widget.</p>`,
      onMount(el) {
        el.querySelector('[data-copy]').onclick = async () => {
          const input = el.querySelector('#invite-link');
          input.select();
          try { await navigator.clipboard.writeText(input.value); } catch { document.execCommand('copy'); }
          toast('Link copied!', 'success');
        };
      },
    });
  },
};

function findHandler(kind, name) {
  const view = currentView();
  const table = kind === 'click' ? 'actions' : 'changes';
  return view[table]?.[name] || widget[table]?.[name] || (kind === 'click' ? globalActions[name] : null);
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.closest('.modal')) return;
  const fn = findHandler('click', el.dataset.action);
  if (!fn) return;
  e.preventDefault();
  Promise.resolve(fn(el, ctx, e)).catch(reportError);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (!el || el.closest('.modal')) return;
  const fn = findHandler('change', el.dataset.change);
  if (fn) Promise.resolve(fn(el, ctx, e)).catch(reportError);
});

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'create-league') return;
  e.preventDefault();
  const name = new FormData(e.target).get('name').toString().trim() || 'Worlds 2026 Bets';
  const id = uid(20);
  try {
    await store.set(`leagues/${id}`, {
      name,
      createdAt: Date.now(),
      teams: DEFAULT_TEAMS,
      settings: DEFAULT_SETTINGS,
      actual: {},
      admins: [],
    });
    localStorage.setItem(LEAGUE_KEY, id);
    const q = new URLSearchParams(location.search);
    q.set('league', id);
    location.href = `${location.pathname}?${q}`;
  } catch (err) {
    reportError(err);
  }
});

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

function subscribe() {
  const done = (key) => { state.loaded.add(key); render(); };
  store.watchDoc(paths.league(), (doc) => { state.league = doc; done('league'); });
  store.watchCol(paths.players(), (docs) => { state.players = docs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); done('players'); });
  store.watchCol(paths.matches(), (docs) => { state.matches = docs.sort((a, b) => (a.startMs || 0) - (b.startMs || 0)); done('matches'); });
  store.watchCol(paths.picks(), (docs) => { state.picks = docs; done('picks'); });
  store.watchCol(paths.predictions(), (docs) => { state.predictions = docs; done('predictions'); });
  store.watchCol(paths.brackets(), (docs) => { state.brackets = docs; done('brackets'); });
}

function startTimers() {
  // Refresh countdowns and lock states, unless someone is typing.
  setInterval(() => {
    const typing = document.activeElement?.matches?.('input, textarea, select');
    if (!typing && !document.querySelector('.modal-backdrop') && document.visibilityState === 'visible') render();
  }, 30000);

  // Admins keep the schedule and series scores in sync with LoL Esports.
  const autoSync = () => {
    if (!ctx.isAdmin || !state.league || !ctx.settings.liveApi || document.visibilityState !== 'visible') return;
    const last = Number(localStorage.getItem(`lwt:${state.leagueId}:lastSync`) || 0);
    if (Date.now() - last > 5 * 60000) ctx.sync({ quiet: true });
  };
  setTimeout(autoSync, 5000);
  setInterval(autoSync, 60000);
}

async function boot() {
  try {
    store = await createStore(FIREBASE_CONFIG);
  } catch (err) {
    document.getElementById('app').innerHTML = `<div class="landing"><div class="landing-card"><h1>Couldn't connect</h1><p>${esc(err.message)}</p><p class="muted">Check js/config.js and your internet connection.</p></div></div>`;
    return;
  }
  store.onError((err) => {
    if (!state.loaded.has('league') || !state.loaded.has('players')) {
      state.loadError = err?.message || String(err);
      render();
    } else reportError(err);
  });
  if (state.leagueId) {
    localStorage.setItem(LEAGUE_KEY, state.leagueId);
    state.meId = localStorage.getItem(meKey());
    subscribe();
  }
  render();
  startTimers();
}

boot();
