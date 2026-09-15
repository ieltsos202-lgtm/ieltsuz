import { NextResponse } from "next/server";
import { geminiKeys } from "@/lib/gemini";

/**
 * Connection warming for the live speaking pipeline.
 *
 * The first turn of a session pays for DNS + TLS to Gemini and ElevenLabs on
 * the critical path (easily 200-500ms each). The client calls this while the
 * greeting is still playing, so those handshakes are already done — and kept
 * warm by the runtime's connection pool — when the first real turn arrives.
 *
 * Deliberately cheap: no generation, no quota use, failures are ignored.
 */
export async function POST() {
  const t0 = Date.now();
  const key = geminiKeys()[0] || "";

  const warm = async (url: string, headers: Record<string, string> = {}) => {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(2500),
      });
      await res.body?.cancel();
      return true;
    } catch {
      return false;
    }
  };

  const [gemini, eleven] = await Promise.all([
    key
      ? warm(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=1`)
      : Promise.resolve(false),
    process.env.ELEVENLABS_API_KEY
      ? warm("https://api.elevenlabs.io/v1/user/subscription", {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
        })
      : Promise.resolve(false),
  ]);

  return NextResponse.json(
    { gemini, eleven, ms: Date.now() - t0 },
    { headers: { "Cache-Control": "no-store" } }
  );
}
