import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { PrismaClient } from "./generated/prisma/client";
import { resend } from "./lib/resend";

const IS_TEST = true;
const testAudience = ["devteeupgolf@gmail.com"];
const FROM_EMAIL = "noreply@mail.teeup.es";
const EMAIL_BATCH_SIZE = 80;
const WELCOME_TEMPLATE_ID = "welcome-teeup";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});

async function main() {
  let sentCount = 0;
  const contacts = await getAudienceContacts();
  for (const contact of contacts.data) {
    console.log(`Sending welcome email to: ${contact.email}`);
    const isWelcomed = await getIfUserIsWelcomed(contact.email);
    console.log(`Is user welcomed: ${isWelcomed}`);
    if (isWelcomed) {
      console.log(`User ${contact.email} has already been welcomed. Skipping.`);
      continue;
    }
    console.log(`Sending welcome email to: ${contact.email}`);
    await sendTemplateToUser(contact.email);
    console.log(`Welcome email sent to: ${contact.email}`);
    sentCount++;
    console.log(`Sent count: ${sentCount}`);
    if (sentCount >= EMAIL_BATCH_SIZE) {
      console.log(`Reached batch limit of ${EMAIL_BATCH_SIZE}. Stopping.`);
      break;
    }
  }
}

async function getAudienceContacts(): Promise<{
  data: Array<{
    email: string;
  }>;
}> {
  if (IS_TEST) {
    return { data: testAudience.map((email) => ({ email })) };
  }

  const contacts = await fetch(
    `https://api.resend.com/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts`,
    {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
    },
  );

  if (!contacts.ok) {
    throw new Error(await contacts.text());
  }

  const data: { data: Array<{ email: string }> } =
    (await contacts.json()) as any;

  return data;
}

async function getIfUserIsWelcomed(email: string) {
  const user = await prisma.welcomedUser.findUnique({
    where: { email },
  });
  return user?.status ?? false;
}

async function sendTemplateToUser(email: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      template: {
        id: WELCOME_TEMPLATE_ID,
      },
    });
    await prisma.welcomedUser.upsert({
      where: { email },
      update: { status: true, error: null },
      create: { email, status: true },
    });
  } catch (error) {
    await prisma.welcomedUser.upsert({
      where: { email },
      update: { status: false, error: (error as Error).message },
      create: { email, status: false, error: (error as Error).message },
    });
  }
}

main();
