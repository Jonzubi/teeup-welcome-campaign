-- AlterTable
ALTER TABLE "welcomedUser" ADD COLUMN     "error" TEXT,
ADD COLUMN     "status" BOOLEAN NOT NULL DEFAULT false;
