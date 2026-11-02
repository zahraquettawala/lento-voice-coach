// A sampled grand piano: the Salamander Grand (a Yamaha C5, CC-BY 3.0 by Alexander Holm).
// Samples live in piano/ every 3 semitones (C, D#, F#, A from A1 to C7); other notes are
// the nearest sample slightly sped up or slowed down. Everything plays through a little
// room sound and a softened top end, so it feels like a piano in a living room.

const SAMPLE_NAMES = { 0: "C", 3: "Ds", 6: "Fs", 9: "A" };
const LOW = 33, HIGH = 96; // A1 to C7

// One shared output chain per audio context: warmth EQ, then dry + a short room reverb
const rooms = new WeakMap();
function roomFor(ctx, destination) {
  if (rooms.has(ctx)) return rooms.get(ctx);
  const input = ctx.createGain();
  input.gain.value = 3; // the Salamander recordings are quiet; bring them up to the old level
  const body = ctx.createBiquadFilter();
  body.type = "lowshelf"; body.frequency.value = 220; body.gain.value = 2.5;
  const soften = ctx.createBiquadFilter();
  soften.type = "highshelf"; soften.frequency.value = 4200; soften.gain.value = -5;
  input.connect(body).connect(soften);

  const dry = ctx.createGain(), wet = ctx.createGain(), reverb = ctx.createConvolver();
  dry.gain.value = 0.9; wet.gain.value = 0.22;
  reverb.buffer = roomImpulse(ctx, 1.8);
  soften.connect(dry).connect(destination);
  soften.connect(reverb).connect(wet).connect(destination);
  rooms.set(ctx, input);
  return input;
}

// A small wooden room: decaying noise, darker as it fades, with a few early reflections
function roomImpulse(ctx, seconds) {
  const rate = ctx.sampleRate, n = Math.floor(rate * seconds);
  const ir = ctx.createBuffer(2, n, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate;
      const k = 0.35 + 0.6 * Math.exp(-t * 3); // lowpass closes over time
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp(-t * 3.4);
    }
    for (const ms of [11, 19, 29, 41]) d[Math.floor((ms + ch * 3) * rate / 1000)] += 0.5 * Math.exp(-ms / 40);
  }
  return ir;
}

// `destination` lets the lesson route the piano through a meter, to tell it apart from your voice
export function createPiano(ctx, baseUrl = "piano/", destination = ctx.destination) {
  const buffers = new Map(); // sample midi -> Promise<AudioBuffer | null>
  const live = new Set();     // notes scheduled or sounding, so stopAll can silence them
  let generation = 0;         // bumped by stopAll so notes still loading never start
  const output = roomFor(ctx, destination);

  function sampleFor(midi) {
    return Math.max(LOW, Math.min(HIGH, Math.round(midi / 3) * 3));
  }

  function load(sampleMidi) {
    if (!buffers.has(sampleMidi)) {
      const name = SAMPLE_NAMES[sampleMidi % 12] + (Math.floor(sampleMidi / 12) - 1);
      buffers.set(sampleMidi, fetch(`${baseUrl}${name}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
        .then((data) => new Promise((resolve, reject) => ctx.decodeAudioData(data, resolve, reject)))
        .catch(() => null));
    }
    return buffers.get(sampleMidi);
  }

  // Load the samples a list of notes needs, so playback starts on time
  function preload(midis) {
    return Promise.all([...new Set(midis.map(sampleFor))].map(load));
  }

  // Play one note at audio time `when` for `duration` seconds
  async function play(midi, when = ctx.currentTime, duration = 1.2, volume = 0.9) {
    const s = sampleFor(midi);
    const gen = generation;
    const buffer = await load(s);
    if (gen !== generation) return;
    const out = ctx.createGain();
    out.connect(output);
    const release = 0.45; // the damper settling, not a hard cut
    // A touch of human variation in how hard each key is played
    const v = volume * (0.92 + Math.random() * 0.08);
    out.gain.setValueAtTime(v, when);
    out.gain.setValueAtTime(v, when + duration);
    out.gain.exponentialRampToValueAtTime(0.001, when + duration + release);

    if (buffer) {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.playbackRate.value = 2 ** ((midi - s) / 12);
      src.connect(out);
      src.start(when);
      src.stop(when + duration + release);
      track(src, out);
    } else {
      // Samples failed to load: fall back to a soft synth tone
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);
      const g = ctx.createGain();
      g.gain.value = 0.4;
      osc.connect(g).connect(out);
      osc.start(when);
      osc.stop(when + duration + release);
      track(osc, out);
    }
  }

  // A soft rolled chord, like a coach setting the key
  function chord(midis, when = ctx.currentTime, duration = 1.6, volume = 0.5) {
    midis.forEach((m, i) => play(m, when + i * 0.06, duration - i * 0.06, volume));
  }

  function track(node, out) {
    const note = { node, out };
    live.add(note);
    node.onended = () => live.delete(note);
  }

  // Silence everything now, including notes scheduled for later
  function stopAll() {
    generation++;
    const t = ctx.currentTime;
    for (const { node, out } of live) {
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.05);
      try { node.stop(t + 0.06); } catch {}
    }
    live.clear();
  }

  return { play, chord, preload, stopAll };
}
