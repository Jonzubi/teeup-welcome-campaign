import "dotenv/config";
import {
  DEFAULT_NEWSLETTER_TEMPLATE_ID,
  EMAIL_BATCH_SIZE,
  sendBatch,
} from "./lib/campaigns";

const IS_TEST = true;
// Cambiar por la plantilla de cada newsletter; se envía una vez por email y plantilla
const NEWSLETTER_TEMPLATE_ID = DEFAULT_NEWSLETTER_TEMPLATE_ID;

// Solo a contactos de la audiencia ya registrados en la app
const result = await sendBatch({
  segment: "registered",
  templateId: NEWSLETTER_TEMPLATE_ID,
  limit: EMAIL_BATCH_SIZE,
  test: IS_TEST,
});
console.log(
  `Sent: ${result.sent.length} · Failed: ${result.failed.length} · Still pending: ${result.pending}`,
);
process.exit(0);
