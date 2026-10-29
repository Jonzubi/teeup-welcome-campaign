# teeup-welcome-campaign

Envíos de email a la audiencia de Resend, separada en dos segmentos:

- **Leads**: contactos que aún no se han registrado en la app → emails para que se registren.
- **Registrados**: contactos cuyo email existe en la tabla `User` de teeup-backend → newsletters.

Cada plantilla se envía una sola vez por persona (tabla `emailSend`). El primer welcome
(`welcome-correspondencias-teeup`) se envió antes y está registrado en `welcomedUser`.
Los segmentos se calculan en cada ejecución, así que quien se registra deja de recibir
emails de leads automáticamente.

## Setup

```bash
bun install
bunx prisma migrate deploy
```

`.env` necesita `DATABASE_URL`, `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` y `BACKEND_DATABASE_URL` (BBDD de teeup-backend, basta con acceso de solo lectura).

## Uso

```bash
bun run ui          # panel web en http://127.0.0.1:3333
bun run stats       # números por consola
bun run welcome     # tanda a leads (plantilla e IS_TEST en index.ts)
bun run newsletter  # tanda a registrados (plantilla e IS_TEST en newsletter.ts)
```
