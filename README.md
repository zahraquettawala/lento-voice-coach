# Lento

Lento is a vocal coach for singers who want to keep up their music without driving to lessons, paying a lot, or finding the time. Lento is the musical marking for "slow," and she's a sloth: a reminder to slow down and make time for the art you love.

You open the app, meet Lento, and get a 15-20 minute vocal lesson: warm-ups, scales, a few sections of the song you're practicing, and a cooldown. Lento sings each exercise first, then plays piano while you sing, listens to your pitch, and moves up a half step on her own.

## Try it

Open **https://zahraquettawala.github.io/lento-voice-coach/** on your phone in Safari, tap **Start your vocal lesson**, allow the microphone, and sing.

## What's in the app

- **Welcome** (`welcome.html`): Lento introduces herself, one idea per screen.
- **Today** (`index.html`): just Lento and one button to start today's lesson. A tab bar with a big Sing button gets you everywhere else.
- **Lesson** (`lesson.html`): Lento asks how your voice feels, shows today's plan in one line, then runs one full-screen lesson and ends with a little celebration:
  - **Warm-up, Scales, Song, Cooldown.** The exercises change from lesson to lesson, and the plan adapts to how you feel: tired means gentle warm-ups and a smaller range; ready to sing means a wider range and fast runs.
  - **Every exercise:** Lento sings the pattern once ("me-me-ma-ma-moo"), then it's your turn with just the piano. Each loop moves a half step on its own; nothing to tap.
  - **Live coaching:** if a phrase is flat, sharp or breathy, Lento stops, says what happened, and sings it again with you (up to two more tries) before moving on. Switch it off in settings with "Stop and fix mistakes."
  - **Your song:** Lento gives you the starting note for each section. If you typed the melody, she sings it first and scores each note.
- **Your song** (`song.html`): the song you're practicing, with up to 3 sections, a starting note each, and an optional melody.
- **Tuner** (`tuner.html`): the note you're singing against a target note, with a flat / on pitch / sharp meter.
- **Progress** (`progress.html`): accuracy over recent lessons, accuracy per exercise, and history.
- **Your privacy** (`privacy.html`, linked from Progress): what stays on the phone, and a button to delete your practice history.

Six looks, picked in lesson settings: Neutral (the default), Sunny, Lemon, Studio, Night and Forest. Add it to your home screen in Safari (Share, then Add to Home Screen) and it opens full screen like an app.

Wear wired earbuds so the mic hears you, not the piano. Within 25 cents of the target counts as on pitch, so vibrato isn't penalized.

## Code

`exercises.js` is the exercise library, `lesson.js` builds each day's lesson, `song.js` stores your song, `store.js` saves lessons on the phone (localStorage), `piano.js` plays the grand piano, `sing.js` is Lento's singing voice for demos, `voice.js` is her speaking voice, `sloth.js` draws her, `keys.js` draws the keyboard, `ui.js` is the tab bar, and `theme.css` is the design system. No build step. `warmup.html` redirects old links to the lesson.

Pitch detection runs in the browser with [Pitchy](https://github.com/ianprime0509/pitchy). The piano is the [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) (a Yamaha C5, CC-BY 3.0, Alexander Holm), via [Tone.js audio](https://github.com/Tonejs/audio). Nothing is recorded; practice history stays on your phone.

## Lento's voice

Lento speaks with an ElevenLabs voice (Irene). Her lines were recorded once and ship as audio files in `voice/`, so there's no server, no API key and no cost per use. `voice/lines.js` lists each recorded line and its file; `voice.js` plays the recording when a line matches (two recorded lines in a row work too) and falls back to the phone's built-in voice for anything not recorded yet. To add a line, drop the mp3 in `voice/` and add it to `voice/lines.js`.

## Tests

The app has no build step; `package.json` exists only for tests.

- `npm test` runs the unit tests (`tests/unit.test.js`): lesson building for each mood, note and melody parsing, and checks that every recorded line has its file and still matches what the app says.
- `npm run smoke` opens every screen in a phone-sized Chromium with a fake microphone, starts a lesson, and fails on any JavaScript error (`tests/smoke.js`). Add `-- --shots <folder>` to save screenshots.

Both run on every pull request (`.github/workflows/test.yml`).

Design notes and the redesign plan are in [docs/lento-redesign.md](docs/lento-redesign.md).

## Next

Lento as a real ElevenLabs voice agent: a live coach you can talk back to, who runs the talking parts of the lesson while the app keeps doing the piano and pitch work.
