import { prisma } from "./prisma";
import { resend } from "./resend";
import { getSegments } from "./segments";

export const FROM_EMAIL = "noreply@mail.teeup.es";
// Primer welcome: se envió antes de existir emailSend y está registrado en welcomedUser
export const DEFAULT_WELCOME_TEMPLATE_ID = "welcome-correspondencias-teeup";
export const DEFAULT_NEWSLETTER_TEMPLATE_ID = "newsletter";
export const TEST_AUDIENCE = ["devteeupgolf@gmail.com"];
export const EMAIL_BATCH_SIZE = 80;
const SEND_DELAY_MS = 600; // Resend limita a ~2 peticiones por segundo

// leads: en la audiencia pero sin registrar · registered: ya registrados en la app
export type Segment = "leads" | "registered";

export type SendOptions = {
  segment: Segment;
  templateId: string;
  limit: number;
  // En modo test se envía solo a TEST_AUDIENCE y no se registra nada en BBDD
  test: boolean;
};

export type SendResult = {
  sent: string[];
  failed: Array<{ email: string; error: string }>;
  pending: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendTemplate(email: string, templateId: string) {
  // El SDK no lanza excepción: devuelve { error } si Resend rechaza el envío
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    template: { id: templateId },
  });
  if (error) throw new Error(error.message);
}

// Emails que ya recibieron esta plantilla con éxito
async function getSentEmails(templateId: string) {
  const rows = await prisma.emailSend.findMany({
    where: { templateId, status: true },
    select: { email: true },
  });
  const sent = new Set(rows.map((r) => r.email.toLowerCase()));
  if (templateId === DEFAULT_WELCOME_TEMPLATE_ID) {
    const welcomed = await prisma.welcomedUser.findMany({
      where: { status: true },
      select: { email: true },
    });
    for (const r of welcomed) sent.add(r.email.toLowerCase());
  }
  return sent;
}

async function recordSend(
  segment: Segment,
  email: string,
  templateId: string,
  error: string | null,
) {
  const status = error === null;
  const key = { email, templateId };
  await prisma.emailSend.upsert({
    where: { email_templateId: key },
    update: { segment, status, error, sentAt: new Date() },
    create: { ...key, segment, status, error },
  });
}

// Contactos del segmento que aún no han recibido esta plantilla
export async function getPendingRecipients(
  segment: Segment,
  templateId: string,
  { fresh = false } = {},
) {
  const [segments, sent] = await Promise.all([
    getSegments({ fresh }),
    getSentEmails(templateId),
  ]);
  return segments[segment].filter((e) => !sent.has(e));
}

let sending = false;

export async function sendBatch(opts: SendOptions): Promise<SendResult> {
  if (sending) throw new Error("Ya hay un envío en curso");
  sending = true;
  try {
    const recipients = opts.test
      ? TEST_AUDIENCE
      : await getPendingRecipients(opts.segment, opts.templateId, { fresh: true });
    const batch = recipients.slice(0, opts.limit);
    const result: SendResult = {
      sent: [],
      failed: [],
      pending: recipients.length - batch.length,
    };

    for (const email of batch) {
      console.log(`[${opts.segment}] Sending ${opts.templateId} to: ${email}`);
      let error: string | null = null;
      try {
        await sendTemplate(email, opts.templateId);
        result.sent.push(email);
      } catch (e) {
        error = (e as Error).message;
        result.failed.push({ email, error });
      }
      if (!opts.test) await recordSend(opts.segment, email, opts.templateId, error);
      await sleep(SEND_DELAY_MS);
    }
    return result;
  } finally {
    sending = false;
  }
}

// Una fila por contacto de la audiencia, con lo que ha recibido
export async function getOverview({ fresh = false } = {}) {
  const { audience, registered, loadedAt } = await getSegments({ fresh });
  const registeredSet = new Set(registered);

  const [welcomedRows, sendRows] = await Promise.all([
    prisma.welcomedUser.findMany(),
    prisma.emailSend.findMany({ orderBy: { sentAt: "asc" } }),
  ]);
  const welcomeByEmail = new Map(welcomedRows.map((r) => [r.email.toLowerCase(), r]));
  const sentByEmail = new Map<string, string[]>();
  const errorByEmail = new Map<string, string>();
  for (const r of sendRows) {
    const email = r.email.toLowerCase();
    if (r.status) sentByEmail.set(email, [...(sentByEmail.get(email) ?? []), r.templateId]);
    else if (r.error) errorByEmail.set(email, `${r.templateId}: ${r.error}`);
  }

  const contacts = audience.map((email) => {
    const welcome = welcomeByEmail.get(email);
    return {
      email,
      registered: registeredSet.has(email),
      welcomed: welcome?.status ?? false,
      emails: sentByEmail.get(email) ?? [],
      error: errorByEmail.get(email) ?? welcome?.error ?? null,
    };
  });

  const history = new Map<
    string,
    { templateId: string; segment: string; sent: number; failed: number; lastSentAt: Date }
  >();
  for (const r of sendRows) {
    const key = `${r.segment}:${r.templateId}`;
    const h = history.get(key) ?? {
      templateId: r.templateId,
      segment: r.segment,
      sent: 0,
      failed: 0,
      lastSentAt: r.sentAt,
    };
    r.status ? h.sent++ : h.failed++;
    if (r.sentAt > h.lastSentAt) h.lastSentAt = r.sentAt;
    history.set(key, h);
  }

  return {
    loadedAt,
    contacts,
    history: [...history.values()].sort((a, b) => +b.lastSentAt - +a.lastSentAt),
  };
}

export async function listTemplates() {
  const { data, error } = await resend.templates.list({ limit: 100 });
  if (error) throw new Error(error.message);
  return data.data
    .filter((t) => t.status === "published")
    .map((t) => ({ id: t.alias ?? t.id, name: t.name }));
}
