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
  const out = JSON.parse(body);
  assert.equal(out.token, "tok_123");
  assert.match(out.person, /^[0-9a-f]{24}$/, "a daily hash, not the IP");
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

// ---------- Cost tracking: ElevenLabs' post-call webhook ----------
async function signedCall(seconds, secret = "whsec_test", { t = Math.floor(Date.now() / 1000), user = "abc", tamper = false } = {}) {
  const body = JSON.stringify({ type: "post_call_transcription", data: { metadata: { call_duration_secs: seconds, cost: 500, termination_reason: "end_call" },
    conversation_initiation_client_data: { dynamic_variables: { lento_user: user, moment: "debrief" } } } });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return new Request("https://lento-coach.example.workers.dev/webhook", { method: "POST", body: tamper ? body.replace("abc", "xyz") : body,
    headers: { "ElevenLabs-Signature": `t=${t},v0=${mac}` } });
}

function fakePosthog() {
  const events = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("posthog")) events.push(JSON.parse(init.body));
    else events.push({ event: "ELEVENLABS", url: String(url) });
    return new Response(JSON.stringify({ token: "tok_123" }), { status: 200 });
  };
  return events;
}

test("webhook rejects unsigned, tampered or stale calls", async () => {
  const events = fakePosthog();
  const e = env({ WEBHOOK_SECRET: "whsec_test", POSTHOG_KEY: "phc_test" });
  assert.equal((await worker.fetch(await signedCall(60, "wrong"), e)).status, 401);
  assert.equal((await worker.fetch(await signedCall(60, undefined, { tamper: true }), e)).status, 401);
  assert.equal((await worker.fetch(await signedCall(60, undefined, { t: Math.floor(Date.now() / 1000) - 3600 }), e)).status, 401);
  assert.equal(events.length, 0);
  assert.equal(e.LIMITS.m.size, 0);
});

test("each chat is logged with its cost, and the budget warns, then stops new chats", async () => {
  const events = fakePosthog();
  const e = env({ WEBHOOK_SECRET: "whsec_test", POSTHOG_KEY: "phc_test", DAILY_BUDGET_USD: "0.4", PER_PERSON_DAILY: "99", ALL_DAILY: "99" });
  assert.equal((await worker.fetch(await signedCall(150), e)).status, 200); // 2.5 min = $0.20
  const first = events.find((x) => x.event === "coach_conversation");
  assert.equal(first.distinct_id, "abc");
  assert.equal(first.properties.seconds, 150);
  assert.equal(first.properties.est_cost_usd, 0.2);
  assert.equal(first.properties.ended_by, "end_call");
  assert.equal(first.api_key, "phc_test");
  await worker.fetch(await signedCall(120), e); // $0.36 total, past 80%
  assert.equal(events.filter((x) => x.event === "coach_budget_warning").length, 1);
  assert.equal((await worker.fetch(req(), e)).status, 200, "still under budget");
  await worker.fetch(await signedCall(60), e); // $0.44, over
  await worker.fetch(await signedCall(60), e);
  assert.equal(events.filter((x) => x.event === "coach_budget_reached").length, 1, "warned once, not every call");
  assert.equal(events.filter((x) => x.event === "coach_budget_warning").length, 1);
  const calls = events.filter((x) => x.event === "ELEVENLABS").length;
  assert.equal((await worker.fetch(req(), e)).status, 429, "no new chats once the budget is spent");
  assert.equal(events.filter((x) => x.event === "ELEVENLABS").length, calls);
});

test("no PostHog key, no logging, but the budget still counts", async () => {
  const events = fakePosthog();
  const e = env({ WEBHOOK_SECRET: "whsec_test" });
  assert.equal((await worker.fetch(await signedCall(60), e)).status, 200);
  assert.equal(events.length, 0);
  assert.equal([...e.LIMITS.m.entries()].find(([k]) => k.startsWith("usd:"))[1], "0.08");
});

// ---------- Coaching cues during the lesson ----------
import { diagnose, CUES, CAUSES, ALL_CUES, noteShape, phraseLevel } from "../cues.js";

test("Lento diagnoses why a phrase went flat before picking a cue", () => {
  assert.equal(diagnose({ kind: "low", spot: "top" }), "flat-peak");
  assert.equal(diagnose({ kind: "low", scoop: 0.6, spot: "top" }), "flat-scoop");
  assert.equal(diagnose({ kind: "low", sag: 0.7 }), "flat-sag");
  assert.equal(diagnose({ kind: "low", level: "quiet" }), "flat-quiet");
  assert.equal(diagnose({ kind: "low", nearTop: true }), "flat-high");
  assert.equal(diagnose({ kind: "low", vowel: "Hoo" }), "flat-dark");
  assert.equal(diagnose({ kind: "low", late: true }), "flat-tired");
  assert.equal(diagnose({ kind: "low", stuck: true, scoop: 1 }), "flat-stuck");
  assert.match(CUES["flat-stuck"], /eyebrows/);
});

test("sharp and breathy have their own causes", () => {
  assert.equal(diagnose({ kind: "high", fast: true, spot: "top" }), "sharp-fast");
  assert.equal(diagnose({ kind: "high", level: "loud" }), "sharp-loud");
  assert.equal(diagnose({ kind: "high", spot: "top" }), "sharp-peak");
  assert.equal(diagnose({ kind: "high", nearBottom: true }), "sharp-low");
  assert.equal(diagnose({ kind: "high" }), "sharp-tense");
  assert.equal(diagnose({ kind: "breathy", spot: "first" }), "breathy-onset");
  assert.equal(diagnose({ kind: "breathy", nearTop: true }), "breathy-high");
  assert.equal(diagnose({ kind: "breathy" }), "breathy-air");
  assert.equal(diagnose({ kind: "breathy", late: true, stuck: true }), "breathy-tired");
  assert.equal(diagnose({ kind: "ok" }), null);
});

test("every cause has a cue and a plain-words explanation, and cues are unique", () => {
  assert.deepEqual(Object.keys(CUES).sort(), Object.keys(CAUSES).sort());
  assert.equal(new Set(ALL_CUES).size, ALL_CUES.length);
});

test("reading the shape of a note: scoops and sags", () => {
  const T = 60;
  const scoop = [0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9].map((f) => ({ f, midi: f < 0.35 ? T - 0.8 : T }));
  const sag = [0.1, 0.2, 0.3, 0.5, 0.7, 0.8, 0.9].map((f) => ({ f, midi: f < 0.35 ? T : T - 0.5 }));
  const steady = [0.1, 0.2, 0.3, 0.7, 0.8].map((f) => ({ f, midi: T + 0.05 }));
  assert.equal(noteShape(scoop, T), "scoop");
  assert.equal(noteShape(sag, T), "sag");
  assert.equal(noteShape(steady, T), "");
  assert.equal(noteShape(scoop.map((s) => ({ ...s, midi: s.midi + 12 })), T), "scoop", "an octave up still counts");
  assert.equal(phraseLevel(-40, -30), "quiet");
  assert.equal(phraseLevel(-20, -30), "loud");
  assert.equal(phraseLevel(-30, null), "");
});

test("the chat afterwards hears why, not just the score", () => {
  const line = exerciseLine({ id: "runs", name: "Fast runs", hits: 5, total: 10, issues: { low: 5 }, drills: 1, causes: { "flat-sag": 2 } });
  assert.match(line, /drifted flat by the end of the note/);
});
