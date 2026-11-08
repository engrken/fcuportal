ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('TEACHER', 'STUDENT');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
DROP TYPE "Role_old";

ALTER TABLE "School"
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS "subscriptionExpiresAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "TenantPayment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "coverageFrom" TIMESTAMP(3),
  "coverageTo" TIMESTAMP(3),
  "note" TEXT,
  "recordedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TenantPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TenantPayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TenantPayment_schoolId_paidAt_idx" ON "TenantPayment"("schoolId", "paidAt");
