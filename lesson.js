// Builds today's vocal lesson: warm-ups, then scales, then your song, then a cooldown.
// It mixes the exercises up from session to session like a real coach, and adapts to how
// you're feeling. Aims for about 15-20 minutes.

import { EXERCISES, keysFor, loopSeconds, topStep, settings } from "./exercises.js";
import { sectionExercise } from "./song.js";

export const SECTIONS = ["Warm-up", "Scales", "Song", "Cooldown"];

export const MOODS = {
  tired: { label: "A bit tired", hint: "Gentle warm-ups, nothing too high", line: "Let's go easy today. Lots of gentle warm-ups, nothing too high.",
    warmups: 3, scales: 1, climb: -3, speed: 0.9, gentleOnly: true },
  okay: { label: "Pretty good", hint: "A full lesson", line: "Nice. A normal lesson today: warm up, some scales, then your song.",
    warmups: 2, scales: 2, climb: 0, speed: 1, maxPower: 1 },
  great: { label: "Ready to sing", hint: "Wider range and fast runs", line: "Love that energy. We'll stretch your range a little and do some fast runs.",
    warmups: 2, scales: 2, climb: 2, speed: 1.05, minPower: 1 },
};

const SPOKEN_SECONDS = 20; // Lento's intro, demo and transition for each exercise, roughly
const TARGET_MAX = 19 * 60;

// Pick n exercises at random, less likely to repeat ones from last time
function pick(pool, n, last, must = () => false) {
  const chosen = [];
  const left = [...pool];
  while (chosen.length < n && left.length) {
    // On the last pick, make sure at least one exercise passes `must`
    const strict = chosen.length === n - 1 && !chosen.some(must) ? left.filter(must) : [];
    const need = strict.length ? strict : left;
    const weights = need.map((ex) => (last.has(ex.id) ? 0.3 : 1));
    let r = Math.random() * weights.reduce((a, b) => a + b, 0), i = 0;
    while ((r -= weights[i]) > 0) i++;
    const ex = need[Math.min(i, need.length - 1)];
    chosen.push(ex);
    left.splice(left.indexOf(ex), 1);
  }
  return chosen;
}

export function buildLesson({ mood = "okay", song = null, lastSession = null, only = null } = {}) {
  const m = MOODS[mood] ?? MOODS.okay;
  const last = new Set(lastSession?.exercises?.map((e) => e.id) ?? []);
  const base = settings.base + (mood === "tired" ? -1 : 0);
  const climb = Math.max(3, Math.min(14, settings.climb + m.climb));
  const speed = Math.round(settings.speed * m.speed);
  const ceiling = base + climb + 7; // the highest note today

  const fits = (ex) => !m.gentleOnly || ex.gentle;
  const of = (kind) => EXERCISES.filter((ex) => ex.kind === kind && fits(ex));
  let scales = of("scale");
  if (m.maxPower !== undefined) {
    // At most one power exercise on a normal day
    const picked = pick(scales, m.scales, last);
    if (picked.filter((ex) => ex.power).length > m.maxPower) {
      const calm = scales.filter((ex) => !ex.power && !picked.includes(ex));
      if (calm.length) picked[picked.findIndex((ex) => ex.power)] = calm[Math.floor(Math.random() * calm.length)];
    }
    scales = picked;
  } else {
    scales = pick(scales, m.scales, last, m.minPower ? (ex) => ex.power : undefined);
  }

  const plan = only
    ? [only]
    : [...pick(of("warmup"), m.warmups, last), ...scales, ...pick(of("cooldown"), 1, last)];

  const blocks = plan.map((ex) => {
    const room = ceiling - (base + ex.offset) - topStep(ex);
    const c = ex.down ? Math.min(4, Math.max(2, room)) : Math.max(2, Math.min(climb, room));
    return { ex, climb: c, section: ex.kind === "warmup" ? "Warm-up" : ex.kind === "scale" ? "Scales" : "Cooldown" };
  });

  // Your song goes between the scales and the cooldown
  if (song?.sections?.length && !only) {
    const songBlocks = song.sections.slice(0, 3).map((s, i) => sectionExercise(song, s, i))
      .filter((ex) => ex.start !== null)
      .map((ex) => ({ ex, section: "Song", keys: [ex.start, ex.start] }));
    blocks.splice(blocks.length - 1, 0, ...songBlocks);
  }

  for (const b of blocks) b.keys ??= keysFor(b.ex, base, b.climb);

  // Keep it under about 19 minutes by trimming the longest climbs
  const seconds = () => blocks.reduce((n, b) => n + blockSeconds(b, speed), 0);
  while (seconds() > TARGET_MAX) {
    const longest = blocks.filter((b) => b.climb > 3 && !b.ex.down).sort((a, b) => blockSeconds(b, speed) - blockSeconds(a, speed))[0];
    if (!longest) break;
    longest.climb--;
    longest.keys = keysFor(longest.ex, base, longest.climb);
  }

  return { mood, base, speed, blocks, minutes: Math.round(seconds() / 60) };
}

export function blockSeconds(b, speed) {
  const loop = b.ex.free ? b.ex.seconds + 4 : loopSeconds(b.ex, speed);
  return b.keys.length * loop + SPOKEN_SECONDS + (b.ex.free ? 0 : loopSeconds(b.ex, speed)); // + the demo loop
}
