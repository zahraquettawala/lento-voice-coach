// Telling your voice apart from the piano.
// Without earbuds, the mic also hears the phone's own speaker: the piano, and Lento when she
// sings along. Pitch detection can't tell a piano note from a sung one, so on its own it draws
// the piano's notes as if you sang them, even when you're silent.
//
// The app knows exactly what it's playing and how loud, so it can predict how much of that
// leaks back into the mic. A note only counts as you when the mic is clearly louder than that
// leak. The leak is learned while only the app is making sound (Lento's demo, and the piano
// giving you your note before each loop), so it adapts to the speaker volume, the room, and
// earbuds (where the leak is close to nothing and everything you sing counts).

const HOLD_SECONDS = 0.3;    // the mic hears the speaker a little late; compare against the recent peak
const MIN_OUT = 1e-3;        // quieter than this, the app isn't really playing anything
const MARGIN = 1.6;          // your voice has to be this much louder than the leak (about 4 dB)
const KEEP = 400;            // how many recent measurements the leak estimate is built from
const PERCENTILE = 0.3;      // a low-ish pick, so a hum during the demo doesn't inflate it
const TAIL_SECONDS = 1.5;    // a piano note keeps ringing (and echoing in the room) after it's released

export function createEchoGate() {
  const recent = [];   // { t, out } output levels for the hold window
  const ratios = [];   // mic level / output level, measured while you were only listening
  const notes = [];    // { midi, from, to } what the app is playing, in audio-clock seconds
  let leak = null;     // the learned ratio, or null before anything's been measured

  // The output level to compare against: the loudest moment in the last fraction of a second
  function heldOut(t, out) {
    recent.push({ t, out });
    while (recent.length && t - recent[0].t > HOLD_SECONDS) recent.shift();
    return Math.max(...recent.map((r) => r.out));
  }

  return {
    // Tell the gate a note is being played (piano or Lento's sung demo)
    playing(midi, from, duration) {
      notes.push({ midi, from, to: from + duration + TAIL_SECONDS });
      if (notes.length > 200) notes.splice(0, notes.length - 200);
    },

    forget() { notes.length = 0; },

    // One measurement per frame. `listening` is true while you might be singing; false while
    // only the app should be making sound, which is when the leak is learned.
    // Returns { out, expected }: the held output level, and the leak the mic should hear from it.
    measure(t, mic, out, listening) {
      const held = heldOut(t, out);
      if (!listening && held >= MIN_OUT && mic > 0) {
        ratios.push(mic / held);
        if (ratios.length > KEEP) ratios.shift();
        const sorted = [...ratios].sort((a, b) => a - b);
        leak = sorted[Math.floor(sorted.length * PERCENTILE)];
      }
      return { out: held, expected: leak === null || held < MIN_OUT ? 0 : leak * held };
    },

    // Is this frame just the app coming back through the mic?
    // `midi` is the detected pitch (or null), `mic` the mic level, `expected` from measure().
    isEcho(t, midi, mic, expected) {
      if (expected <= 0) return false;            // nothing playing, or no leak measured yet
      if (mic > expected * MARGIN) return false;  // clearly louder than the speaker: that's you
      if (midi === null) return true;             // quiet noise under the piano, not a breathy note
      // Only a pitch that matches something the app is playing is the app's
      return notes.some((n) => t >= n.from && t <= n.to && Math.abs(pitchClassGap(midi, n.midi)) < 0.5);
    },

    get leak() { return leak; },
  };
}

// Distance in semitones between two pitches, ignoring octaves (the mic can read a piano note an octave off)
export function pitchClassGap(a, b) {
  const d = (a - b) % 12;
  return d > 6 ? d - 12 : d < -6 ? d + 12 : d;
}

export function rms(buffer) {
  let sum = 0;
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
  return Math.sqrt(sum / buffer.length);
}
