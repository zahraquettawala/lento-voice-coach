// Talking with Lento, voice first. There's no chat screen: Lento talks right where you are,
// her latest sentence shows in her speech bubble, and a small label always says whether she's
// speaking, listening, or muted. The full transcript is tucked behind a link.

import { startCoach, coachMode } from "./coach.js";
import { setMood } from "./sloth.js";

const ICON = {
  speaker: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  micOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/></svg>`,
  dots: `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>`,
};

const CSS = `
.talkbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.talkbar[hidden] { display: none; }
.talk-pill { display: inline-flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: 999px;
  background: var(--surface); border: 1px solid var(--line); box-shadow: var(--shadow); font-size: 14.5px; font-weight: 600; color: var(--ink); }
.talk-pill svg { width: 18px; height: 18px; flex: none; }
.talk-pill .kind { font-weight: 500; color: var(--ink-3); }
.talkbar.speaking .talk-pill { border-color: var(--accent); color: var(--accent-ink); }
.talkbar.speaking .talk-pill svg { animation: talkPulse 1.1s ease-in-out infinite; }
.talkbar.listening .talk-pill svg { color: var(--ok); animation: talkBlink 1.4s ease-in-out infinite; }
@keyframes talkPulse { 50% { transform: scale(1.15); } }
@keyframes talkBlink { 50% { opacity: .35; } }
.talk-heard { font-size: 14px; color: var(--ink-3); max-width: 320px; text-align: center; }
.talk-heard:not(:empty)::before { content: "You: "; font-weight: 600; }
.talk-actions { display: flex; gap: 4px; white-space: nowrap; }
.talk-actions button { font-size: 14px; font-weight: 600; color: var(--ink-2); padding: 6px 12px; border-radius: 12px; display: inline-flex; align-items: center; gap: 6px; }
.talk-actions button svg { width: 16px; height: 16px; }
.talk-log { width: 100%; max-height: 32vh; overflow-y: auto; text-align: left; font-size: 14px; line-height: 1.45; color: var(--ink-2);
  background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: 10px 14px; }
.talk-log p { margin: 0 0 6px; } .talk-log b { color: var(--ink); }
.lento-big.talking { animation: talkBob .9s ease-in-out infinite; }
@keyframes talkBob { 50% { transform: translateY(-4px) rotate(-1deg); } }
`;

let styled = false;
let current = null; // the conversation that's running, if any

// Talk with Lento on the current screen.
//   bubble: where her latest sentence goes; sloth: her picture (for moods);
//   after: the talk bar goes right after this element.
// Resolves when the conversation is over.
export function talkWithLento({ moment, variables, tools, bubble, sloth, after }) {
  if (!styled) { const st = document.createElement("style"); st.textContent = CSS; document.head.append(st); styled = true; }
  current?.stop();

  const bar = document.createElement("div");
  bar.className = "talkbar fade-in";
  bar.innerHTML = `
    <div class="talk-pill" role="status" aria-live="polite"><span class="ic">${ICON.dots}</span><span class="txt">Connecting…</span></div>
    <div class="talk-heard"></div>
    <div class="talk-actions">
      <button class="mute">${ICON.mic}<span>Mute</span></button>
      <button class="log-btn">Transcript</button>
      <button class="stop">Stop</button>
    </div>
    <div class="talk-log" hidden></div>`;
  after.after(bar);
  const q = (s) => bar.querySelector(s);
  const swayer = sloth.closest(".lento-big");
  const practice = coachMode() === "mock";

  const pill = (icon, text, kind = "Voice chat") => {
    q(".talk-pill .ic").innerHTML = icon;
    q(".talk-pill .txt").innerHTML = `${text} <span class="kind">· ${practice ? "practice" : kind}</span>`;
  };
  const log = (who, text) => {
    const p = document.createElement("p");
    p.innerHTML = `<b>${who === "lento" ? "Lento" : "You"}:</b> `;
    p.append(text);
    q(".talk-log").append(p);
  };
  const say = (text) => {
    bubble.hidden = false;
    bubble.textContent = text;
    bubble.classList.remove("fade-in"); void bubble.offsetWidth; bubble.classList.add("fade-in");
  };

  let muted = false, handle = null, done;
  const finished = new Promise((r) => (done = r));
  const stop = () => {
    if (!bar.isConnected) return;
    handle?.end();
    swayer?.classList.remove("talking");
    bar.remove();
    current = null;
    done();
  };
  current = { stop };

  q(".mute").onclick = () => {
    muted = !muted;
    handle?.setMuted(muted);
    q(".mute").innerHTML = `${muted ? ICON.micOff : ICON.mic}<span>${muted ? "Unmute" : "Mute"}</span>`;
    if (muted) pill(ICON.micOff, "Muted. Lento can't hear you");
  };
  q(".log-btn").onclick = () => {
    const log = q(".talk-log");
    log.hidden = !log.hidden;
    q(".log-btn").textContent = log.hidden ? "Transcript" : "Hide transcript";
  };
  q(".stop").onclick = stop;

  startCoach({
    moment, variables,
    tools: { ...tools, set_lento_mood: (p) => { setMood(sloth, p.mood); return tools.set_lento_mood?.(p) ?? "ok"; } },
    onLine: ({ who, text }) => {
      log(who, text);
      if (who === "lento") { say(text); q(".talk-heard").textContent = ""; }
      else q(".talk-heard").textContent = text;
    },
    onMode: (mode) => {
      bar.classList.toggle("speaking", mode === "speaking");
      bar.classList.toggle("listening", mode === "listening");
      swayer?.classList.toggle("talking", mode === "speaking");
      if (muted) return;
      if (mode === "speaking") pill(ICON.speaker, "Lento is speaking");
      else pill(ICON.mic, "Listening, just talk");
    },
    onStatus: (s, why) => {
      if (s === "connected" && !muted) pill(ICON.mic, "Listening, just talk");
      if (s === "error") {
        pill(ICON.micOff, "Lento can't talk right now", "offline");
        say(why === "limit" ? "That's all the chatting for today. Let's just sing!" : "I can't connect right now, but we can still sing.");
        setTimeout(stop, 3500);
      }
      if (s === "ended") setTimeout(stop, 600);
    },
  }).then((h) => { handle = h; if (!bar.isConnected) h.end(); });

  return finished;
}

export function stopTalking() {
  current?.stop();
}
