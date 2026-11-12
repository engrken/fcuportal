ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "EmailVerificationChallenge" (
  "id" TEXT NOT NULL,
  "bindingHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  CONSTRAINT "EmailVerificationChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationChallenge_expiresAt_idx"
  ON "EmailVerificationChallenge"("expiresAt");
