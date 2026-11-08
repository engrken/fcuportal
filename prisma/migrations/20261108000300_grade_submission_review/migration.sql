ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'REGISTRAR';

CREATE TYPE "GradeStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED');

ALTER TABLE "Subject"
  ADD COLUMN "gradeStatus" "GradeStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "verifiedAt" TIMESTAMP(3);

UPDATE "Subject"
SET "gradeStatus" = 'SUBMITTED', "submittedAt" = "updatedAt"
WHERE "isPublished" = true;
