const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const code = fs.readFileSync(path.join(__dirname, "../src/lib/class-invite-code.ts"), "utf8");
const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function("require", "exports", "module", js)(require, mod.exports, mod);
const { generateClassJoinCode, normalizeClassJoinCode, hashClassJoinCode, formatClassJoinCode } = mod.exports;

test("invitation codes are generated with 60 bits of secure random entropy", () => {
  const codes = Array.from({ length: 100 }, () => generateClassJoinCode());
  assert.equal(new Set(codes).size, codes.length);
  for (const value of codes) {
    assert.match(value, /^[A-HJ-NP-Z2-9]{12}$/);
    assert.equal(normalizeClassJoinCode(formatClassJoinCode(value)), value);
  }
});

test("join accepts grouped lowercase codes and rejects malformed values", () => {
  assert.equal(normalizeClassJoinCode("abcd-efgh-jklm"), "ABCDEFGHJKLM");
  assert.equal(normalizeClassJoinCode("ABCD EFGH JKLM"), "ABCDEFGHJKLM");
  assert.equal(normalizeClassJoinCode("ABCD-0FGH-JKLM"), null);
  assert.equal(normalizeClassJoinCode("ABCDEFGHIJKLM"), null);
  assert.equal(normalizeClassJoinCode(""), null);
});

test("only the deterministic code hash needs to be stored in the database", () => {
  const value = generateClassJoinCode();
  assert.match(hashClassJoinCode(value), /^[a-f0-9]{64}$/);
  assert.notEqual(hashClassJoinCode(value), value);
  assert.equal(hashClassJoinCode(value), hashClassJoinCode(normalizeClassJoinCode(formatClassJoinCode(value))));
});

test("student API and teacher API use the same code format", () => {
  const teacherSource = fs.readFileSync(path.join(__dirname, "../src/app/api/teacher/subjects/[subjectId]/invite/route.ts"), "utf8");
  const studentSource = fs.readFileSync(path.join(__dirname, "../src/app/api/student/classes/route.ts"), "utf8");
  assert.match(teacherSource, /generateClassJoinCode\(\)/);
  assert.match(teacherSource, /hashClassJoinCode\(code\)/);
  assert.match(studentSource, /normalizeClassJoinCode\(parsed\.data\.code\)/);
  assert.match(studentSource, /hashClassJoinCode\(code\)/);
  assert.match(studentSource, /schoolId: student\.schoolId/);
});
