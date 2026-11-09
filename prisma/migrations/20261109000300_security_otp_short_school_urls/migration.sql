ALTER TABLE "School" ADD COLUMN "slugAliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "SecurityOtp" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityOtp_userId_purpose_expiresAt_idx" ON "SecurityOtp"("userId", "purpose", "expiresAt");
ALTER TABLE "SecurityOtp" ADD CONSTRAINT "SecurityOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve prior routes and stage all slugs before changing to short acronyms.
UPDATE "School"
SET "slugAliases" = CASE WHEN "slug" = ANY("slugAliases") THEN "slugAliases" ELSE array_append("slugAliases", "slug") END,
    "slug" = '__legacy__' || "id";

DO $$
DECLARE
  school_row RECORD;
  base_slug TEXT;
  candidate TEXT;
  collision_count INTEGER;
  suffix_number INTEGER;
BEGIN
  FOR school_row IN SELECT "id", "shortName" FROM "School" ORDER BY "id" LOOP
    base_slug := trim(both '-' from regexp_replace(lower(school_row."shortName"), '[^a-z0-9]+', '-', 'g'));
    IF base_slug = '' THEN base_slug := 'school'; END IF;
    SELECT count(*) INTO collision_count FROM "School" WHERE trim(both '-' from regexp_replace(lower("shortName"), '[^a-z0-9]+', '-', 'g')) = base_slug;
    candidate := CASE WHEN collision_count = 1 THEN base_slug ELSE base_slug || '-' || lower(right(school_row."id", 5)) END;
    suffix_number := 1;
    WHILE EXISTS (SELECT 1 FROM "School" WHERE "slug" = candidate) LOOP
      candidate := base_slug || '-' || lower(right(school_row."id", 5)) || '-' || suffix_number::TEXT;
      suffix_number := suffix_number + 1;
    END LOOP;
    UPDATE "School" SET "slug" = candidate WHERE "id" = school_row."id";
  END LOOP;
END $$;
