CREATE TABLE IF NOT EXISTS "School" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "portalTitle" TEXT NOT NULL DEFAULT 'Student Grade Portal',
  "logoText" TEXT NOT NULL DEFAULT 'S',
  "primaryColor" TEXT NOT NULL DEFAULT '#2457d6',
  "privacyController" TEXT,
  "privacyContactEmail" TEXT,
  "privacyPolicyUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

INSERT INTO "School" ("id", "slug", "name", "shortName", "portalTitle", "logoText", "privacyController", "privacyContactEmail", "privacyPolicyUrl", "updatedAt")
VALUES ('school_fcu', 'fcu', 'Filamer Christian University', 'FCU', 'FCU Faculty Grade Portal', 'F', 'Engr. Kenneth Mark Bulquerin', 'kennethmark.bulquerin@filamer.edu.ph', 'https://filamer.edu.ph/about-us/data-privacy-policy/', CURRENT_TIMESTAMP) ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "schoolId" TEXT;
ALTER TABLE "Subject" ADD COLUMN IF NOT EXISTS "schoolId" TEXT;
ALTER TABLE "StudentDirectory" ADD COLUMN IF NOT EXISTS "schoolId" TEXT;
UPDATE "User" SET "schoolId" = 'school_fcu';
UPDATE "Subject" SET "schoolId" = 'school_fcu';
UPDATE "StudentDirectory" SET "schoolId" = 'school_fcu';
ALTER TABLE "User" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StudentDirectory" ALTER COLUMN "schoolId" SET NOT NULL;

DROP INDEX IF EXISTS "User_email_key";
DROP INDEX IF EXISTS "User_studentNumber_key";
ALTER TABLE "StudentDirectory" DROP CONSTRAINT IF EXISTS "StudentDirectory_email_key";
DROP INDEX IF EXISTS "StudentDirectory_email_key";
ALTER TABLE "StudentDirectory" DROP CONSTRAINT IF EXISTS "StudentDirectory_pkey";


CREATE UNIQUE INDEX IF NOT EXISTS "School_slug_key" ON "School"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_email_key" ON "User"("schoolId", "email");
CREATE UNIQUE INDEX IF NOT EXISTS "User_schoolId_studentNumber_key" ON "User"("schoolId", "studentNumber");
CREATE INDEX IF NOT EXISTS "User_schoolId_role_idx" ON "User"("schoolId", "role");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentDirectory_schoolId_studentNumber_key" ON "StudentDirectory"("schoolId", "studentNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "StudentDirectory_schoolId_email_key" ON "StudentDirectory"("schoolId", "email");
ALTER TABLE "StudentDirectory" DROP CONSTRAINT IF EXISTS "StudentDirectory_pkey";
ALTER TABLE "StudentDirectory" ADD CONSTRAINT "StudentDirectory_pkey" PRIMARY KEY ("schoolId", "studentNumber");
CREATE INDEX IF NOT EXISTS "Subject_schoolId_teacherId_academicYear_term_idx" ON "Subject"("schoolId", "teacherId", "academicYear", "term");
CREATE INDEX IF NOT EXISTS "Subject_schoolId_gradeStatus_submittedAt_idx" ON "Subject"("schoolId", "gradeStatus", "submittedAt");
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_schoolId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subject" DROP CONSTRAINT IF EXISTS "Subject_schoolId_fkey";
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentDirectory" DROP CONSTRAINT IF EXISTS "StudentDirectory_schoolId_fkey";
ALTER TABLE "StudentDirectory" ADD CONSTRAINT "StudentDirectory_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
