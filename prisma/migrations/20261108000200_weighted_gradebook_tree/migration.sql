ALTER TABLE "GradeCategory" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "weight" DOUBLE PRECISION;

CREATE INDEX "GradeCategory_subjectId_parentId_sortOrder_idx"
  ON "GradeCategory"("subjectId", "parentId", "sortOrder");

ALTER TABLE "GradeCategory"
  ADD CONSTRAINT "GradeCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "GradeCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

DO $migration$
BEGIN
  IF EXISTS (SELECT 1 FROM "Subject" WHERE "id" = 'migration_2026_ece-18' AND "code" = 'ECE 18')
     AND NOT EXISTS (SELECT 1 FROM "Assessment" WHERE "subjectId" = 'migration_2026_ece-18') THEN
    UPDATE "GradeCategory"
    SET "name" = CASE "sortOrder"
          WHEN 0 THEN 'Lecture'
          WHEN 1 THEN 'Laboratory'
          WHEN 2 THEN 'Self-Evaluation Exercises'
          WHEN 3 THEN 'Quizzes/Assignments'
          WHEN 4 THEN 'Attendance/Class Participation'
        END,
        "weight" = CASE "sortOrder"
          WHEN 0 THEN 60
          WHEN 1 THEN 40
          WHEN 2 THEN 25
          WHEN 3 THEN 15
          WHEN 4 THEN 10
        END,
        "parentId" = CASE "sortOrder"
          WHEN 2 THEN 'migration_cat_2026_migration_2026_ece-18_0'
          WHEN 3 THEN 'migration_cat_2026_migration_2026_ece-18_0'
          WHEN 4 THEN 'migration_cat_2026_migration_2026_ece-18_0'
          ELSE NULL
        END,
        "conversionBase" = CASE WHEN "sortOrder" IN (0, 1, 4) THEN 0 ELSE 30 END
    WHERE "subjectId" = 'migration_2026_ece-18';

    INSERT INTO "GradeCategory" ("id", "subjectId", "parentId", "name", "weight", "conversionBase", "sortOrder") VALUES
      ('migration_cat_ece18_major_exams', 'migration_2026_ece-18', 'migration_cat_2026_migration_2026_ece-18_0', 'Major Examinations', 50, 30, 5),
      ('migration_cat_ece18_lab_exam', 'migration_2026_ece-18', 'migration_cat_2026_migration_2026_ece-18_1', 'Laboratory Exam (Written/Practical)', 50, 0, 0),
      ('migration_cat_ece18_lab_exercises', 'migration_2026_ece-18', 'migration_cat_2026_migration_2026_ece-18_1', 'Laboratory Exercises', 50, 0, 1);

    INSERT INTO "Assessment" ("id", "subjectId", "categoryId", "title", "maxScore", "weight", "createdAt") VALUES
      ('migration_assessment_ece18_midterm', 'migration_2026_ece-18', 'migration_cat_ece18_major_exams', 'Midterm Examination', 50, 40, CURRENT_TIMESTAMP),
      ('migration_assessment_ece18_final', 'migration_2026_ece-18', 'migration_cat_ece18_major_exams', 'Final Examination', 50, 60, CURRENT_TIMESTAMP);
  END IF;
END
$migration$;
