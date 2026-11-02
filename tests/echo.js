// Echo test: does the lesson only hear your voice, not the piano coming back through the speaker?
// Runs one exercise in Chromium with a simulated mic that hears the app's own output (like a
// phone speaker without earbuds), plus an optional simulated singer. Run with: npm run echo
// Pass --shots <folder> to save screenshots of the pitch lane.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const shots = arg("--shots");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".mp3": "audio/mpeg", ".json": "application/json", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  if (path.endsWith("/")) path += "index.html";
  try {
    const body = await readFile(join(root, path));
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

// Everything the page sends to the speakers also leaks into the "mic" at `leak` volume.
// A simulated singer follows the target notes when `sing` is on.
function fakeRoom({ leak, sing, voice = 0.35 }) {
  const loops = new Map(); // context -> gain feeding its loopback stream
  let last = null;
  const loopFor = (ctx) => {
    if (!loops.has(ctx)) {
      const g = ctx.createGain(); g.gain.value = leak;
      const out = ctx.createMediaStreamDestination();
      g.connect(out);
      loops.set(ctx, { g, out });
    }
    return loops.get(ctx);
  };
  const connect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dest, ...rest) {
    if (dest instanceof AudioDestinationNode) { connect.call(this, loopFor(this.context).g); last = this.context; }
    return connect.call(this, dest, ...rest);
  };
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = last;
    const mix = ctx.createGain(), mic = ctx.createMediaStreamDestination();
    mix.connect(mic);
    for (const [c, { g, out }] of loops) {
      if (c === ctx) connect.call(g, mix);
      else connect.call(ctx.createMediaStreamSource(out.stream), mix); // Lento's talking voice
    }
    // The singer: a buzzy tone with vibrato through a vowel-ish filter
    const osc = ctx.createOscillator(), vib = ctx.createOscillator(), depth = ctx.createGain();
    const vowel = ctx.createBiquadFilter(), level = ctx.createGain();
    osc.type = "sawtooth"; vib.frequency.value = 5.5; depth.gain.value = 3;
    vowel.type = "lowpass"; vowel.frequency.value = 1400; level.gain.value = 0;
    connect.call(vib, depth); connect.call(depth, osc.frequency);
    connect.call(osc, vowel); connect.call(vowel, level); connect.call(level, mix);
    osc.start(); vib.start();
    window.__heard = [];
    let prev = null;
    const follow = () => {
      const lane = window.lento?.lane;
      const e = lane && !lane.demo && lane.pos !== null && lane.events.find((x) => x.scored && lane.pos >= x.start - 0.1 && lane.pos < x.start + x.beats);
      const t = ctx.currentTime;
      if (sing && e) {
        osc.frequency.setTargetAtTime(440 * 2 ** ((e.midi - 69) / 12), t, 0.02);
        level.gain.setTargetAtTime(voice, t, 0.03);
      } else level.gain.setTargetAtTime(0, t, 0.03);
      // A loop's results are set just before the next loop replaces the lane, so check the old one
      for (const l of [prev, lane]) {
        if (l?.results && !l.counted) {
          l.counted = true;
          const sung = l.voice.filter((p) => p.target !== null);
          window.__heard.push({ points: sung.length, pitched: sung.filter((p) => p.midi !== null).length, results: l.results.map((r) => r.kind), leak: window.lento.leak });
        }
      }
      prev = lane;
      requestAnimationFrame(follow);
    };
    follow();
    return mic.stream;
  };
}

async function run(name, room) {
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => {
    localStorage.setItem("lentoMet", "1");
    localStorage.setItem("workoutClimb", "1");  // three loops: up a half step and back
    localStorage.setItem("lessonDrill", "false"); // keep it moving, no stops to fix notes
  });
  await context.addInitScript(fakeRoom, room);
  const pitchy = process.env.PITCHY_FILE; // offline sandboxes can point this at a local copy
  if (pitchy) await context.route("https://cdn.jsdelivr.net/npm/pitchy@*/**", async (r) => r.fulfill({ contentType: "text/javascript", body: await readFile(pitchy, "utf8") }));
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`  page error: ${e.message}`));
  await page.goto(base + "lesson.html?only=hoo-triad&debug");
  await page.locator("#go").click();
  await page.locator("#stage").waitFor({ state: "visible" });
  await page.waitForFunction(() => window.__heard?.length >= 1, null, { timeout: 90000 }).catch(async (e) => {
    console.error(await page.evaluate(() => JSON.stringify({ says: document.getElementById("says")?.textContent, error: document.getElementById("error")?.textContent, heard: window.__heard, lane: !!window.lento?.lane })));
    throw e;
  });
  if (shots) {
    // Near the end of a loop, so the lane shows a whole phrase of what the mic heard
    await page.waitForFunction(() => { const l = window.lento.lane; return l && !l.demo && l.pos > l.beats - 1.2; }, null, { timeout: 30000 });
    await page.screenshot({ path: join(shots, `${name}.png`) });
  }
  const heard = await page.evaluate(() => window.__heard);
  await browser.close();
  const points = heard.reduce((n, h) => n + h.points, 0), pitched = heard.reduce((n, h) => n + h.pitched, 0);
  const share = points ? pitched / points : 0;
  console.log(`${name}: heard a pitch in ${Math.round(share * 100)}% of sung moments; notes ${heard.map((h) => h.results.join(" ")).join(" | ")}`);
  return { heard, share };
}

const failures = [];
const silent = await run("silent-with-speaker", { leak: 0.5, sing: false });
if (silent.share > 0.05) failures.push("With nobody singing, the piano through the speaker was still heard as singing");
const singing = await run("singing-with-speaker", { leak: 0.5, sing: true });
if (singing.share < 0.6) failures.push("A singer over the speaker's piano wasn't heard");
const earbuds = await run("singing-with-earbuds", { leak: 0, sing: true });
if (earbuds.share < 0.6) failures.push("A singer with earbuds wasn't heard");

server.close();
if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
console.log("\nOnly the voice is heard, not the piano.");
