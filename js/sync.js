// Pulls the Worlds schedule + series scores from LoL Esports into the league.
import { getScheduleEvents, eventToMatch } from './lolesports.js';

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function syncSchedule({ store, paths, league, matches }) {
  const events = (await getScheduleEvents(league.settings.scheduleSinceMs)).map(eventToMatch);
  let created = 0;
  let updated = 0;

  // 1) Teams: add new ones, fill in missing logos.
  const teams = (league.teams || []).map((t) => ({ ...t }));
  let teamsChanged = false;
  for (const ev of events) {
    for (const t of [ev.teamA, ev.teamB]) {
      if (t.code === 'TBD') continue;
      const existing = teams.find((x) => x.code.toUpperCase() === t.code.toUpperCase());
      if (!existing) {
        teams.push({ code: t.code, name: t.name, region: 'Other', image: t.image });
        teamsChanged = true;
      } else if (!existing.image && t.image) {
        existing.image = t.image;
        teamsChanged = true;
      }
    }
  }
  if (teamsChanged) await store.set(paths.league(), { teams }, { merge: true });
  const canonical = (code) => teams.find((x) => x.code.toUpperCase() === code.toUpperCase())?.code || code;

  // 2) Knockout slots in schedule order (QF1..QF4, SF1, SF2, F). Fix in Admin if the real bracket differs.
  const slotOf = new Map();
  for (const round of ['QF', 'SF', 'F']) {
    events.filter((e) => e.round === round).forEach((e, i) => slotOf.set(e.esportsMatchId, round === 'F' ? 'F' : `${round}${i + 1}`));
  }

  // 3) Matches.
  for (const ev of events) {
    const existing = matches.find((m) => m.esportsMatchId === ev.esportsMatchId);
    const id = existing?.id || `lol_${ev.esportsMatchId}`;
    const patch = {
      esportsMatchId: ev.esportsMatchId,
      teamA: canonical(ev.teamA.code),
      teamB: canonical(ev.teamB.code),
      bestOf: ev.bestOf,
      startMs: ev.startMs,
      stage: existing?.stage || ev.stage,
      label: existing?.label || ev.label,
    };
    if (!existing?.bracketSlot && slotOf.has(ev.esportsMatchId)) patch.bracketSlot = slotOf.get(ev.esportsMatchId);
    if (!existing?.result?.manual && ev.state !== 'unstarted') {
      patch.result = { status: ev.state === 'completed' ? 'final' : 'live', scoreA: ev.scoreA, scoreB: ev.scoreB };
      // Exactly one more game finished since we last looked: whoever's score went up won it.
      const prevA = Number(existing?.result?.scoreA) || 0;
      const prevB = Number(existing?.result?.scoreB) || 0;
      const total = ev.scoreA + ev.scoreB;
      if (total === prevA + prevB + 1) patch.result.gameWinners = { [total]: ev.scoreA > prevA ? 'A' : 'B' };
    }
    const changed = !existing || Object.entries(patch).some(([k, v]) =>
      k === 'result'
        ? ['status', 'scoreA', 'scoreB'].some((f) => !same(existing.result?.[f], v[f]))
        : !same(existing[k], v));
    if (!changed) continue;
    if (!existing) patch.createdAt = Date.now();
    await store.set(paths.match(id), patch, { merge: true });
    existing ? updated++ : created++;
  }
  return { found: events.length, created, updated };
}
