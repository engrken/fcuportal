ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "termsOfServiceVersion" TEXT;

UPDATE "Subject"
SET "term" = '3rd Semester'
WHERE LOWER(TRIM("term")) = 'trimester';
