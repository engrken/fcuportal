ALTER TABLE "School" ADD COLUMN "logoPath" TEXT;
ALTER TABLE "User" ADD COLUMN "profileImagePath" TEXT;
ALTER TABLE "Subject" ADD COLUMN "classId" TEXT;

CREATE UNIQUE INDEX "Subject_schoolId_classId_key" ON "Subject"("schoolId", "classId");
