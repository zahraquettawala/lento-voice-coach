// "How was today's lesson?": a thumbs up or down, then an optional note and an optional
// email if it's OK to reply. Shown at the end of a lesson and on the feedback page.
// Hidden while analytics is off, since there'd be nowhere for the answer to go.

import { analyticsOn, sendFeedback } from "./analytics.js";

const THUMB = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 2 2v4h5.5a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.3 20H7"/></svg>`;

const STYLE = `
  .fb { width: 100%; padding: 16px; display: flex; flex-direction: column; gap: 10px; text-align: center; }
  .fb .q { font-weight: 600; font-size: 15px; }
  .fb .thumbs { display: flex; gap: 10px; justify-content: center; }
  .fb .thumbs button { width: 64px; height: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink-2); display: grid; place-items: center; }
  .fb .thumbs button.on { background: var(--accent-soft); color: var(--accent-ink); border-color: var(--accent-ink); }
  .fb .thumbs .down svg { transform: scaleY(-1); }
  .fb textarea, .fb input { width: 100%; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); padding: 12px 14px; font: inherit; font-size: 16px; color: var(--ink); text-align: left; }
  .fb textarea { min-height: 84px; resize: vertical; }
  .fb .fine { font-size: 12.5px; color: var(--ink-3); text-align: left; }
  .fb .btn { width: 100%; }
`;

export function feedbackCard({ where, question = "How was today's lesson?" }) {
  if (!document.getElementById("fb-style")) {
    document.head.insertAdjacentHTML("beforeend", `<style id="fb-style">${STYLE}</style>`);
  }
  const card = document.createElement("section");
  card.className = "card fb";
  card.innerHTML = `
    <div class="q">${question}</div>
    <div class="thumbs">
      <button class="up" aria-label="Good">${THUMB}</button>
      <button class="down" aria-label="Not great">${THUMB}</button>
    </div>
    <div class="more" style="display:none">
      <textarea placeholder="Anything you'd tell Lento? (optional)" aria-label="Your feedback"></textarea>
      <input type="email" placeholder="Email, if OK to reply (optional)" aria-label="Your email" autocomplete="email">
      <div class="fine">Your email is only used to reply or send Lento news.</div>
      <button class="btn accent">Send</button>
    </div>`;
  const $ = (s) => card.querySelector(s);
  let rating = null;
  for (const [cls, value] of [["up", "good"], ["down", "not great"]]) {
    $("." + cls).onclick = () => {
      rating = value;
      card.querySelectorAll(".thumbs button").forEach((b) => b.classList.toggle("on", b.classList.contains(cls)));
      $(".more").style.display = "contents";
    };
  }
  $(".more .btn").onclick = () => {
    const email = $("input").value.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { $("input").focus(); return; }
    sendFeedback({ rating, text: $("textarea").value.trim().slice(0, 2000), email, where });
    card.innerHTML = `<div class="q">Thank you!</div><div class="sub">Every note gets read.</div>`;
  };
  return card;
}

// At the end of a lesson, add the card above the Continue button once the done screen shows
export function askAtLessonEnd() {
  const done = document.getElementById("done");
  if (!analyticsOn || !done) return;
  let shown = false;
  new MutationObserver(() => {
    if (done.hidden || shown) return;
    shown = true;
    const card = feedbackCard({ where: "lesson end" });
    const cta = done.querySelector(".btn.accent");
    cta ? cta.before(card) : done.append(card);
  }).observe(done, { attributes: true, attributeFilter: ["hidden"] });
}

askAtLessonEnd(); // does nothing on pages without a lesson
