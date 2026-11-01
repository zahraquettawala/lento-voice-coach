// Checks that Lento's on-phone voice really works: downloads the Kokoro model (about 90 MB)
// in Chromium, has voice/kokoro-worker.js say a line that isn't recorded, and checks the
// audio that comes back. Needs the internet. Run with: npm run kokoro
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const TYPES = { ".html": "text/html", ".js": "text/javascript" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try { res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" }).end(await readFile(join(root, path))); }
  catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + "privacy.html");
const started = Date.now();
const result = await page.evaluate((url) => new Promise((resolve) => {
  const w = new Worker(url, { type: "module" });
  w.onerror = (e) => resolve({ error: `worker: ${e.message ?? "failed to start"}` });
  w.onmessage = ({ data }) => {
    if (data.type === "failed") resolve({ error: data.error });
    if (data.type === "ready") { resolve.loadedAt = Date.now(); w.postMessage({ type: "say", id: 1, text: "Let's sing Chorus from Golden Hour. Here's your starting note." }); }
    if (data.type === "audio") resolve(data.error ? { error: data.error } : {
      seconds: data.audio.length / data.rate, rate: data.rate,
      peak: data.audio.reduce((m, x) => Math.max(m, Math.abs(x)), 0),
    });
  };
  w.postMessage({ type: "load" });
  setTimeout(() => resolve({ error: "timed out after 5 minutes" }), 300000);
}), base + "voice/kokoro-worker.js");
await browser.close();
server.close();

const took = ((Date.now() - started) / 1000).toFixed(0);
if (result.error || !(result.seconds > 2 && result.seconds < 10 && result.peak > 0.05)) {
  console.error("✗ Kokoro on the phone didn't work:", JSON.stringify(result));
  process.exit(1);
}
console.log(`✓ Kokoro said a ${result.seconds.toFixed(1)}s line at ${result.rate} Hz (${took}s including the download)`);
