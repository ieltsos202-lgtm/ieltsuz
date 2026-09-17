# Gemini Live API — Speaking Examiner Setup

The speaking examiner now runs on the **Gemini Live API**: one bidirectional
WebSocket between the browser and Gemini — native audio in (PCM16 @16kHz),
native audio out (PCM @24kHz), server-side VAD, barge-in, and transcription of
both sides. The legacy pipeline (record → `/api/speaking/live` → ElevenLabs
TTS) remains as an automatic fallback.

## Flow

1. `POST /api/speaking/live-token` — authenticates the user, charges the
   speaking trial on the first turn, builds the examiner system instruction
   (server-side), and mints a **short-lived ephemeral token** (1 use, 30-min
   expiry, 2-min connect window).
2. The browser opens
   `wss://generativelanguage.googleapis.com/ws/...BidiGenerateContentConstrained?key=<token>`
   directly — no server relay.
3. `public/audio/pcm-worklet.js` (AudioWorklet) captures mic → PCM16 →
   `realtimeInput.audio`. Model audio is scheduled for playback as it streams.
4. `interrupted` events flush the playback queue (barge-in).
   `inputTranscription` / `outputTranscription` build the transcript.
5. Session end → transcript goes to the existing
   `/api/speaking/partner/report` (regular Gemini call, off the live path) →
   band scores + `speaking_results` / `speaking_progress` rows in Supabase.

## Env vars

| Var | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | yes | Paid key — used to mint ephemeral tokens. Never reaches the browser. |
| `GEMINI_LIVE_MODEL` | no | Defaults to `gemini-2.5-flash-native-audio-preview-09-2025`. |
| `ELEVENLABS_API_KEY` | fallback only | Used only when the Live path fails. |

No new npm packages — raw WebSocket + Web Audio API only.

## Mic permissions

`getUserMedia` is requested inside the start-button gesture
(`echoCancellation: true`, `noiseSuppression: true`, `autoGainControl: false`).
If permission is denied the session falls back to the legacy pipeline, which
shows the existing mic error messages.

## Fallback behaviour

- Token mint fails / socket won't open → legacy pipeline starts transparently
  (trial charge is refunded via `DELETE /api/speaking/live-token`).
- Socket drops mid-conversation → turns are preserved; the next answer goes
  through the legacy pipeline ("Jonli rejim uzildi" notice).

## Marker phrases (exam mode)

The system instruction makes the model say exact phrases the client detects:

- `"Here is your cue card."` → Part 2 card + 60s prep countdown
- `"That is the end of the speaking test."` → auto-generates the report
