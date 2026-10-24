// Lento's key server: a tiny Cloudflare Worker that keeps the ElevenLabs key off the phone.
// The app asks it for a one-time pass to talk to Lento; it checks the request came from the
// Lento site, checks today's limits, then asks ElevenLabs for a conversation token.
//
// Settings (in Cloudflare, never in the repo):
//   ELEVENLABS_API_KEY  secret
//   AGENT_ID            Lento's agent id
//   ALLOWED_ORIGINS     comma-separated, e.g. https://zahraquettawala.github.io
//   PER_PERSON_DAILY    chats per person per day (default 6)
//   ALL_DAILY           chats per day for everyone together (default 40)
//   COACH_ON            set to "off" to switch the live coach off instantly
//   LIMITS              a KV namespace for the daily counts

const TOKEN_URL = "https://api.elevenlabs.io/v1/convai/conversation/token";

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

async function bump(kv, key) {
  const n = Number((await kv.get(key)) ?? 0) + 1;
  await kv.put(key, String(n), { expirationTtl: 60 * 60 * 26 });
  return n;
}

export default {
  async fetch(request, env) {
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
    return json({ token }, 200, headers);
  },
};
