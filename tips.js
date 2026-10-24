// What Lento tells you when she stops to fix something: a quick technique cue for going flat,
// sharp or breathy. When the same thing keeps happening she gives a different tip each time,
// like a coach who's paying attention. Every line is fixed text so it can be recorded once
// in Lento's voice.

export const TIPS = {
  low: [
    "Raise your eyebrows a little, and aim right at the center of the note.",
    "Think of the note as just a little higher than you hear it.",
    "Keep the air moving all the way through the note. Don't let it sag at the end.",
    "Lift the back of your mouth, like the start of a yawn.",
  ],
  high: [
    "Relax your jaw and let the note settle. No need to push.",
    "Use a little less pressure, and let it float down to the center.",
    "Drop your shoulders and sing it more gently.",
  ],
  breathy: [
    "Start the note like a soft hum, so the sound is clear from the first moment.",
    "Take a low breath into your belly, and use a little less air.",
    "Support it from your belly, like a slow, steady sigh.",
  ],
};

// `times` is how many times this lesson Lento has already stopped for this problem
export function tipFor(kind, times = 0) {
  const list = TIPS[kind];
  return list ? list[times % list.length] : "";
}

// Every tip, for recording in Lento's voice
export const ALL_TIPS = Object.values(TIPS).flat();
