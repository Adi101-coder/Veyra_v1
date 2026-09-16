import { convictionStreamIntervalMs, getMarketConviction } from "@/server/conviction/service";
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

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = async () => {
        if (closed) return;
        try {
          const conviction = await getMarketConviction(id);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(conviction)}\n\n`));
        } catch (error) {
          const payload = isBettingError(error)
            ? { error: { code: error.code, message: error.message } }
            : { error: { code: "INTERNAL", message: "Conviction stream failed" } };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
          if (isBettingError(error) && error.status === 404) {
            closed = true;
            controller.close();
          }
        }
      };

      await send();
      const timer = setInterval(() => {
        void send();
      }, interval);

      const shutdown = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", shutdown);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
