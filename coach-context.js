// What Lento the live coach knows about you, in plain words. The app measures everything;
// these turn the numbers into short sentences the ElevenLabs agent can talk about.
// No DOM or storage here, so it can be tested on its own.

const pct = (hits, total) => (total ? Math.round((hits / total) * 100) : null);
const MOOD_WORDS = { tired: "a bit tired", okay: "pretty good", great: "ready to sing" };

function daysAgo(at, now) {
  const d = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
}

// The biggest problem in an exercise, if there was one: "mostly flat", "a bit sharp", "breathy"
export function issueWords(issues = {}) {
  const { low = 0, high = 0, breathy = 0 } = issues;
  const worst = Math.max(low, high, breathy);
  if (!worst) return "";
  if (worst === breathy) return "breathy";
  return worst === low ? "flat" : "sharp";
}

// One line per exercise: "Fast runs: 62% on pitch, went flat, drilled twice"
export function exerciseLine(e) {
  const p = pct(e.hits, e.total);
  const parts = [`${e.name}: ${p === null ? "not scored" : `${p}% on pitch`}`];
  const issue = issueWords(e.issues);
  if (issue && p !== null && p < 80) parts.push(`tended to go ${issue}`);
  if (e.drills) parts.push(`we drilled it ${e.drills === 1 ? "once" : `${e.drills} times`}`);
  return parts.join(", ");
}

// A few sentences about recent lessons, for the check-in before a lesson
export function historySummary(sessions = [], now = Date.now()) {
  if (!sessions.length) return "This is their first lesson with you. You don't know their voice yet.";
  const recent = sessions.slice(-5);
  const last = recent.at(-1);
  const lines = [];
  const lastPct = pct(last.exercises.reduce((n, e) => n + e.hits, 0), last.exercises.reduce((n, e) => n + e.total, 0));
  lines.push(`Last lesson was ${daysAgo(last.at, now)}: ${Math.round(last.minutes)} minutes${last.mood ? `, they felt ${MOOD_WORDS[last.mood] ?? last.mood}` : ""}${lastPct === null ? "" : `, ${lastPct}% of notes on pitch`}.`);

  // Best and weakest exercises across recent lessons
  const byId = new Map();
  for (const s of recent) for (const e of s.exercises) {
    const a = byId.get(e.id) ?? { name: e.name, hits: 0, total: 0, low: 0, high: 0, breathy: 0 };
    a.hits += e.hits; a.total += e.total;
    for (const k of ["low", "high", "breathy"]) a[k] += e.issues?.[k] ?? 0;
    byId.set(e.id, a);
  }
  const scored = [...byId.values()].filter((a) => a.total >= 4).map((a) => ({ ...a, p: pct(a.hits, a.total) }));
  scored.sort((a, b) => b.p - a.p);
  if (scored.length >= 2) {
    const best = scored[0], worst = scored.at(-1);
    lines.push(`Strongest lately: ${best.name} (${best.p}%).`);
    if (worst.p < best.p) {
      const issue = issueWords(worst);
      lines.push(`Needs work: ${worst.name} (${worst.p}%${issue ? `, tends to go ${issue}` : ""}).`);
    }
  }

  // Trend over the last few lessons
  const trend = recent.map((s) => pct(s.exercises.reduce((n, e) => n + e.hits, 0), s.exercises.reduce((n, e) => n + e.total, 0))).filter((p) => p !== null);
  if (trend.length >= 3) {
    const diff = trend.at(-1) - trend[0];
    lines.push(diff >= 5 ? `Pitch accuracy is improving (${trend[0]}% to ${trend.at(-1)}% over ${trend.length} lessons).`
      : diff <= -5 ? `Pitch accuracy has dipped a little (${trend[0]}% to ${trend.at(-1)}%).`
      : `Pitch accuracy is steady around ${trend.at(-1)}%.`);
  }
  lines.push(`They've done ${sessions.length} lesson${sessions.length > 1 ? "s" : ""} in total.`);
  return lines.join(" ");
}

// What just happened in the lesson, for the chat afterwards
export function lessonSummary(results = [], { mood, minutes, finished = true } = {}) {
  if (!results.length) return "They didn't finish any scored exercises this time.";
  const hits = results.reduce((n, r) => n + r.hits, 0), total = results.reduce((n, r) => n + r.total, 0);
  const head = `${finished ? "They finished the lesson" : "They stopped the lesson early"}${minutes ? ` after ${Math.round(minutes)} minutes` : ""}${mood ? `, feeling ${MOOD_WORDS[mood] ?? mood} at the start` : ""}. Overall ${pct(hits, total)}% of notes on pitch.`;
  return [head, ...results.map((r) => exerciseLine(r) + ".")].join(" ");
}

// The lesson plan in words, for when Lento has just built it
export function planSummary(lesson, label = (m) => String(m)) {
  const parts = lesson.blocks.map((b) => b.ex.free ? `${b.ex.song}, ${b.ex.name} (song)` : `${b.ex.name} (${b.section.toLowerCase()}, on "${b.ex.sound}")`);
  return `About ${Math.max(1, lesson.minutes)} minutes, starting around ${label(lesson.base)}: ${parts.join("; ")}.`;
}

export function timeOfDay(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
}
