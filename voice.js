// Lento's speaking voice is Kokoro v1.0 (voice af_heart), free and open source.
// 1. Lines listed in voice/lines.js play from recordings in voice/, so they start instantly.
// 2. Anything else is spoken by the same voice running on the phone (voice/kokoro-worker.js).
// 3. Until that model has downloaded (or if it can't run), the phone's built-in voice steps in.

import { LINES } from "./voice/lines.js";

// Nicest iPhone and Mac voices first. "Enhanced" and "Premium" ones sound the most natural,
// but only show up if they're downloaded in Settings > Accessibility > Spoken Content > Voices.
const PREFERRED = [
  /^Ava \(Premium\)/, /^Zoe \(Premium\)/, /^Ava \(Enhanced\)/, /^Zoe \(Enhanced\)/,
  /^Samantha \(Enhanced\)/, /^Allison \(Enhanced\)/, /^Susan \(Enhanced\)/, /^Nicky/,
  /^Samantha/, /^Karen/, /^Moira/, /^Google US English/,
];

let chosen = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  for (const re of PREFERRED) {
    const v = voices.find((x) => re.test(x.name) && x.lang.startsWith("en"));
    if (v) return v;
  }
  return voices.find((x) => x.lang === "en-US") ?? null;
}

const supported = typeof window !== "undefined" && "speechSynthesis" in window;
if (supported) {
  chosen = pickVoice();
  speechSynthesis.addEventListener?.("voiceschanged", () => (chosen = pickVoice()));
}

// ---------- Recorded lines ----------

// Match lines loosely, so curly quotes, "…" vs "..." and stray punctuation don't matter
export const normalize = (text) => text.toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();
const FILES = new Map(Object.entries(LINES).map(([text, file]) => [normalize(text), file]));

// The recordings that make up a line, or null if any part of it isn't recorded.
// Some lines are two recorded lines joined, like "Just under. Think up. One more time."
export function recordingsFor(text) {
  const parts = text.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const files = [];
  for (let i = 0; i < parts.length;) {
    let j = parts.length;
    while (j > i && !FILES.has(normalize(parts.slice(i, j).join(" ")))) j--;
    if (j === i) return null;
    files.push(FILES.get(normalize(parts.slice(i, j).join(" "))));
    i = j;
  }
  return files.length ? files : null;
}

let ctx = null;
const buffers = new Map(); // file -> Promise<AudioBuffer>
const playing = new Map(); // source -> finish
let generation = 0; // bumped by hush so lines still loading never start

function load(file) {
  if (!buffers.has(file)) {
    const p = fetch(new URL(`voice/${file}`, import.meta.url))
      .then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then((data) => new Promise((ok, fail) => ctx.decodeAudioData(data, ok, fail)));
    p.catch(() => buffers.delete(file)); // try again next time
    buffers.set(file, p);
  }
  return buffers.get(file);
}

function playBuffer(buffer) {
  return new Promise((resolve) => {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);
    const finish = () => { clearTimeout(fallback); playing.delete(src); resolve(); };
    const fallback = setTimeout(finish, (buffer.duration + 1) * 1000);
    src.onended = finish;
    playing.set(src, finish);
    src.start();
  });
}

// Plays the recordings for a line. Resolves to false if it couldn't, so the caller can
// fall back to the built-in voice.
async function playRecorded(text) {
  const files = recordingsFor(text);
  if (!files || !ctx) return false;
  if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 400))]);
  if (ctx.state !== "running") return false;
  const gen = generation;
  let audio;
  try { audio = await Promise.all(files.map(load)); } catch { return false; }
  for (const b of audio) {
    if (gen !== generation) return true;
    await playBuffer(b);
  }
  return true;
}

// ---------- Kokoro on the phone ----------

let worker = null, ready = false, nextId = 0;
const waiting = new Map(); // id -> resolve(AudioBuffer | null)
const made = new Map();    // normalized text -> Promise<AudioBuffer | null>

// Start downloading the model in the background. Safe to call many times.
export function warmUp() {
  if (worker || typeof Worker === "undefined") return;
  try {
    worker = new Worker(new URL("voice/kokoro-worker.js", import.meta.url), { type: "module" });
  } catch { worker = null; return; }
  worker.onmessage = ({ data }) => {
    if (data.type === "ready") ready = true;
    if (data.type === "failed") { ready = false; worker?.terminate(); }
    if (data.type === "audio") {
      const done = waiting.get(data.id);
      waiting.delete(data.id);
      if (!done) return;
      if (data.error || !ctx) return done(null);
      const buffer = ctx.createBuffer(1, data.audio.length, data.rate);
      buffer.getChannelData(0).set(data.audio);
      done(buffer);
    }
  };
  worker.onerror = () => { ready = false; };
  worker.postMessage({ type: "load" });
}

// Kokoro's audio for a line, made once and kept for repeats
function generate(text) {
  const key = normalize(text);
  if (!made.has(key)) {
    const p = new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      worker.postMessage({ type: "say", id, text });
    });
    p.then((b) => { if (!b) made.delete(key); });
    made.set(key, p);
  }
  return made.get(key);
}

// Make a line ahead of time, so it's ready when she says it
export function prepare(text) {
  if (ready && ctx && !recordingsFor(text)) generate(text);
}

// Speaks a line with Kokoro on the phone. Resolves to false if it isn't ready, or takes too
// long this time (the line is still finished in the background for next time).
async function playOnDevice(text) {
  if (!ready || !ctx || ctx.state !== "running") { warmUp(); return false; }
  const gen = generation;
  const buffer = await Promise.race([generate(text), new Promise((r) => setTimeout(() => r(null), 6000))]);
  if (!buffer) return false;
  if (gen === generation) await playBuffer(buffer);
  return true;
}

// ---------- Built-in voice ----------

function utterance(text) {
  const u = new SpeechSynthesisUtterance(text);
  if (chosen) u.voice = chosen;
  u.rate = 0.96;   // a touch slower than default reads warmer
  u.pitch = 1.08;
  return u;
}

function speakBuiltIn(text) {
  if (!supported) return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = utterance(text);
    const fallback = setTimeout(resolve, 1200 + text.length * 75);
    u.onend = u.onerror = () => { clearTimeout(fallback); resolve(); };
    speechSynthesis.speak(u);
  });
}

// ---------- What the app calls ----------

// Speak and wait until she's done (or about as long as the line takes, if the phone
// never says it finished)
export async function speakAndWait(text) {
  hush();
  const gen = generation;
  if (await playRecorded(text)) return;
  if (gen !== generation) return;
  if (await playOnDevice(text)) return;
  if (gen === generation) await speakBuiltIn(text);
}

export function speak(text) {
  speakAndWait(text);
}

// Whether Lento is talking right now
export function talking() {
  return playing.size > 0 || (supported && speechSynthesis.speaking);
}

export function hush() {
  generation++;
  for (const [src, finish] of playing) { try { src.stop(); } catch {} finish(); }
  if (supported) speechSynthesis.cancel();
}

// iPhones only allow sound that starts from a tap. Call this inside the tap handler
// when the real line will be spoken a moment later.
export function unlock() {
  if (supported) speechSynthesis.speak(new SpeechSynthesisUtterance(""));
  try {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    ctx.resume();
  } catch {}
  warmUp();
}
