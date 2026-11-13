const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/tenant-operations.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const mod = { exports: {} };
new Function("exports", "module", compiled)(mod.exports, mod);
const { daysUntil, tenantHealth, csvCell } = mod.exports;

const base = {
  isActive: true, subscriptionStatus: "ACTIVE",
  subscriptionExpiresAt: "2027-01-15T00:00:00.000Z",
  teacherCount: 2, verifiedTeacherCount: 2, classCount: 4
};

test("subscription expiry uses Philippine-local calendar days", () => {
  assert.equal(daysUntil("2026-11-13T00:00:00.000Z", "2026-11-13"), 0);
  assert.equal(daysUntil("2026-11-14T00:00:00.000Z", "2026-11-13"), 1);
  assert.equal(daysUntil("2026-11-12T00:00:00.000Z", "2026-11-13"), -1);
  assert.equal(daysUntil(null, "2026-11-13"), null);
});

test("school health distinguishes active, expiring and expired dates", () => {
  assert.deepEqual(tenantHealth(base, "2026-11-13"), { level: "good", label: "Operational" });
  assert.deepEqual(tenantHealth({ ...base, subscriptionExpiresAt: "2026-11-25T00:00:00.000Z" }, "2026-11-13"), { level: "warning", label: "Expires in 12d" });
  assert.deepEqual(tenantHealth({ ...base, subscriptionExpiresAt: "2026-11-13T00:00:00.000Z" }, "2026-11-13"), { level: "warning", label: "Expires today" });
  assert.deepEqual(tenantHealth({ ...base, subscriptionExpiresAt: "2026-11-12T00:00:00.000Z" }, "2026-11-13"), { level: "danger", label: "Expiry date passed" });
});

test("school health highlights setup and verified teacher onboarding gaps", () => {
  assert.equal(tenantHealth({ ...base, teacherCount: 0 }, "2026-11-13").label, "Needs first teacher");
  assert.equal(tenantHealth({ ...base, verifiedTeacherCount: 0 }, "2026-11-13").label, "Verify teacher accounts");
  assert.equal(tenantHealth({ ...base, classCount: 0 }, "2026-11-13").label, "No classes created");
  assert.deepEqual(tenantHealth({ ...base, subscriptionStatus: "PAST_DUE", isActive: false }, "2026-11-13"), { level: "danger", label: "Past due · Inactive" });
  assert.equal(tenantHealth({ ...base, subscriptionStatus: "SUSPENDED", isActive: false }, "2026-11-13").label, "Suspended");
});

test("CSV export neutralizes formula input and escapes quotes and line breaks", () => {
  assert.equal(csvCell('School "Alpha"'), '"School ""Alpha"""');
  assert.equal(csvCell("=HYPERLINK(\"unsafe\")"), '"\'=HYPERLINK(""unsafe"")"');
  assert.equal(csvCell(" +SUM(1,2)"), '"\' +SUM(1,2)"');
  assert.equal(csvCell("@SUM(1,2)"), '"\'@SUM(1,2)"');
  assert.equal(csvCell("hello\nworld"), '"hello\nworld"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(499), '"499"');
});
