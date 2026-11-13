-- Non-destructive optional invitation fields; no enrollment or grading data is modified.
ALTER TABLE "Subject" ADD COLUMN "joinCodeHash" TEXT;
ALTER TABLE "Subject" ADD COLUMN "joinCodeExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Subject_joinCodeHash_key" ON "Subject"("joinCodeHash");
