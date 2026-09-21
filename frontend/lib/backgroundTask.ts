/**
 * Run work that must outlive the HTTP response.
 *
 * Next's `after()` keeps the promise attached to the platform's request context
 * (on Cloudflare Workers that is `waitUntil`), so the worker is not torn down
 * the moment the response is flushed. Without it, an AI evaluation started
 * during a request is cancelled as soon as we reply — which is exactly how a
 * finished test loses its report.
 *
 * This was duplicated in three route handlers; keeping one copy means a fix to
 * the fallback path applies everywhere.
 */
export async function runInBackground(cb: () => Promise<void>): Promise<void> {
  try {
    const nextServer = await import("next/server");
    const fn = (nextServer as any).after || (nextServer as any).unstable_after;
    if (typeof fn === "function") {
      fn(cb);
      return;
    }
  } catch {
    // `after` is unavailable on this runtime — fall through.
  }
  // Detach from the request lifecycle so Next does not cancel the promise when
  // the HTTP response finishes.
  setTimeout(() => void cb().catch(console.error), 0);
}
