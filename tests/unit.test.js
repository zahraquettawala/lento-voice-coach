// Unit tests for the parts of Lento that are plain logic. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { LINES } from "../voice/lines.js";
import { recordingsFor, normalize } from "../voice.js";
import { buildLesson, MOODS } from "../lesson.js";
import { EXERCISES } from "../exercises.js";
import { parseNote, parseMelody } from "../song.js";

const root = new URL("../", import.meta.url);
const app = ["lesson.html", "welcome.html", "tuner.html"].map((f) => readFileSync(new URL(f, root), "utf8")).join("\n");

test("every recorded line has its audio file", () => {
  for (const [text, file] of Object.entries(LINES)) {
    assert.ok(existsSync(new URL(`voice/${file}`, root)), `missing voice/${file} for "${text}"`);
  }
});

// The lines that introduce each exercise, built the same way as upNext in lesson.html
const intros = new Set(EXERCISES.flatMap((ex) => {
  const n = ex.name.toLowerCase();
  return {
    warmup: [`Let's warm up your voice. First, ${n}.`, `Next warm-up: ${n}.`],
    scale: [`Now some scales. ${ex.name}.`],
    cooldown: [`Nice work. Let's cool down with ${n}.`],
  }[ex.kind].concat(`${ex.name}. Here we go.`);
}));

test("every exercise's introduction is recorded, so it plays instantly", () => {
  for (const text of intros) assert.ok(recordingsFor(text), `no recording for "${text}"; add it to voice/lines.js and run tools/render-voice.py`);
  for (const template of ["Let's warm up your voice. First, ${", "Next warm-up: ${", "Now some scales. ${", "Nice work. Let's cool down with ${", "}. Here we go."]) {
    assert.ok(app.includes(template), `lesson.html no longer says "${template}"; update the intros here and in voice/lines.js`);
  }
});

test("every recorded line is still something the app says", () => {
  // If the app's wording changes, the old recording would quietly stop playing
  const said = normalize(app);
  for (const text of Object.keys(LINES)) {
    if (/breathy|went a little/.test(text)) continue; // built from parts in lesson.html
    if (intros.has(text)) continue; // checked below
    assert.ok(said.includes(normalize(text)), `"${text}" isn't in the app anymore`);
  }
});

test("recorded lines are found, including two joined together", () => {
  assert.equal(recordingsFor("Listen first.").length, 1);
  assert.equal(recordingsFor("Listen first").length, 1);
  assert.equal(recordingsFor("You're a little flat. Lift it up. One more time.").length, 2);
  assert.equal(recordingsFor("You’re a little sharp. Ease off. Let's do that one again. I'll sing it with you.").length, 2);
  assert.equal(recordingsFor("That's your lesson. Really nice work today. I'm proud of you.").length, 1);
});

test("lines that aren't recorded are left to the voice on the phone", () => {
  assert.equal(recordingsFor("Let's sing Chorus from My Song. Here's your starting note."), null);
  assert.equal(recordingsFor("Listen first. Something new."), null);
  assert.equal(recordingsFor(""), null);
});

for (const mood of Object.keys(MOODS)) {
  test(`a "${mood}" lesson has warm-ups, scales and a cooldown in order`, () => {
    for (let run = 0; run < 50; run++) {
      const lesson = buildLesson({ mood });
      const kinds = lesson.blocks.map((b) => b.ex.kind);
      assert.equal(kinds.filter((k) => k === "warmup").length, MOODS[mood].warmups);
      assert.equal(kinds.filter((k) => k === "scale").length, MOODS[mood].scales);
      assert.equal(kinds.at(-1), "cooldown");
      assert.deepEqual(kinds, [...kinds].sort((a, b) => "wsc".indexOf(a[0]) - "wsc".indexOf(b[0])));
      assert.equal(new Set(lesson.blocks.map((b) => b.ex.id)).size, lesson.blocks.length, "no repeats");
      for (const b of lesson.blocks) assert.ok(b.keys.length > 0);
      assert.ok(lesson.minutes <= 20, `${lesson.minutes} minutes is too long`);
      if (mood === "tired") assert.ok(lesson.blocks.every((b) => b.ex.gentle));
      if (mood === "okay") assert.ok(lesson.blocks.filter((b) => b.ex.power).length <= 1);
      if (mood === "great") assert.ok(lesson.blocks.some((b) => b.ex.power));
    }
  });
}

