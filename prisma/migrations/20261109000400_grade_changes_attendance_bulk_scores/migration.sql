ALTER TABLE "Enrollment" ADD COLUMN "finalGradeOverride" TEXT;

CREATE TABLE "GradeChangeHistory" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "previousFinalGrade" TEXT,
  "previousRemarks" TEXT,
  "newFinalGrade" TEXT,
  "newRemarks" TEXT,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GradeChangeHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GradeChangeHistory_enrollmentId_createdAt_idx" ON "GradeChangeHistory"("enrollmentId", "createdAt");
CREATE INDEX "GradeChangeHistory_actorId_createdAt_idx" ON "GradeChangeHistory"("actorId", "createdAt");
ALTER TABLE "GradeChangeHistory" ADD CONSTRAINT "GradeChangeHistory_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GradeChangeHistory" ADD CONSTRAINT "GradeChangeHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Older nested grading paths stored each deeper level as a normalized 100%.
-- Convert those children to allocation points of their direct parent, deepest-first.
DO $$
DECLARE loop_depth integer;
BEGIN
  FOR loop_depth IN 1..12 LOOP
    WITH RECURSIVE category_depth AS (
      SELECT id, "parentId", 0 AS depth FROM "GradeCategory" WHERE "parentId" IS NULL
      UNION ALL
      SELECT child.id, child."parentId", parent.depth + 1
      FROM "GradeCategory" child
      JOIN category_depth parent ON child."parentId" = parent.id
    ), child_totals AS (
      SELECT child."parentId", SUM(child.weight) AS total
      FROM "GradeCategory" child
      JOIN category_depth parent_depth ON parent_depth.id = child."parentId"
      WHERE parent_depth.depth = loop_depth
      GROUP BY child."parentId"
    )
    UPDATE "GradeCategory" child
    SET weight = ROUND((child.weight * parent.weight / 100.0)::numeric, 4)::double precision
    FROM "GradeCategory" parent, child_totals totals
    WHERE child."parentId" = parent.id
      AND totals."parentId" = parent.id
      AND ABS(totals.total - 100) < 0.01;
  END LOOP;
END $$;
