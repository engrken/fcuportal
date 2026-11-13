const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/account-identifiers.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022
} }).outputText;
const mod = { exports: {} };
new Function("exports", "module", js)(mod.exports, mod);
const { normalizeStudentLoginId, normalizeFacultyId, resolveLoginIdentifier } = mod.exports;

test("email login is normalized without confusing a Student ID for an email", () => {
  assert.deepEqual(resolveLoginIdentifier("EMAIL", " Faculty@School.EDU.PH "), {
    type: "EMAIL", value: "faculty@school.edu.ph"
  });
  assert.equal(resolveLoginIdentifier("EMAIL", "2026-00123"), null);
});

test("Student ID sign-in is school-scoped by caller and case-normalized", () => {
  assert.equal(normalizeStudentLoginId("  abc-123  "), "ABC-123");
  assert.deepEqual(resolveLoginIdentifier("STUDENT_ID", "  ABC-00017  "), {
    type: "STUDENT_ID", value: "ABC-00017"
  });
  assert.equal(resolveLoginIdentifier("STUDENT_ID", ""), null);
  assert.equal(resolveLoginIdentifier("STUDENT_ID", "x".repeat(41)), null);
});

test("Faculty ID accepts realistic school-issued IDs but rejects spaces and invalid chars", () => {
  assert.equal(normalizeFacultyId(" fac-2026-001 "), "FAC-2026-001");
  assert.equal(normalizeFacultyId("A12/011"), "A12/011");
  assert.equal(normalizeFacultyId("FAC 01"), null);
  assert.equal(normalizeFacultyId("x"), null);
  assert.equal(normalizeFacultyId("a".repeat(41)), null);
});

test("My Classes menu no longer navigates to a class on toggle", () => {
  const portal = fs.readFileSync(path.join(__dirname, "../src/components/Portal.tsx"), "utf8");
  const toggle = portal.match(/function toggleClassNav\(\) \{([\s\S]*?)\n  \}\n  function revealClassesOnHover/);
  assert.ok(toggle, "My Classes must have a standalone expand/collapse handler");
  assert.doesNotMatch(toggle[1], /navigatePage|openClass|router\.(push|replace)|setActiveId/);
  assert.match(portal, /onMouseEnter=\{revealClassesOnHover\}/);
  assert.match(portal, /onMouseLeave=\{hideClassesOnMouseLeave\}/);
});

test("Faculty ID migration protects existing records and unique school assignment", () => {
  const migration = fs.readFileSync(path.join(__dirname,
    "../prisma/migrations/20261113000100_faculty_id/migration.sql"), "utf8");
  assert.match(migration, /WHERE "role" = 'TEACHER'/);
  assert.match(migration, /RANDOM\(\)/);
  assert.match(migration, /CREATE UNIQUE INDEX "User_schoolId_facultyId_key"/);
});