test("a song goes between the scales and the cooldown", () => {
  const song = { title: "My Song", bpm: 90, sections: [{ name: "Chorus", start: "E4", melody: "" }] };
  const lesson = buildLesson({ mood: "okay", song });
  assert.deepEqual(lesson.blocks.map((b) => b.section).slice(-2), ["Song", "Cooldown"]);
});

test("every exercise has a name, syllables and a tempo", () => {
  for (const ex of EXERCISES) {
    assert.ok(ex.name && ex.bpm > 0 && ex.sylls?.length, ex.id);
  }
});

test("note names and melodies parse", () => {
  assert.equal(parseNote("C4"), 60);
  assert.equal(parseNote("F#3"), 54);
  assert.equal(parseNote("Bb4"), 70);
  assert.equal(parseNote("H2"), null);
  assert.deepEqual(parseMelody("E4 G4:2 -"), [[64, 1], [67, 2], [null, 1]]);
  assert.equal(parseMelody("E4 nope"), null);
});

test("the recordings and the on-phone voice use the same Kokoro voice and speed", () => {
  const worker = readFileSync(new URL("voice/kokoro-worker.js", root), "utf8");
  const render = readFileSync(new URL("tools/render-voice.py", root), "utf8");
  const pick = (src, re) => src.match(re)?.[1];
  assert.equal(pick(worker, /VOICE = "(\w+)"/), pick(render, /VOICE, SPEED, LANG = "(\w+)"/));
  assert.equal(pick(worker, /SPEED = ([\d.]+)/), pick(render, /VOICE, SPEED, LANG = "\w+", ([\d.]+)/));
});

// The echo gate: the piano coming back through the speaker isn't your voice
import { createEchoGate, pitchClassGap } from "../echo.js";

test("pitch distance ignores octaves", () => {
  assert.equal(Math.abs(pitchClassGap(60, 72)), 0);
  assert.equal(pitchClassGap(61, 48), 1);
  assert.equal(pitchClassGap(59, 72), -1);
});

test("the piano leaking into the mic doesn't count as singing", () => {
  const gate = createEchoGate();
  gate.playing(60, 0, 4);
  // While you listen, the mic hears the piano at a fifth of what's played
  for (let t = 0; t < 1; t += 1 / 60) gate.measure(t, 0.02, 0.1, false);
  assert.ok(Math.abs(gate.leak - 0.2) < 1e-9);
  // Silent: the mic only hears the piano's note
  const { expected } = gate.measure(1.5, 0.02, 0.1, true);
  assert.equal(gate.isEcho(1.5, 60, 0.02, expected), true);
  assert.equal(gate.isEcho(1.5, 72.1, 0.02, expected), true, "an octave off is still the piano");
  // Singing over it: the mic is much louder than the leak
  assert.equal(gate.isEcho(1.5, 60, 0.08, expected), false);
  // A soft note that isn't what the piano is playing is still you
  assert.equal(gate.isEcho(1.5, 63, 0.02, expected), false);
  // After the piano stops ringing, nothing is the piano
  assert.equal(gate.isEcho(6, 60, 0.02, gate.measure(6, 0.02, 0, true).expected), false);
});

test("with earbuds (no leak) everything you sing counts", () => {
  const gate = createEchoGate();
  gate.playing(60, 0, 4);
  for (let t = 0; t < 1; t += 1 / 60) gate.measure(t, 0.0001, 0.1, false);
  const { expected } = gate.measure(1.5, 0.01, 0.1, true);
  assert.equal(gate.isEcho(1.5, 60, 0.01, expected), false);
});

test("before the leak is measured, nothing is thrown away", () => {
  const gate = createEchoGate();
  gate.playing(60, 0, 4);
  const { expected } = gate.measure(0.5, 0.02, 0.1, true);
  assert.equal(gate.isEcho(0.5, 60, 0.02, expected), false);
});
