// Lento's voice running on the phone: Kokoro v1.0 (voice af_heart) via kokoro-js, for lines
// that aren't recorded in voice/ (ones with your song's name in them, for example).
// It runs in a worker so the piano and pitch tracking never stutter while she thinks.
// The model (about 90 MB) downloads the first time and is cached by the browser after that.
//
// Messages in:  { type: "load" }  |  { type: "say", id, text }
// Messages out: { type: "ready" } |  { type: "failed", error }  |  { type: "audio", id, audio, rate }  |  { type: "audio", id, error }

import { KokoroTTS } from "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/dist/kokoro.web.js";

const MODEL = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "af_heart", SPEED = 0.95; // keep in step with tools/render-voice.py

let loading = null;
function load() {
  loading ??= KokoroTTS.from_pretrained(MODEL, { dtype: "q8", device: "wasm" })
    .then((tts) => { postMessage({ type: "ready" }); return tts; })
    .catch((e) => { postMessage({ type: "failed", error: String(e?.message ?? e) }); throw e; });
  return loading;
}

// One line at a time, in order
let queue = Promise.resolve();
self.onmessage = ({ data }) => {
  if (data.type === "load") load().catch(() => {});
  if (data.type === "say") {
    queue = queue.then(async () => {
      try {
        const tts = await load();
        const out = await tts.generate(data.text.replace(/…/g, "..."), { voice: VOICE, speed: SPEED });
        postMessage({ type: "audio", id: data.id, audio: out.audio, rate: out.sampling_rate }, [out.audio.buffer]);
      } catch (e) {
        postMessage({ type: "audio", id: data.id, error: String(e?.message ?? e) });
      }
    });
  }
};
