// A small piano keyboard on a canvas. Lights the note to sing and dots the note you're singing.

const BLACK = new Set([1, 3, 6, 8, 10]);
const NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// lo should be a C; the keyboard runs through the B of the last octave that contains hi
export function keyRange(lowest, highest) {
  const lo = 12 * Math.floor(lowest / 12);
  return { lo, hi: 12 * Math.floor(highest / 12) + 11 };
}

export function drawKeys(canvas, { lo, hi, lit = null, voice = null, voiceKind = "" }) {
  const g = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const whites = [];
  for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
  const kw = w / whites.length, bw = kw * 0.62, bh = h * 0.6;
  const xOf = new Map();
  whites.forEach((m, i) => xOf.set(m, i * kw));
  for (let m = lo; m <= hi; m++) if (BLACK.has(m % 12)) xOf.set(m, xOf.get(m - 1) + kw - bw / 2);

  // Fold your voice into the keyboard's range so any octave shows up
  let v = voice === null ? null : Math.round(voice);
  if (v !== null) { while (v < lo) v += 12; while (v > hi) v -= 12; }

  const accent = css("--accent"), line = "#e4dbd6"; // the keys look like real keys in any theme
  const dotColor = voiceKind === "ok" ? css("--ok") : voiceKind === "low" ? css("--low") : voiceKind === "high" ? css("--high") : "#2b2226";
  const dot = (m, x, kwid, bottom) => {
    if (m !== v) return;
    g.beginPath(); g.arc(x + kwid / 2, bottom - 9, 4, 0, Math.PI * 2);
    g.fillStyle = dotColor; g.fill();
  };

  for (const m of whites) {
    const x = xOf.get(m);
    g.beginPath(); g.roundRect(x + 0.5, 0.5, kw - 1, h - 1, [0, 0, 5, 5]);
    g.fillStyle = m === lit ? accent : "#fffdfa"; g.fill();
    g.strokeStyle = line; g.lineWidth = 1; g.stroke();
    if (m % 12 === 0 || m === lit) {
      g.font = `600 ${Math.min(10, kw * 0.42)}px Inter, -apple-system, sans-serif`;
      g.textAlign = "center";
      g.fillStyle = m === lit ? "#fff" : "#a3969b";
      g.fillText(NAMES[m % 12] + (Math.floor(m / 12) - 1), x + kw / 2, h - 7);
    }
    if (m !== lit) dot(m, x, kw, h - 12);
  }
  for (let m = lo; m <= hi; m++) {
    if (!BLACK.has(m % 12)) continue;
    const x = xOf.get(m);
    g.beginPath(); g.roundRect(x, 0, bw, bh, [0, 0, 3, 3]);
    g.fillStyle = m === lit ? accent : "#2b2226"; g.fill();
    if (m === v) { g.beginPath(); g.arc(x + bw / 2, bh - 8, 3, 0, Math.PI * 2); g.fillStyle = m === lit ? "#fff" : dotColor; g.fill(); }
  }
  // Your voice on the lit key: a ring so both show
  if (v !== null && v === lit && !BLACK.has(v % 12)) {
    const x = xOf.get(v);
    g.beginPath(); g.arc(x + kw / 2, h - 30, 4, 0, Math.PI * 2);
    g.fillStyle = "#fff"; g.fill();
  }
}
