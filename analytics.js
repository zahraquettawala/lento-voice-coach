// Anonymous usage counts with PostHog: visits, finished lessons, mic problems and errors,
// so we can see whether people use Lento and where they drop off. Never any audio,
// no cookies (it keeps a random id in this browser), no autocapture of what people type.
// Off until POSTHOG_KEY is set, and always off in tests.

const POSTHOG_KEY = ""; // the project's public API key (starts with phc_), from PostHog > Settings
const POSTHOG_HOST = "https://us.i.posthog.com";
const FEEDBACK_SURVEY_ID = ""; // the "Lesson feedback" survey's id, from PostHog > Surveys

const on = Boolean(POSTHOG_KEY) && typeof location !== "undefined" && !navigator.webdriver && !/^(localhost|127\.)/.test(location.hostname);
const queue = [];
let posthog = null;

if (on) {
  import("https://cdn.jsdelivr.net/npm/posthog-js@1.438.2/+esm").then(({ default: ph }) => {
    ph.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
    });
    posthog = ph;
    for (const [event, props] of queue.splice(0)) event === "$feedback" ? props() : ph.capture(event, props);
  }).catch(() => {});

  // Errors, so a release that breaks something shows up as a spike
  addEventListener("error", (e) => track("js_error", { message: String(e.message).slice(0, 200), source: e.filename?.split("/").pop(), line: e.lineno }));
  addEventListener("unhandledrejection", (e) => track("js_error", { message: String(e.reason?.message ?? e.reason).slice(0, 200), kind: "promise" }));

  // Whether people let Lento hear them, without touching the lesson code
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const ask = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints) => {
      const started = performance.now();
      try {
        const stream = await ask(constraints);
        if (constraints?.audio) track("mic_allowed", { ms: Math.round(performance.now() - started) });
        return stream;
      } catch (e) {
        if (constraints?.audio) track("mic_denied", { reason: e?.name });
        throw e;
      }
    };
  }
}

export const analyticsOn = on;

// Feedback goes to the PostHog survey, so answers show up with charts next to each
// person's lessons. An email (only if they chose to leave one) is saved on their profile.
export function sendFeedback({ rating, text = "", email = "", where }) {
  if (!on) return;
  const send = () => {
    if (email) posthog.identify(email.toLowerCase(), { email });
    if (FEEDBACK_SURVEY_ID) {
      posthog.capture("survey sent", { $survey_id: FEEDBACK_SURVEY_ID, $survey_response: rating, $survey_response_1: text, $survey_response_2: email ? "yes" : "no", where });
    } else {
      posthog.capture("feedback", { rating, text, ok_to_reply: Boolean(email), where });
    }
  };
  posthog ? send() : queue.push(["$feedback", send]);
}

export function track(event, props = {}) {
  if (!on) return;
  const p = { page: location.pathname.split("/").pop() || "index.html", ...props };
  posthog ? posthog.capture(event, p) : queue.push([event, p]);
}
