// "Who are you?" screen: pick your player and enter your PIN, or join as a new player.
import { PLAYER_COLORS } from '../defaults.js';
import { esc, uid, sha256, openModal, toast, safeColor } from '../ui.js';

const hashPin = (ctx, pin) => sha256(`${ctx.state.leagueId}:${pin}`);

export function html(ctx) {
  const players = ctx.state.players;
  return `
    <div class="landing">
      <div class="landing-card wide">
        <div class="brand-mark big">◆</div>
        <h1>${esc(ctx.league.name)}</h1>
        <p class="muted">Who's betting?</p>
        ${players.length ? `
          <div class="player-grid">
            ${players.map((p) => `
              <button class="player-card" data-action="pickPlayer" data-id="${esc(p.id)}">
                <span class="avatar" style="background:${safeColor(p.color)}">${esc(p.name.slice(0, 1).toUpperCase())}</span>
                <span>${esc(p.name)}</span>
              </button>`).join('')}
          </div>` : `<p class="muted">No players yet. You'll be the first one (and the league admin).</p>`}
        <button class="btn ${players.length ? '' : 'btn-primary'}" data-action="newPlayer">+ I'm new here</button>
        ${ctx.demo ? `<p class="muted small">Demo mode: data is only saved in this browser.</p>` : ''}
      </div>
    </div>`;
}

export const actions = {
  pickPlayer(el, ctx) {
    const player = ctx.state.players.find((p) => p.id === el.dataset.id);
    if (!player) return;
    openModal({
      title: `Hi ${player.name}!`,
      body: `
        <form class="stack" data-form>
          <label class="field"><span>Your PIN</span>
            <input name="pin" type="password" inputmode="numeric" autocomplete="off" required minlength="4" maxlength="8">
          </label>
          <p class="error small" hidden data-err>Wrong PIN, try again.</p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Let me in</button></div>
        </form>`,
      onMount(modal, close) {
        modal.querySelector('[data-form]').onsubmit = async (e) => {
          e.preventDefault();
          const pin = new FormData(e.target).get('pin').toString();
          if ((await hashPin(ctx, pin)) === player.pinHash) {
            close();
            ctx.login(player.id);
          } else {
            modal.querySelector('[data-err]').hidden = false;
          }
        };
      },
    });
  },

  newPlayer(el, ctx) {
    const used = new Set(ctx.state.players.map((p) => p.color));
    const firstFree = PLAYER_COLORS.find((c) => !used.has(c)) || PLAYER_COLORS[0];
    openModal({
      title: 'Join the league',
      body: `
        <form class="stack" data-form>
          <label class="field"><span>Your name</span><input name="name" required maxlength="20" autocomplete="nickname"></label>
          <label class="field"><span>Pick a PIN (4–8 digits)</span>
            <input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,8}" required autocomplete="off">
            <small class="muted">Just so friends can't bet as you by accident. Not a real password, so don't reuse an important one.</small>
          </label>
          <fieldset class="field"><legend>Your color</legend>
            <div class="swatches">
              ${PLAYER_COLORS.map((c) => `
                <label class="swatch" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === firstFree ? 'checked' : ''}><span></span></label>`).join('')}
            </div>
          </fieldset>
          <p class="error small" hidden data-err></p>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Join</button></div>
        </form>`,
      onMount(modal, close) {
        modal.querySelector('[data-form]').onsubmit = async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const name = fd.get('name').toString().trim();
          const err = modal.querySelector('[data-err]');
          if (ctx.state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
            err.textContent = 'Someone already uses that name.';
            err.hidden = false;
            return;
          }
          const id = uid(12);
          const ok = await ctx.save(ctx.paths.player(id), {
            name,
            color: fd.get('color') || firstFree,
            pinHash: await hashPin(ctx, fd.get('pin').toString()),
            createdAt: Date.now(),
          }, { merge: false });
          if (!ok) return;
          if (!(ctx.league.admins || []).length) await ctx.save(ctx.paths.league(), { admins: [id] });
          close();
          toast(`Welcome, ${name}!`, 'success');
          ctx.login(id);
        };
      },
    });
  },
};

