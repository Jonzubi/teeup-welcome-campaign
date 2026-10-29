import { Pool } from "pg";
import "dotenv/config";

const normalize = (email: string) => email.trim().toLowerCase();

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
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    });
    if (!res.ok) throw new Error(await res.text());
    const page = (await res.json()) as {
      data: Array<{ id: string; email: string; unsubscribed: boolean }>;
      has_more?: boolean;
    };
    for (const c of page.data) {
      if (!c.unsubscribed) emails.push(normalize(c.email));
    }
    if (!page.has_more || page.data.length === 0) break;
    after = page.data[page.data.length - 1]!.id;
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

// Divide la audiencia en registrados y leads. Se calcula en cada ejecución,
// así que en cuanto alguien se registra deja de ser lead automáticamente.
export async function getSegments() {
  const [audience, registered] = await Promise.all([
    getAudienceEmails(),
    getRegisteredEmails(),
  ]);
  return {
    audience,
    registered: audience.filter((e) => registered.has(e)),
    leads: audience.filter((e) => !registered.has(e)),
  };
}
