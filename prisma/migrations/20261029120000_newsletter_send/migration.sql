-- CreateTable
CREATE TABLE "newsletterSend" (
    "email" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletterSend_pkey" PRIMARY KEY ("email","templateId")
);
