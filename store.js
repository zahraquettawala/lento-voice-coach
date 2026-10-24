// Practice history, saved only on this phone.
// A session: { at: ISO time, minutes, mood?, exercises: [{ id, name, hits, total }] }

import { track } from "./analytics.js";

const KEY = "lentoSessions";
const OLD_KEY = "mariahSessions"; // from before the app was renamed Lento

export function sessions() {
  try {
    if (localStorage.getItem(KEY) === null && localStorage.getItem(OLD_KEY) !== null) {
      localStorage.setItem(KEY, localStorage.getItem(OLD_KEY));
      localStorage.removeItem(OLD_KEY);
    }
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch { return []; }
}

export const lastSession = () => sessions().at(-1) ?? null;

export function saveSession(session) {
  const all = sessions();
  all.push(session);
  try { localStorage.setItem(KEY, JSON.stringify(all.slice(-200))); } catch {}
  track("lesson_saved", {
    minutes: Math.round(session.minutes * 10) / 10, mood: session.mood, accuracy: accuracy(session),
    exercises: session.exercises.length, lesson_number: all.length,
  });
}

export const accuracy = (s) => {
  const hits = s.exercises.reduce((n, e) => n + e.hits, 0);
  const total = s.exercises.reduce((n, e) => n + e.total, 0);
  return total ? Math.round((hits / total) * 100) : 0;
};

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export function stats() {
  const all = sessions();
  const days = new Set(all.map((s) => dayKey(new Date(s.at))));
  // Streak: consecutive days with practice, counting back from today (or yesterday)
  let streak = 0;
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d))) { streak++; d.setDate(d.getDate() - 1); }
  const weekAgo = Date.now() - 7 * 864e5;
  const week = all.filter((s) => new Date(s.at).getTime() > weekAgo).reduce((n, s) => n + s.minutes, 0);
  const last = all[all.length - 1];
  return { streak, weekMinutes: Math.round(week), lastAccuracy: last ? accuracy(last) : null, count: all.length };
}
