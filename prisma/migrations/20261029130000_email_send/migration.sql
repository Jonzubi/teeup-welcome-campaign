-- newsletterSend pasa a registrar envíos de cualquier segmento (estaba vacía)
ALTER TABLE "newsletterSend" RENAME TO "emailSend";
ALTER TABLE "emailSend" RENAME CONSTRAINT "newsletterSend_pkey" TO "emailSend_pkey";
ALTER TABLE "emailSend" ADD COLUMN "segment" TEXT NOT NULL;
