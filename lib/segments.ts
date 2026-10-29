import { Pool } from "pg";
import "dotenv/config";

const normalize = (email: string) => email.trim().toLowerCase();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PAGE_DELAY_MS = 150; // Resend permite 10 peticiones/segundo
const MAX_RETRIES = 5;
const CACHE_TTL_MS = 5 * 60_000;

// Reintenta los 429 de Resend respetando la cabecera retry-after
async function fetchResend(url: URL) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(retryAfter > 0 ? retryAfter * 1000 : attempt * 1000);
      continue;
    }
    if (!res.ok) throw new Error(await res.text());
    return res;
  }
}

// Contactos suscritos de la audiencia de Resend (la API pagina de 100 en 100)
export async function getAudienceEmails(): Promise<string[]> {
  const emails: string[] = [];
  let after: string | undefined;
  while (true) {
    const url = new URL(
      `https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`,
    );
    url.searchParams.set("limit", "100");
    if (after) url.searchParams.set("after", after);
    const res = await fetchResend(url);
    const page = (await res.json()) as {
      data: Array<{ id: string; email: string; unsubscribed: boolean }>;
      has_more?: boolean;
    };
    for (const c of page.data) {
      if (!c.unsubscribed) emails.push(normalize(c.email));
    }
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1]!.id;
    await sleep(PAGE_DELAY_MS);
  }
  return [...new Set(emails)];
}

// Emails de usuarios registrados en la app (BBDD de teeup-backend, solo lectura)
export async function getRegisteredEmails(): Promise<Set<string>> {
  if (!process.env.BACKEND_DATABASE_URL) {
    throw new Error("Falta BACKEND_DATABASE_URL en .env");
  }
  const pool = new Pool({ connectionString: process.env.BACKEND_DATABASE_URL });
  try {
    const { rows } = await pool.query<{ email: string }>(
      `SELECT email FROM "User" WHERE "deletionRequestedAt" IS NULL`,
    );
    return new Set(rows.map((r) => normalize(r.email)));
  } finally {
    await pool.end();
  }
}

async function loadSegments() {
  const [audience, registered] = await Promise.all([
    getAudienceEmails(),
    getRegisteredEmails(),
  ]);
  return {
    audience,
    registered: audience.filter((e) => registered.has(e)),
    leads: audience.filter((e) => !registered.has(e)),
    loadedAt: new Date(),
  };
}

type Segments = Awaited<ReturnType<typeof loadSegments>>;
let cache: { at: number; promise: Promise<Segments> } | null = null;

// Divide la audiencia en registrados y leads. Se cachea unos minutos (y las
// peticiones simultáneas comparten la misma descarga) para no saturar Resend;
// fresh: true fuerza recalcular, p. ej. justo antes de un envío real.
export function getSegments({ fresh = false } = {}): Promise<Segments> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.promise;
  const promise = loadSegments();
  const entry = { at: Date.now(), promise };
  cache = entry;
  promise.catch(() => {
    if (cache === entry) cache = null;
  });
  return promise;
}
