# Lento, the live coach

Lento's talking layer: an ElevenLabs agent that chats with you before and after the lesson.

- **Before:** tap "Or just tell Lento" and say how your voice feels. Lento may ask a follow-up, builds the lesson (`build_lesson`), and starts it when you're ready (`start_lesson`).
- **After:** tap "Talk it through with Lento". She uses the real scores to give one bit of praise, one thing to work on and one tip.
- **During the lesson** Lento stays offline. The app catches flat, sharp and breathy phrases and plays fixed lines and rotating technique tips (`tips.js`) instead. That's instant, costs nothing per lesson, and it never mistakes your singing for talking.

The agent is the teacher; the app is the piano, tuner and room. The agent can't hear pitch (it only gets words), so the app does the measuring and passes the results through tools and dynamic variables (`coach-context.js`).

## Files

| File | What it is |
|---|---|
| `coach.js` | Connects to ElevenLabs (live) or plays a scripted chat (practice mode) |
| `coach-ui.js` | The talk screen: Lento's face, captions, Mute and End |
| `coach-context.js` | Turns lesson history and scores into sentences for the agent |
| `tips.js` | Technique tips for the lesson, rotating when a mistake repeats |
| `coach/prompt.md` | Lento's personality, goals and guardrails |
| `coach/agent.json` | The agent's settings: Irene's voice, tools, 3-minute cap, site allowlist |
| `coach/worker/` | The key server (Cloudflare Worker) |

## Practice mode (free)

Open `lesson.html?coach=mock`. Everything runs for real except the ElevenLabs connection, which is replaced by a scripted conversation. Nothing is sent anywhere. `?coach=off` hides the coach.

The live coach stays hidden until `COACH_URL` in `coach.js` is set, so merging this changes nothing on the live site.

## Cost guards

- Lento only connects while you're talking with her, never during singing.
- Each chat hangs up after 3 minutes (in the agent and in the app).
- The key server allows 6 chats per person per day and 40 for everyone (change in `wrangler.toml`), and `COACH_ON = "off"` switches it all off at once.
- The ElevenLabs key lives only in Cloudflare as a secret. It's never in the app or this repo.
- The agent only accepts connections from the Lento site.

## Going live (only with Zahra's OK; uses ElevenLabs credits)

1. Create the agent from `agent.json` and `prompt.md`, with Irene's voice id.
2. Make a free Cloudflare account, then in `coach/worker`: `npx wrangler kv namespace create LIMITS` (paste the id into `wrangler.toml`), add `AGENT_ID` to `wrangler.toml`, `npx wrangler secret put ELEVENLABS_API_KEY`, `npx wrangler deploy`.
3. Put the worker's address in `COACH_URL` in `coach.js`.
4. Test slowly: one short chat, check the ElevenLabs usage page, then the next.

## New lines to record in Irene's voice

The ten tips in `tips.js` (`ALL_TIPS`). Until they're recorded, the phone's built-in voice says them. The drill lines around them ("Let's do that one again. I'll sing it with you." and "One more time.") are already recorded.

## Tests

`node --test tests/*.test.mjs` covers the summaries, the tips and the key server (limits, origin check, the key never reaching the phone). None of them use the network.
