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

test("every recorded line is still something the app says", () => {
  // If the app's wording changes, the old recording would quietly stop playing
  const said = normalize(app);
  for (const text of Object.keys(LINES)) {
    if (/breathy|went a little/.test(text)) continue; // built from parts in lesson.html
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

test("lines that aren't recorded fall back to the phone's voice", () => {
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
