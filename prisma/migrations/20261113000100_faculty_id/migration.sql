-- Faculty IDs are school-scoped. Existing teacher accounts receive a random,
-- editable identifier. NULL for students remains valid in the unique index.
ALTER TABLE "User" ADD COLUMN "facultyId" TEXT;

UPDATE "User"
SET "facultyId" = 'FAC-' || UPPER(SUBSTRING(MD5("id" || RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT), 1, 16))
WHERE "role" = 'TEACHER' AND "facultyId" IS NULL;

CREATE UNIQUE INDEX "User_schoolId_facultyId_key" ON "User"("schoolId", "facultyId");
