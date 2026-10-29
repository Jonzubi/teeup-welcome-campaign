import "dotenv/config";
import {
  DEFAULT_WELCOME_TEMPLATE_ID,
  EMAIL_BATCH_SIZE,
  sendBatch,
} from "./lib/campaigns";

const IS_TEST = true;
// Cambiar por la plantilla a enviar; cada lead la recibe una sola vez
const LEADS_TEMPLATE_ID = DEFAULT_WELCOME_TEMPLATE_ID;

// Solo a leads (contactos de la audiencia que no se han registrado)
const result = await sendBatch({
  segment: "leads",
  templateId: LEADS_TEMPLATE_ID,
  limit: EMAIL_BATCH_SIZE,
  test: IS_TEST,
});
console.log(
  `Sent: ${result.sent.length} · Failed: ${result.failed.length} · Still pending: ${result.pending}`,
);
process.exit(0);
