import "dotenv/config";
import {
  type Segment,
  DEFAULT_NEWSLETTER_TEMPLATE_ID,
  DEFAULT_WELCOME_TEMPLATE_ID,
  EMAIL_BATCH_SIZE,
  TEST_AUDIENCE,
  getOverview,
  getPendingRecipients,
  listTemplates,
  sendBatch,
} from "./lib/campaigns";
import page from "./public/index.html";

const PORT = Number(process.env.PORT ?? 3333);

const handle =
  (fn: (req: Request) => Promise<unknown>) => async (req: Request) => {
    try {
      return Response.json(await fn(req));
    } catch (e) {
      console.error(e);
      return Response.json({ error: (e as Error).message }, { status: 500 });
    }
  };

function parseSegment(value: unknown): Segment {
  if (value !== "leads" && value !== "registered") {
    throw new Error("Segmento no válido");
  }
  return value;
}

const server = Bun.serve({
  // Solo accesible desde esta máquina: la UI puede enviar emails reales
  hostname: "127.0.0.1",
  port: PORT,
  // Descargar la audiencia de Resend tarda ~10-15 s (por defecto Bun corta a los 10 s)
  idleTimeout: 120,
  routes: {
    "/": page,
    "/api/config": handle(async () => ({
      defaultTemplates: {
        leads: DEFAULT_WELCOME_TEMPLATE_ID,
        registered: DEFAULT_NEWSLETTER_TEMPLATE_ID,
      },
      batchSize: EMAIL_BATCH_SIZE,
      testAudience: TEST_AUDIENCE,
      backendConfigured: Boolean(process.env.BACKEND_DATABASE_URL),
    })),
    "/api/overview": handle((req) =>
      getOverview({ fresh: new URL(req.url).searchParams.has("fresh") }),
    ),
    "/api/templates": handle(() => listTemplates()),
    "/api/pending": handle(async (req) => {
      const url = new URL(req.url);
      const segment = parseSegment(url.searchParams.get("segment"));
      const templateId = url.searchParams.get("templateId") ?? "";
      const pending = await getPendingRecipients(segment, templateId);
      return { count: pending.length, sample: pending.slice(0, 10) };
    }),
    "/api/send": {
      POST: handle(async (req) => {
        // Una tanda grande tarda minutos (~0,8 s por email): sin límite de tiempo
        server.timeout(req, 0);
        const body = (await req.json()) as Record<string, unknown>;
        const templateId = String(body.templateId ?? "").trim();
        if (!templateId) throw new Error("Falta la plantilla");
        const limit = Math.min(Math.max(Number(body.limit) || 0, 1), 500);
        return sendBatch({
          segment: parseSegment(body.segment),
          templateId,
          limit,
          test: body.test !== false,
        });
      }),
    },
  },
  development: process.env.NODE_ENV !== "production",
});

console.log(`TeeUp campaigns UI → ${server.url}`);
