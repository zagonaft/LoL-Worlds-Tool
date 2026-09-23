// Small DOM and formatting helpers shared by all views.

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export function uid(len = 20) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- dates ----------

export function fmtDay(ms) {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function fmtDateTime(ms) {
  if (ms == null) return '—';
  return new Date(ms).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// "in 3h 20m", "in 2d 4h", "5m ago"
export function relTime(ms, now = Date.now()) {
  const diff = ms - now;
  const abs = Math.abs(diff);
  if (abs < 5000) return 'just now';
  const m = Math.floor(abs / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  let txt;
  if (d >= 1) txt = `${d}d ${h % 24}h`;
  else if (h >= 1) txt = `${h}h ${m % 60}m`;
  else if (m >= 1) txt = `${m}m`;
  else txt = `${Math.max(1, Math.floor(abs / 1000))}s`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}

// <input type="datetime-local"> uses local time without a timezone.
export function toLocalInput(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// ---------- toasts ----------

export function toast(message, type = 'info') {
  let box = document.getElementById('toasts');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toasts';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}

// ---------- modals ----------
// Modals live outside the main view, so live data updates never wipe a form
// someone is filling in.

export function openModal({ title, body, wide = false, onMount, onClose }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">✕</button>
      </header>
      <div class="modal-body">${body}</div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('has-modal');
  const close = () => {
    if (!wrap.isConnected) return;
    wrap.remove();
    onClose?.();
    if (!document.querySelector('.modal-backdrop')) document.body.classList.remove('has-modal');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) close(); });
  wrap.querySelector('[data-close]').addEventListener('click', close);
  const modal = wrap.querySelector('.modal');
  onMount?.(modal, close);
  modal.querySelector('input:not([type=hidden]), select, textarea')?.focus();
  return close;
}

export function confirmDialog(message, { okText = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let answer = false;
    openModal({
      title: 'Are you sure?',
      body: `<p>${esc(message)}</p>
        <div class="form-actions">
          <button class="btn" data-no>Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okText)}</button>
        </div>`,
      onMount(el, close) {
        el.querySelector('[data-yes]').onclick = () => { answer = true; close(); };
        el.querySelector('[data-no]').onclick = close;
      },
      onClose: () => resolve(answer),
    });
  });
}

// ---------- teams ----------

export function teamLogo(team, size = 'md') {
  if (!team) return `<span class="logo logo-${size} logo-tbd">?</span>`;
  if (team.image) return `<img class="logo logo-${size}" src="${esc(team.image)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  return `<span class="logo logo-${size}" style="--hue:${hue(team.code)}">${esc(String(team.code).slice(0, 4))}</span>`;
}

function hue(code) {
  let h = 0;
  for (const ch of String(code)) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

// Only allow plain hex colors into style attributes.
export const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c)) ? c : '#888');

export function playerDot(player) {
  return `<span class="pdot" style="background:${safeColor(player?.color)}"></span>`;
}
