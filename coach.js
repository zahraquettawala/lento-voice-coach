// Lento the live coach: a real conversation with Lento through an ElevenLabs agent.
// The agent is the teacher (talks, listens to what you say, decides). The app is the piano,
// tuner and room: it does all the pitch work and hands the results to the agent as tools.
// Lento only connects for the talking parts (before and after the lesson), never while you sing.
//
// Two modes:
//   live: talks to ElevenLabs through our small key server (coach/worker). Costs credits.
//   mock: a scripted practice conversation that runs the same tools with no network calls.
//         Open lesson.html?coach=mock to try it. Costs nothing.

// The key server's address. Empty means the live coach is off and the app works as before.
export const COACH_URL = "";

const SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.26.0/+esm";
const MAX_SECONDS = 180; // hang up after 3 minutes no matter what, to protect credits

export function coachMode() {
  const q = new URLSearchParams(location.search).get("coach");
  if (q === "off") return null;
  if (q === "mock") return "mock";
  return COACH_URL ? "live" : null;
}

// Start a conversation. `moment` is "checkin" or "debrief".
// `tools` are the app functions the agent can call. Callbacks:
//   onLine({ who: "lento" | "you", text })  a line of the conversation, as captions
//   onMode("speaking" | "listening")         who's talking right now
//   onStatus("connecting" | "connected" | "ended" | "error", detail?)
// Returns { end(), setMuted(bool) }.
export async function startCoach({ moment, variables, tools, onLine, onMode, onStatus }) {
  const mode = coachMode();
  if (mode === "mock") return startMock({ moment, variables, tools, onLine, onMode, onStatus });
  if (mode !== "live") throw new Error("The live coach is off");

  onStatus("connecting");
  let session;
  try {
    // 1. Ask our key server for a one-time pass. The ElevenLabs key never reaches the phone.
    const res = await fetch(`${COACH_URL}/session`, { method: "POST" });
    if (!res.ok) {
      const why = res.status === 429 ? "limit" : "server";
      onStatus("error", why);
      return { end() {}, setMuted() {} };
    }
    const { token } = await res.json();

    // 2. Connect. WebRTC gives the best echo cancellation on iPhone.
    const { Conversation } = await import(SDK);
    session = await Conversation.startSession({
      conversationToken: token,
      connectionType: "webrtc",
      dynamicVariables: { moment, ...variables },
      clientTools: tools,
      onMessage: ({ message, role, source }) => onLine({ who: (role ?? (source === "ai" ? "agent" : "user")) === "agent" ? "lento" : "you", text: message }),
      onModeChange: ({ mode }) => onMode(mode),
      onStatusChange: ({ status }) => status === "connected" && onStatus("connected"),
      onDisconnect: () => { clearTimeout(timer); onStatus("ended"); },
      onError: (message) => { console.warn("Lento coach:", message); onStatus("error", "connection"); },
    });
  } catch (e) {
    console.warn("Lento coach:", e);
    onStatus("error", "connection");
    return { end() {}, setMuted() {} };
  }
  const timer = setTimeout(() => session.endSession(), MAX_SECONDS * 1000);
  return {
    end: () => { clearTimeout(timer); return session.endSession(); },
    setMuted: (m) => session.setMicMuted(m),
  };
}

// ---------- Practice mode ----------
// Plays out a believable conversation, calling the real app tools, so the whole flow can be
// seen and screenshotted without spending anything.
const SCRIPTS = {
  checkin: async ({ say, hear, tool, variables }) => {
    await say(variables.opening_line);
    await hear("Honestly a little tired. Long day at work.");
    await tool("set_lento_mood", { mood: "sleepy" });
    const plan = await tool("build_lesson", { mood: "tired" });
    const minutes = /About (\d+) minutes/.exec(plan)?.[1] ?? "15";
    await say(`Long days are exactly why we slow down. Let's go easy: gentle warm-ups, nothing too high, about ${minutes} minutes. Sound good?`);
    await hear("Yeah, let's do it.");
    await tool("set_lento_mood", { mood: "happy" });
    await say("Pop in your earbuds. I'll sing each one first, then it's your turn.");
    await tool("start_lesson", {});
  },
  debrief: async ({ say, hear, tool }) => {
    const results = await tool("get_lesson_results", {});
    const overall = /Overall (\d+)%/.exec(results)?.[1];
    const weak = /([^.:]+): (\d+)% on pitch, tended to go (flat|sharp|breathy)/.exec(results);
    await tool("set_lento_mood", { mood: "proud" });
    const score = !overall ? "" : overall >= 50 ? ` ${overall} percent of your notes were right on pitch.` : " That was a tricky one today, and that's okay.";
    await say(`That's your lesson!${score}${weak ? ` ${weak[1].trim()} went a little ${weak[3]}, so that's our thing to watch.` : ""} How did that feel?`);
    await hear("Good! The higher notes felt harder.");
    await say(weak?.[3] === "flat" ? "That's really common. Up high, think of the note as a little higher than you hear it. Next time we'll start that one slower." :
      "That's normal. We'll keep building up there slowly. Next time I'll start you a little lower and climb.");
    await hear("Okay, thanks Lento.");
    await say("I'm proud of you. See you tomorrow.");
  },
};

function startMock({ moment, variables, tools, onLine, onMode, onStatus }) {
  let over = false;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const guard = () => { if (over) throw new Error("ended"); };
  const ctx = {
    variables,
    say: async (text) => {
      guard(); onMode("speaking"); onLine({ who: "lento", text });
      await pause(900 + text.length * 45); guard();
    },
    hear: async (text) => {
      guard(); onMode("listening"); await pause(1400); guard();
      onLine({ who: "you", text }); await pause(500); guard();
    },
    tool: async (name, params) => {
      guard();
      const out = await tools[name]?.(params);
      guard();
      return out ?? "";
    },
  };
  onStatus("connecting");
  setTimeout(async () => {
    if (over) return;
    onStatus("connected");
    try { await SCRIPTS[moment](ctx); } catch {}
    if (!over) { over = true; onStatus("ended"); }
  }, 700);
  return {
    end: () => { if (!over) { over = true; onStatus("ended"); } },
    setMuted() {},
  };
}
