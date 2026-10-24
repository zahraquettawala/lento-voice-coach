// Run with: node --test tests/*.test.mjs
// None of these touch the network. The worker tests swap out fetch and fail if anything
// tries to reach ElevenLabs for real.
import { test } from "node:test";
import assert from "node:assert/strict";
import { historySummary, lessonSummary, exerciseLine, issueWords, planSummary } from "../coach-context.js";
import worker from "../coach/worker/index.js";

const ex = (id, name, hits, total, issues = {}, drills = 0) => ({ id, name, hits, total, issues, drills });
const NOW = new Date("2026-10-24T20:00:00");

test("first lesson has no history", () => {
  assert.match(historySummary([], NOW), /first lesson/);
});

test("history names the last lesson, best and weakest exercises, and the trend", () => {
  const s = (day, runs) => ({ at: `2026-10-${day}T19:00:00`, minutes: 16, mood: "okay",
    exercises: [ex("fifths", "Humming fifths", 9, 10), ex("runs", "Fast runs", runs, 20, { low: 20 - runs })] });
  const text = historySummary([s(20, 8), s(21, 10), s(23, 14)], NOW);
  assert.match(text, /Last lesson was yesterday: 16 minutes, they felt pretty good/);
  assert.match(text, /Strongest lately: Humming fifths/);
  assert.match(text, /Needs work: Fast runs \(\d+%, tends to go flat\)/);
  assert.match(text, /improving/);
  assert.match(text, /3 lessons in total/);
});

test("exercise lines mention the problem only when it mattered", () => {
  assert.equal(exerciseLine(ex("runs", "Fast runs", 6, 10, { high: 4 }, 2)), "Fast runs: 60% on pitch, tended to go sharp, we drilled it 2 times");
  assert.equal(exerciseLine(ex("fifths", "Humming fifths", 9, 10, { low: 1 })), "Humming fifths: 90% on pitch");
  assert.equal(issueWords({ breathy: 3, low: 1 }), "breathy");
  assert.equal(issueWords({}), "");
});

test("lesson summary for the chat afterwards", () => {
  const text = lessonSummary([ex("scale", "5-note scale", 8, 10), ex("runs", "Fast runs", 5, 10, { low: 5 }, 1)], { mood: "great", minutes: 17.4 });
  assert.match(text, /^They finished the lesson after 17 minutes, feeling ready to sing at the start\. Overall 65% of notes on pitch\./);
  assert.match(text, /Fast runs: 50% on pitch, tended to go flat, we drilled it once\./);
  assert.match(lessonSummary([]), /didn't finish/);
});

test("plan summary lists each exercise", () => {
  const lesson = { minutes: 15, base: 55, blocks: [
    { section: "Warm-up", ex: { name: "Lip trill scale", sound: "Brr" } },
    { section: "Cooldown", ex: { name: "Hoo sighs", sound: "Hoo" } }] };
  assert.equal(planSummary(lesson, () => "G3"), 'About 15 minutes, starting around G3: Lip trill scale (warm-up, on "Brr"); Hoo sighs (cooldown, on "Hoo").');
});

// ---------- Key server ----------
function kv() {
  const m = new Map();
  return { get: async (k) => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), m };
}
const env = (over = {}) => ({ ALLOWED_ORIGINS: "https://zahraquettawala.github.io", AGENT_ID: "agent_test", ELEVENLABS_API_KEY: "sk_test",
  PER_PERSON_DAILY: "2", ALL_DAILY: "3", LIMITS: kv(), ...over });
const req = (origin = "https://zahraquettawala.github.io", ip = "1.2.3.4", method = "POST", path = "/session") =>
  new Request(`https://lento-coach.example.workers.dev${path}`, { method, headers: { Origin: origin, "CF-Connecting-IP": ip } });

function fakeElevenLabs() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), key: init?.headers?.["xi-api-key"] });
    return new Response(JSON.stringify({ token: "tok_123" }), { status: 200 });
  };
  return calls;
}

test("worker refuses other websites", async () => {
  const calls = fakeElevenLabs();
  const res = await worker.fetch(req("https://evil.example"), env());
  assert.equal(res.status, 403);
  assert.equal(calls.length, 0);
});

test("worker hands out a token and never sends the key to the phone", async () => {
  const calls = fakeElevenLabs();
  const res = await worker.fetch(req(), env());
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.deepEqual(JSON.parse(body), { token: "tok_123" });
  assert.ok(!body.includes("sk_test"));
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://zahraquettawala.github.io");
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /convai\/conversation\/token\?agent_id=agent_test$/);
  assert.equal(calls[0].key, "sk_test");
});

test("worker enforces per-person and overall daily limits", async () => {
  const calls = fakeElevenLabs();
  const e = env();
  assert.equal((await worker.fetch(req(), e)).status, 200);
  assert.equal((await worker.fetch(req(), e)).status, 200);
  assert.equal((await worker.fetch(req(), e)).status, 429); // same person, third time
  assert.equal((await worker.fetch(req(undefined, "5.6.7.8"), e)).status, 200);
  assert.equal((await worker.fetch(req(undefined, "9.9.9.9"), e)).status, 429); // everyone, fourth time
  assert.equal(calls.length, 3);
  assert.ok(![...e.LIMITS.m.keys()].some((k) => k.includes("1.2.3.4")), "IP addresses aren't stored");
});

test("worker off switch and preflight", async () => {
  const calls = fakeElevenLabs();
  assert.equal((await worker.fetch(req(), env({ COACH_ON: "off" }))).status, 503);
  assert.equal((await worker.fetch(req(undefined, undefined, "OPTIONS"), env())).status, 204);
  assert.equal((await worker.fetch(req(undefined, undefined, "GET", "/other"), env())).status, 404);
  assert.equal(calls.length, 0);
});

// ---------- Tips during the lesson ----------
import { tipFor, TIPS, ALL_TIPS } from "../tips.js";

test("tips rotate when the same problem keeps happening", () => {
  assert.equal(tipFor("low", 0), TIPS.low[0]);
  assert.match(tipFor("low", 0), /eyebrows/);
  assert.notEqual(tipFor("low", 1), tipFor("low", 0));
  assert.equal(tipFor("high", TIPS.high.length), TIPS.high[0]);
  assert.equal(tipFor("ok", 0), "");
  assert.equal(new Set(ALL_TIPS).size, ALL_TIPS.length);
});
