ALTER TABLE "GradeCategory"
  ALTER COLUMN "conversionBase" SET DEFAULT 50;

-- The field existed in earlier versions but was not used in grade calculations.
-- Start existing grading paths at the requested generic 50 base; teachers can
-- set a school/college-specific value (such as 70) per parent category.
UPDATE "GradeCategory"
SET "conversionBase" = 50;
