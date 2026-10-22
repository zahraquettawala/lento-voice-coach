// Shared bits of the app shell: the bottom tab bar with Lento's big Sing button in the middle.

const ICONS = {
  today: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z"/></svg>`,
  song: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>`,
  sing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`,
  progress: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8"/></svg>`,
  tuner: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 12h2M8 8v8M12 5v14M16 9v6M20 11v2"/></svg>`,
};

export function tabbar(active) {
  const tabs = [["today", "Today", "./"], ["song", "Song", "song.html"], ["sing", "Sing", "lesson.html"], ["progress", "Progress", "progress.html"], ["tuner", "Tuner", "tuner.html"]];
  const bar = document.createElement("div");
  bar.className = "tabbar";
  bar.innerHTML = `<nav>${tabs.map(([id, name, href]) => id === "sing"
    ? `<a href="${href}" class="sing" aria-label="Start your vocal lesson"><span>${ICONS.sing}</span>${name}</a>`
    : `<a href="${href}" class="${id === active ? "on" : ""}" ${id === active ? 'aria-current="page"' : ""}>${ICONS[id]}${name}</a>`).join("")}</nav>`;
  document.body.append(bar);
}

// A pull-up sheet: tap the backdrop, the handle, or swipe down to close
export function sheet(el) {
  const back = document.createElement("div");
  back.className = "sheet-backdrop";
  el.before(back);
  el.classList.add("sheet");
  el.insertAdjacentHTML("afterbegin", `<div class="sheet-handle" aria-hidden="true"></div>`);
  const open = () => { back.classList.add("open"); el.classList.add("open"); el.style.transform = ""; };
  const close = () => { back.classList.remove("open"); el.classList.remove("open"); el.style.transform = ""; };
  back.onclick = close;
  el.querySelector(".sheet-handle").onclick = close;
  let startY = null;
  el.addEventListener("touchstart", (e) => { if (el.scrollTop <= 0) startY = e.touches[0].clientY; }, { passive: true });
  el.addEventListener("touchmove", (e) => {
    if (startY === null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) el.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  el.addEventListener("touchend", (e) => {
    if (startY === null) return;
    const dy = e.changedTouches[0].clientY - startY;
    startY = null;
    dy > 80 ? close() : (el.style.transform = "");
  });
  return { open, close, toggle: () => (el.classList.contains("open") ? close() : open()) };
}

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
