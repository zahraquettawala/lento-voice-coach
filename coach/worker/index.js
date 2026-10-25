// Lento's key server: a tiny Cloudflare Worker that keeps the ElevenLabs key off the phone.
// The app asks it for a one-time pass to talk to Lento; it checks the request came from the
// Lento site, checks today's limits and budget, then asks ElevenLabs for a conversation token.
// After each chat, ElevenLabs calls /webhook with how long it lasted; that's what the budget
// counts, and each chat is logged to PostHog so spend shows up on the dashboard.
//
// Settings (in Cloudflare, never in the repo):
//   ELEVENLABS_API_KEY  secret
//   AGENT_ID            Lento's agent id
//   ALLOWED_ORIGINS     comma-separated, e.g. https://zahraquettawala.github.io
//   PER_PERSON_DAILY    chats per person per day (default 6)
//   ALL_DAILY           chats per day for everyone together (default 40)
//   DAILY_BUDGET_USD    estimated spend per day for everyone together (default 3)
//   COACH_ON            set to "off" to switch the live coach off instantly
//   WEBHOOK_SECRET      secret, from ElevenLabs' post-call webhook settings
//   POSTHOG_KEY         PostHog project key (public); leave empty to skip logging
//   LIMITS              a KV namespace for the daily counts

const TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token";
const POSTHOG_URL = "https://us.i.posthog.com/i/v0/e/";
const USD_PER_MINUTE = 0.08; // ElevenLabs Agents, every plan; the LLM adds a little on top

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

// Who's asking, without keeping their IP address: a hash that changes every day
async function person(request, day) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${day}:${ip}`));
  return [...new Uint8Array(bytes)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function bump(kv, key, by = 1) {
  const n = Number((await kv.get(key)) ?? 0) + by;
  await kv.put(key, String(n), { expirationTtl: 60 * 60 * 26 });
  return n;
}

async function posthog(env, event, person, properties = {}) {
  if (!env.POSTHOG_KEY) return;
  try {
    await fetch(POSTHOG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: env.POSTHOG_KEY, event, distinct_id: person || "lento-coach", properties: { source: "coach-worker", ...properties } }),
    });
  } catch {}
}

const budget = (env) => Number(env.DAILY_BUDGET_USD ?? 3);

// ElevenLabs signs each webhook: header "t=<time>,v0=<hex HMAC-SHA256 of `${t}.${body}`>"
async function signed(request, body, secret) {
  const header = request.headers.get("ElevenLabs-Signature") ?? "";
  const t = /t=(\d+)/.exec(header)?.[1], v0 = /v0=([0-9a-f]+)/.exec(header)?.[1];
  if (!t || !v0 || !secret) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 30 * 60) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex.length === v0.length && [...hex].reduce((d, c, i) => d | (c.charCodeAt(0) ^ v0.charCodeAt(i)), 0) === 0;
}

// After a chat: add it to today's spend, log it, and warn as the budget fills up
async function afterCall(request, env) {
  const body = await request.text();
  if (!(await signed(request, body, env.WEBHOOK_SECRET))) return json({ error: "bad signature" }, 401, {});
  const event = JSON.parse(body);
  if (event.type !== "post_call_transcription") return json({ ok: true }, 200, {});
  const d = event.data ?? {}, meta = d.metadata ?? {};
  const seconds = Number(meta.call_duration_secs ?? 0);
  const usd = Math.round((seconds / 60) * USD_PER_MINUTE * 10000) / 10000;
  const person = d.conversation_initiation_client_data?.dynamic_variables?.lento_user ?? "";
  const day = new Date().toISOString().slice(0, 10);
  const before = Number((await env.LIMITS.get(`usd:${day}`)) ?? 0);
  const spent = await bump(env.LIMITS, `usd:${day}`, usd);
  await posthog(env, "coach_conversation", person, {
    seconds, est_cost_usd: usd, credits: meta.cost ?? null, ended_by: meta.termination_reason ?? null,
    moment: d.conversation_initiation_client_data?.dynamic_variables?.moment ?? null, spent_today_usd: spent,
  });
  const cap = budget(env);
  if (before < cap * 0.8 && spent >= cap * 0.8) await posthog(env, "coach_budget_warning", "", { spent_today_usd: spent, budget_usd: cap });
  if (before < cap && spent >= cap) await posthog(env, "coach_budget_reached", "", { spent_today_usd: spent, budget_usd: cap });
  return json({ ok: true }, 200, {});
}

export default {
  async fetch(request, env) {
    // ElevenLabs reports each finished chat here (server to server, so no Origin)
    if (request.method === "POST" && new URL(request.url).pathname === "/webhook") return afterCall(request, env);

    const origin = request.headers.get("Origin") ?? "";
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return json({ error: "not allowed" }, 403, {});
    const headers = cors(origin);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    const { pathname } = new URL(request.url);
    if (request.method !== "POST" || pathname !== "/session") return json({ error: "not found" }, 404, headers);
    if (env.COACH_ON === "off") return json({ error: "off" }, 503, headers);

    // Daily limits, so nobody can run up the bill
    const day = new Date().toISOString().slice(0, 10);
    const me = await person(request, day);
    const mine = Number((await env.LIMITS.get(`p:${day}:${me}`)) ?? 0);
    const all = Number((await env.LIMITS.get(`all:${day}`)) ?? 0);
    if (mine >= Number(env.PER_PERSON_DAILY ?? 6) || all >= Number(env.ALL_DAILY ?? 40)) {
      return json({ error: "limit" }, 429, headers);
    }
    if (Number((await env.LIMITS.get(`usd:${day}`)) ?? 0) >= budget(env)) return json({ error: "limit" }, 429, headers);

    const res = await fetch(`${TOKEN_URL}?agent_id=${encodeURIComponent(env.AGENT_ID)}`, {
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
    });
    if (!res.ok) {
      console.log("ElevenLabs token error", res.status, await res.text());
      return json({ error: "upstream" }, 502, headers);
    }
    const { token } = await res.json();
    await bump(env.LIMITS, `p:${day}:${me}`);
    await bump(env.LIMITS, `all:${day}`);
    return json({ token, person: me }, 200, headers);
  },
};
