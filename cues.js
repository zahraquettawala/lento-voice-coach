// How Lento coaches a phrase that went wrong: first work out why (like a voice teacher would),
// then pick the cue for that cause. Based on McKinney's "The Diagnosis and Correction of Vocal
// Faults", Miller's "The Structure of Singing", Titze's semi-occluded vocal tract research, and
// Singing Carrots' analysis of 632,000 missed notes. Notes and sources: coaching-cues.md in the
// project files. Every cue is fixed text so it can be recorded once in Lento's voice.

export const CUES = {
  // Flat
  "flat-peak": "Aim for the top of the note, not the bottom.",
  "flat-high": "Lighter as you go higher. Let the top note float instead of pushing it.",
  "flat-scoop": "Hear the note in your head first, then land right on it.",
  "flat-sag": "Keep your ribs wide and the air moving all the way to the end of the note.",
  "flat-quiet": "Give it a little more energy. Sing like you mean it.",
  "flat-dark": "Brighten the vowel, a little smile on the inside.",
  "flat-tired": "Your voice is working hard. Let's take this one lighter.",
  "flat-stuck": "Raise your eyebrows a little, and aim right at the center of the note.",
  // Sharp
  "sharp-peak": "Less push on the top. Let it spin, don't squeeze.",
  "sharp-fast": "Loose jaw, light and easy. Fast doesn't mean hard.",
  "sharp-loud": "Bring the volume down a notch, and the pitch will settle.",
  "sharp-low": "Let the low notes relax down. No need to hold them up.",
  "sharp-tense": "Drop your shoulders, soften your jaw, and sing it gently.",
  // Breathy
  "breathy-onset": "Start the sound like a gentle hum, clean from the very first moment.",
  "breathy-air": "Use less air. Think of a small, steady stream, like singing through a straw.",
  "breathy-high": "Keep the same clear sound as you go up. Don't let it get airy.",
  "breathy-tired": "Sounds like you're tiring. Small sips of water, and we'll go lighter.",
};

// What each cause means in words, for Lento's chat after the lesson
export const CAUSES = {
  "flat-peak": "went flat reaching up to the top of the phrase",
  "flat-high": "went flat near the top of their range, likely carrying too much weight up",
  "flat-scoop": "scooped up into notes from below instead of landing on them",
  "flat-sag": "landed on pitch but drifted flat by the end of the note, a sign of breath support letting go",
  "flat-quiet": "went flat while singing quietly, likely not enough energy",
  "flat-dark": "went flat on a dark vowel",
  "flat-tired": "went flat late in the lesson, likely fatigue",
  "flat-stuck": "kept going flat on the same spot even after a tip",
  "sharp-peak": "went sharp on the top note, likely pushing too much breath",
  "sharp-fast": "went sharp on fast runs, likely tension",
  "sharp-loud": "went sharp while singing loudly, oversinging",
  "sharp-low": "went sharp on low notes, holding the voice up",
  "sharp-tense": "went sharp throughout, general tension",
  "breathy-onset": "let air out before the sound started",
  "breathy-air": "used too much air through the whole note",
  "breathy-high": "got airy on the higher notes",
  "breathy-tired": "got breathy late in the lesson, likely fatigue",
};

const DARK_VOWELS = /^(oo|hoo|oh|mm|hum)/i;

// `p` describes the phrase:
//   kind: "low" | "high" | "breathy"
//   spot: "top" | "first" | "last" | "up" | "down" | ""   where most of the misses were
//   scoop, sag: share of the missed notes that slid up into the note / drifted down at the end (0-1)
//   level: "quiet" | "loud" | ""   how loud they sang, compared with their own average
//   nearTop, nearBottom: the phrase is at the top / bottom of today's range
//   fast: a fast exercise; vowel: the exercise's sound ("Hoo", "Ah"...)
//   late: well into the lesson; stuck: same problem again right after a cue
// Returns the cause id; CUES[id] is what Lento says.
export function diagnose(p) {
  if (p.kind === "low") {
    if (p.stuck) return "flat-stuck";
    if (p.scoop >= 0.5) return "flat-scoop";
    if (p.sag >= 0.5) return "flat-sag";
    if (p.level === "quiet") return "flat-quiet";
    if (p.nearTop) return "flat-high";
    if (p.spot === "top" || p.spot === "up") return "flat-peak";
    if (p.late) return "flat-tired";
    if (DARK_VOWELS.test(p.vowel ?? "")) return "flat-dark";
    return "flat-peak"; // most flat misses happen reaching up
  }
  if (p.kind === "high") {
    if (p.fast) return "sharp-fast";
    if (p.level === "loud") return "sharp-loud";
    if (p.spot === "top") return "sharp-peak";
    if (p.nearBottom || p.spot === "down") return "sharp-low";
    return "sharp-tense";
  }
  if (p.kind === "breathy") {
    if (p.late && p.stuck) return "breathy-tired";
    if (p.nearTop || p.spot === "top") return "breathy-high";
    if (p.spot === "first") return "breathy-onset";
    return p.stuck ? "breathy-onset" : "breathy-air";
  }
  return null;
}

// Every cue, for recording in Lento's voice
export const ALL_CUES = Object.values(CUES);

// ---------- Reading the sound ----------
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
// Distance from the target in semitones, any octave counting
const off = (midi, target) => { const d = midi - target; return d - 12 * Math.round(d / 12); };

// How a note moved: "scoop" if it started under and slid up onto the pitch, "sag" if it landed
// and then drifted flat by the end. `track` is [{ f: 0-1 through the note, midi }].
export function noteShape(track, target) {
  const early = track.filter((s) => s.f < 0.35).map((s) => off(s.midi, target));
  const late = track.filter((s) => s.f > 0.6).map((s) => off(s.midi, target));
  if (early.length < 2 || late.length < 2) return "";
  const a = median(early), z = median(late);
  if (a < -0.3 && z - a > 0.2) return "scoop";
  if (Math.abs(a) <= 0.25 && z < -0.25) return "sag";
  return "";
}

// How loud a phrase was compared with the singer's own usual level (in dB)
export function phraseLevel(db, usual) {
  if (db === null || usual === null) return "";
  return db < usual - 6 ? "quiet" : db > usual + 6 ? "loud" : "";
}
