import { Pool } from "pg";
import "dotenv/config";
import { getSegments } from "../lib/segments";

const { audience, registered, leads } = await getSegments();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const { rows } = await pool.query<{ email: string }>(
  `SELECT lower(email) AS email FROM "welcomedUser" WHERE status = true`,
);
await pool.end();
const welcomed = new Set(rows.map((r) => r.email));
const registeredSet = new Set(registered);

console.log(`Audiencia (suscritos):            ${audience.length}`);
console.log(`  Registrados en la app:          ${registered.length}`);
console.log(`  Leads sin registrar:            ${leads.length}`);
console.log(`Welcome enviado:                  ${welcomed.size}`);
console.log(
  `  ...de esos, ya registrados:     ${[...welcomed].filter((e) => registeredSet.has(e)).length}`,
);
console.log(
  `Leads aún sin ningún welcome:     ${leads.filter((e) => !welcomed.has(e)).length}`,
);
