-- Convert the previous nested model (children stored as a 100% share of their
-- parent) into absolute course-percentage allocations. The resulting leaf
-- contribution is equal to the prior product of all ancestor shares.
WITH RECURSIVE allocated_categories AS (
  SELECT
    id,
    "parentId",
    weight::numeric AS allocated_weight
  FROM "GradeCategory"
  WHERE "parentId" IS NULL

  UNION ALL

  SELECT
    child.id,
    child."parentId",
    parent.allocated_weight * child.weight::numeric / 100
  FROM "GradeCategory" AS child
  JOIN allocated_categories AS parent ON child."parentId" = parent.id
)
UPDATE "GradeCategory" AS category
SET weight = allocated.allocated_weight::double precision
FROM allocated_categories AS allocated
WHERE category.id = allocated.id
  AND category."parentId" IS NOT NULL;
