import { Client } from "pg";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Vercel: keep the SSE stream open as long as the plan allows; the client
// auto-reconnects when the function times out.
export const maxDuration = 300;

type Subscriber = (data: string) => void;

const g = globalThis as unknown as {
  sseSubs?: Set<Subscriber>;
  ssePg?: Client | null;
  ssePgConnecting?: boolean;
};
g.sseSubs ??= new Set();

async function ensureListener() {
  if (g.ssePg || g.ssePgConnecting) return;
  g.ssePgConnecting = true;
  try {
    const client = new Client({
      connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    });
    await client.connect();
    await client.query("LISTEN app_events");
    client.on("notification", (msg) => {
      const payload = msg.payload ?? "{}";
      for (const sub of g.sseSubs!) sub(payload);
    });
    client.on("error", () => {
      g.ssePg = null;
      client.end().catch(() => {});
    });
    client.on("end", () => {
      g.ssePg = null;
    });
    g.ssePg = client;
  } catch {
    g.ssePg = null;
  } finally {
    g.ssePgConnecting = false;
  }
}

export async function GET() {
  await ensureListener();
  const encoder = new TextEncoder();
  let sub: Subscriber;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      sub = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          /* stream closed */
        }
      };
      g.sseSubs!.add(sub);
      controller.enqueue(encoder.encode(`data: {"topics":["connected"]}\n\n`));
      heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* stream closed */
        }
      }, 25000);
    },
    cancel() {
      g.sseSubs!.delete(sub);
      clearInterval(heartbeat);
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
