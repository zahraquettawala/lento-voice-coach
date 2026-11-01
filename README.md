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
- **Send feedback** (`feedback.html`, linked from Progress): the same thumbs up/down card that shows at the end of a lesson, with an optional note and an optional email if it's OK to reply.

Six looks, picked in lesson settings: Neutral (the default), Sunny, Lemon, Studio, Night and Forest. Add it to your home screen in Safari (Share, then Add to Home Screen) and it opens full screen like an app.

Wear wired earbuds so the mic hears you, not the piano. Within 25 cents of the target counts as on pitch, so vibrato isn't penalized.

## Code

`exercises.js` is the exercise library, `lesson.js` builds each day's lesson, `song.js` stores your song, `store.js` saves lessons on the phone (localStorage), `piano.js` plays the grand piano, `sing.js` is Lento's singing voice for demos, `voice.js` is her speaking voice, `sloth.js` draws her, `keys.js` draws the keyboard, `ui.js` is the tab bar, and `theme.css` is the design system. No build step. `warmup.html` redirects old links to the lesson.

Pitch detection runs in the browser with [Pitchy](https://github.com/ianprime0509/pitchy). The piano is the [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3) (a Yamaha C5, CC-BY 3.0, Alexander Holm), via [Tone.js audio](https://github.com/Tonejs/audio). Nothing is recorded; practice history stays on your phone.

## Lento's voice

Lento speaks with [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) v1.0 (voice `af_heart`, speed 0.95), an open-source voice that's free to use (Apache 2.0). There's no server, no API key and no cost per use.

- **Set lines** (57 of them: coaching, feedback, the welcome, and every exercise's introduction) are rendered ahead of time and ship as mp3s in `voice/`, so they play instantly. `voice/lines.js` lists each line and its file; two recorded lines in a row work too.
- **Lines that change**, like the ones with your song's name in them, are spoken by the same voice running on the phone: `voice/kokoro-worker.js` runs [kokoro-js](https://www.npmjs.com/package/kokoro-js) in a web worker (8-bit model, about 90 MB, downloaded once when you start a lesson and cached after that). The text never leaves the phone. During a lesson, the next song line is made ahead of time while you sing.
- Until the model has downloaded, or if the phone can't run it, the phone's built-in voice steps in.

To add a set line, add it to `voice/lines.js` and run `python tools/render-voice.py` (setup steps are at the top of that file); it renders only the files that are missing.

## Usage and feedback

`analytics.js` sends anonymous counts to [PostHog](https://posthog.com): page views, saved lessons (minutes, mood, accuracy), whether the mic was allowed, and JavaScript errors. No audio, no cookies (a random id in localStorage), no autocapture. It's off until `POSTHOG_KEY` is set, and always off in tests and on localhost. `feedback.js` sends feedback to a PostHog survey (`FEEDBACK_SURVEY_ID`); if someone leaves an email, it's saved on their PostHog profile so their feedback sits next to their lessons.

## Tests

The app has no build step; `package.json` exists only for tests.

- `npm test` runs the unit tests (`tests/unit.test.js`): lesson building for each mood, note and melody parsing, and checks that every recorded line has its file and still matches what the app says, and that every exercise's introduction is recorded.
- `npm run kokoro` downloads the real Kokoro model in Chromium and checks the on-phone voice says a line (`tests/kokoro.js`). It needs the internet.
- `npm run smoke` opens every screen in a phone-sized Chromium with a fake microphone, starts a lesson, and fails on any JavaScript error (`tests/smoke.js`). Add `-- --shots <folder>` to save screenshots.

All three run on every pull request (`.github/workflows/test.yml`).

Design notes and the redesign plan are in [docs/lento-redesign.md](docs/lento-redesign.md).

## Next

Lento as a real ElevenLabs voice agent: a live coach you can talk back to, who runs the talking parts of the lesson while the app keeps doing the piano and pitch work.
