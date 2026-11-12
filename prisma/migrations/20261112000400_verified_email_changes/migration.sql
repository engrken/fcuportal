ALTER TABLE "User" ADD COLUMN "emailIdentityChangedAt" TIMESTAMP(3),
ADD COLUMN "tenantManagerEmail" TEXT;

CREATE UNIQUE INDEX "User_tenantManagerEmail_key" ON "User"("tenantManagerEmail");
