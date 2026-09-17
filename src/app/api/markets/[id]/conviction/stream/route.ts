import { convictionStreamIntervalMs, getSharedMarketConviction } from "@/server/conviction/service";
import { isBettingError } from "@/server/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const interval = convictionStreamIntervalMs();
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  const stop = () => {
    closed = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const stream = new ReadableStream({
    start(controller) {
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          stop();
        }
      };
      const close = () => {
        if (closed) return;
        stop();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      // Register before the first await so an early disconnect can't leak a timer.
      request.signal.addEventListener("abort", close, { once: true });
      write(`retry: ${Math.max(1_000, interval)}\n\n`);

      const tick = async () => {
        if (closed) return;
        try {
          const conviction = await getSharedMarketConviction(id, interval);
          seq += 1;
          // `id` lets clients discard out-of-order events; snapshotAt orders across reconnects.
          write(`id: ${seq}\ndata: ${JSON.stringify(conviction)}\n\n`);
        } catch (error) {
          const payload = isBettingError(error)
            ? { error: { code: error.code, message: error.message } }
            : { error: { code: "INTERNAL", message: "Conviction stream failed" } };
          write(`data: ${JSON.stringify(payload)}\n\n`);
          if (isBettingError(error) && error.status === 404) {
            close();
            return;
          }
        }
        // Chain after completion so slow ticks never overlap.
        if (!closed) timer = setTimeout(tick, interval);
      };
      void tick();
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
