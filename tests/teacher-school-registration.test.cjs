const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const code = fs.readFileSync(path.join(__dirname, "../src/lib/teacher-school-registration.ts"), "utf8");
const js = ts.transpileModule(code, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
} }).outputText;
const mod = { exports: {} };
new Function("exports", "module", js)(mod.exports, mod);
const { normalizeTeacherSchoolName, resolveTeacherSchoolTarget } = mod.exports;

test("selecting an existing school joins by its school ID", () => {
  assert.deepEqual(resolveTeacherSchoolTarget("school-abc", undefined), { kind: "existing", schoolId: "school-abc" });
  assert.deepEqual(resolveTeacherSchoolTarget(" school-abc ", ""), { kind: "existing", schoolId: "school-abc" });
});

test("not listed schools require a valid new school name", () => {
  assert.deepEqual(resolveTeacherSchoolTarget(undefined, " Filamer   Christian University "),
    { kind: "new", schoolName: "Filamer Christian University" });
  assert.equal(normalizeTeacherSchoolName("  State\n College   of   Technology  "), "State College of Technology");
});

test("school mode must be exclusive to prevent duplicate schools", () => {
  assert.equal(resolveTeacherSchoolTarget("school-abc", "Another School"), null);
  assert.equal(resolveTeacherSchoolTarget("", ""), null);
  assert.equal(resolveTeacherSchoolTarget(undefined, "  "), null);
  assert.equal(resolveTeacherSchoolTarget("  ", undefined), null);
});

test("invalid new school names are rejected and existing school IDs cannot be fabricated from names", () => {
  assert.equal(resolveTeacherSchoolTarget("", "A"), null);
  assert.equal(resolveTeacherSchoolTarget("", "School".repeat(33)), null);
  assert.deepEqual(resolveTeacherSchoolTarget("", "ABC School"), { kind: "new", schoolName: "ABC School" });
});
