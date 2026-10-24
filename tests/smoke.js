// Browser smoke test: opens every screen in a phone-sized Chromium with a fake mic,
// starts a lesson, and fails on any JavaScript error. Run with: npm run smoke
// Pass --shots <folder> to also save screenshots.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const shots = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : null;
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

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, permissions: ["microphone"] });
await context.addInitScript(() => localStorage.setItem("lentoMet", "1"));
// Pitch detection comes from a CDN. If it can't be reached (an offline sandbox), stand in
// a detector that hears nothing, so the rest of the app can still be checked.
await context.route("https://cdn.jsdelivr.net/npm/pitchy@*/**", async (route) => {
  try { await route.fulfill({ response: await route.fetch() }); } catch {
    await route.fulfill({ contentType: "text/javascript",
      body: "export class PitchDetector { static forFloat32Array() { return new PitchDetector(); } findPitch() { return [0, 0]; } }" });
  }
});
const failures = [];

async function open(name, path, check) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (r.url().startsWith(base) && r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
  try {
    await page.goto(base + path, { waitUntil: "load" });
    await page.locator("[data-sloth] svg").first().waitFor({ timeout: 10000 }); // the page's script ran
    await check?.(page);
    await page.waitForTimeout(500);
    if (shots) await page.screenshot({ path: join(shots, `${name}.png`) });
  } catch (e) { errors.push(e.message); }
  if (errors.length) failures.push(`${name}: ${errors.join("; ")}`);
  console.log(`${errors.length ? "✗" : "✓"} ${name}`);
  await page.close();
}

await open("today", "index.html", (p) => p.getByText("Start your vocal lesson").waitFor());
await open("welcome", "welcome.html", (p) => p.locator("#next").click());
await open("song", "song.html");
await open("tuner", "tuner.html");
await open("progress", "progress.html");
await open("privacy", "privacy.html", async (p) => { await p.locator("#wipe").click(); await p.locator("#wipe").click(); });
await open("feedback", "feedback.html?preview", async (p) => {
  await p.locator(".fb .up").click();
  await p.locator(".fb textarea").fill("Loved the piano");
  await p.locator(".fb .btn").click();
  await p.getByText("Thank you!").waitFor();
});
await open("lesson", "lesson.html", async (p) => {
  const voice = p.waitForResponse((r) => /\/voice\/.+\.mp3$/.test(r.url()), { timeout: 15000 }).catch(() => null);
  await p.locator("#moods .choice").first().click();
  await p.locator("#go").click();
  await p.locator("#stage").waitFor({ state: "visible", timeout: 15000 });
  if (!(await voice)) throw new Error("Lento's recorded voice never loaded");
  await p.locator("#upnext").waitFor({ state: "hidden", timeout: 20000 });
});

await browser.close();
server.close();
if (failures.length) { console.error("\n" + failures.join("\n")); process.exit(1); }
console.log("\nAll screens loaded with no errors.");
