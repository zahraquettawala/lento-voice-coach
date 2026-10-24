// The talk screen: Lento's face, who's talking, live captions, and Mute / End.
// Opens on top of whatever screen you're on and closes when the conversation ends.

import { startCoach, coachMode } from "./coach.js";
import { setMood } from "./sloth.js";

const MIC = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
const MIC_OFF = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/></svg>`;

const CSS = `
#talk { position: fixed; inset: 0; z-index: 25; background: var(--bg); display: flex; justify-content: center; }
#talk[hidden] { display: none; }
#talk .inner { width: 100%; max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: 14px;
  padding: max(18px, env(safe-area-inset-top)) 22px calc(20px + env(safe-area-inset-bottom)); }
#talk .top { width: 100%; display: flex; justify-content: space-between; align-items: center; min-height: 24px; }
#talk .badge { font-size: 11.5px; font-weight: 600; color: var(--ink-3); border: 1px solid var(--line); border-radius: 999px; padding: 3px 9px; }
#talk .face { position: relative; width: 168px; height: 168px; margin-top: 8px; border-radius: 50%; background: var(--accent-soft); display: grid; place-items: center; }
#talk .face > div { width: 150px; height: 150px; margin-top: 16px; }
#talk .face::before { content: ""; position: absolute; inset: -8px; border-radius: 50%; border: 3px solid var(--accent); opacity: 0; transform: scale(.94); transition: opacity .3s, transform .3s; }
#talk.speaking .face::before { opacity: .55; animation: talkPulse 1.3s ease-in-out infinite; }
@keyframes talkPulse { 50% { transform: scale(1.04); opacity: .25; } }
#talk .status { font-size: 14px; font-weight: 600; color: var(--ink-2); min-height: 20px; display: flex; align-items: center; gap: 8px; }
#talk .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); }
#talk.listening .status i { background: var(--ok); animation: talkBlink 1.2s ease-in-out infinite; }
#talk.speaking .status i { background: var(--accent); }
@keyframes talkBlink { 50% { opacity: .3; } }
#talk .lines { width: 100%; flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding: 6px 2px;
  mask-image: linear-gradient(to bottom, transparent, #000 28px); -webkit-mask-image: linear-gradient(to bottom, transparent, #000 28px); }
#talk .line { max-width: 86%; padding: 10px 14px; border-radius: 18px; font-size: 15.5px; line-height: 1.4; animation: talkIn .25s ease-out; }
#talk .line.lento { align-self: flex-start; background: var(--surface); border: 1px solid var(--line); border-bottom-left-radius: 5px; box-shadow: var(--shadow); }
#talk .line.you { align-self: flex-end; background: var(--accent-soft); color: var(--ink); border-bottom-right-radius: 5px; }
#talk .line.note { align-self: center; max-width: 100%; font-size: 13px; color: var(--ink-3); padding: 2px; }
@keyframes talkIn { from { opacity: 0; transform: translateY(6px); } }
#talk .row2 { width: 100%; display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
#talk .row2 .btn { width: 100%; }
`;

let el, handle, finished;

function build() {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  el = document.createElement("section");
  el.id = "talk";
  el.hidden = true;
  el.setAttribute("aria-label", "Talking with Lento");
  el.innerHTML = `<div class="inner">
    <div class="top"><span class="eyebrow">Talking with Lento</span><span class="badge" id="talkBadge" hidden>Practice mode · no credits used</span></div>
    <div class="face"><div id="talkFace" data-sloth="happy" data-pose="head"></div></div>
    <div class="status" id="talkStatus"><i></i><span>Connecting…</span></div>
    <div class="lines" id="talkLines" aria-live="polite"></div>
    <div class="row2">
      <button class="btn ghost" id="talkMute">${MIC}<span>Mute</span></button>
      <button class="btn" id="talkEnd">End chat</button>
    </div>
  </div>`;
  document.body.append(el);
  setMood(el.querySelector("#talkFace"), "happy");
}

const $ = (id) => el.querySelector("#" + id);

function status(text) { $("talkStatus").querySelector("span").textContent = text; }

function addLine(who, text) {
  const d = document.createElement("div");
  d.className = "line " + who;
  d.textContent = text;
  $("talkLines").append(d);
  $("talkLines").scrollTop = $("talkLines").scrollHeight;
}

// Lento's face, so the agent can look happy, proud, sleepy and so on
export function faceMood(mood) {
  if (el) setMood($("talkFace"), mood);
}

export function close() {
  if (!el || el.hidden) return;
  handle?.end();
  el.hidden = true;
  finished?.();
}

// Open the talk screen and start talking. Resolves when the chat is over.
export function talkWithLento({ moment, variables, tools }) {
  if (!el) build();
  $("talkLines").innerHTML = "";
  $("talkBadge").hidden = coachMode() !== "mock";
  el.className = "";
  faceMood(moment === "debrief" ? "proud" : "happy");
  status("Connecting…");
  el.hidden = false;

  let muted = false;
  $("talkMute").onclick = () => {
    muted = !muted;
    handle?.setMuted(muted);
    $("talkMute").innerHTML = `${muted ? MIC_OFF : MIC}<span>${muted ? "Unmute" : "Mute"}</span>`;
  };
  $("talkEnd").onclick = close;

  return new Promise(async (resolve) => {
    finished = resolve;
    handle = await startCoach({
      moment, variables, tools,
      onLine: ({ who, text }) => addLine(who, text),
      onMode: (mode) => {
        el.className = mode;
        status(mode === "speaking" ? "Lento is talking" : "Listening… just talk");
      },
      onStatus: (s, why) => {
        if (s === "connected") status("Listening… just talk");
        if (s === "error") {
          el.className = "";
          status("Lento can't talk right now");
          addLine("note", why === "limit" ? "That's all the chatting for today. Lento will be back tomorrow." : "Couldn't connect. You can still do the lesson as usual.");
        }
        if (s === "ended") {
          el.className = "";
          status("Chat ended");
          setTimeout(close, 900);
        }
      },
    });
  });
}
