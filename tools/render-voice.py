# Renders Lento's lines in voice/lines.js to mp3s in voice/ with Kokoro v1.0 (voice af_heart),
# the same voice the app runs on the phone for anything not listed. Only missing files are
# rendered; pass --all to redo every line.
#
# Setup, once:
#   pip install kokoro-onnx soundfile        (and ffmpeg on your PATH)
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
#   curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
# Then: python tools/render-voice.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin

import argparse, os, re, subprocess, tempfile
import soundfile as sf
from kokoro_onnx import Kokoro

VOICE, SPEED, LANG = "af_heart", 0.95, "en-us"  # keep in step with voice/kokoro-worker.js

root = os.path.join(os.path.dirname(__file__), "..")
ap = argparse.ArgumentParser()
ap.add_argument("--model", default="kokoro-v1.0.onnx")
ap.add_argument("--voices", default="voices-v1.0.bin")
ap.add_argument("--all", action="store_true")
args = ap.parse_args()

src = open(os.path.join(root, "voice", "lines.js"), encoding="utf-8").read()
lines = re.findall(r'^\s*"(.+?)":\s*"(.+?)",?$', src, re.M)
kokoro = Kokoro(args.model, args.voices)
# Trim silence at both ends so lines play back to back without gaps
trim = "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse"

with tempfile.TemporaryDirectory() as tmp:
    for text, file in lines:
        out = os.path.join(root, "voice", file)
        if os.path.exists(out) and not args.all:
            continue
        samples, rate = kokoro.create(text.replace("…", "..."), voice=VOICE, speed=SPEED, lang=LANG)
        wav = os.path.join(tmp, "line.wav")
        sf.write(wav, samples, rate)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", trim, "-ac", "1", "-b:a", "64k", out], check=True)
        print(f"{file}  {len(samples) / rate:.1f}s")
