-- Store every category weight as a percentage of its immediate parent.
-- Existing child weights were stored as absolute course allocations, so divide
-- by the parent's stored allocation to preserve each category's effective
-- contribution to the final course grade.
UPDATE "GradeCategory" AS child
SET weight = CASE
  WHEN parent.weight > 0 THEN child.weight / parent.weight * 100
  ELSE 0
END
FROM "GradeCategory" AS parent
WHERE child."parentId" = parent.id;
