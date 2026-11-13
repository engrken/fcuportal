const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loaded(relative) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const m = { exports: {} };
  new Function("require", "exports", "module", code)((id) => id === "./grades" ? grading : require(id), m.exports, m);
  return m.exports;
}
const grading = loaded("../src/lib/grades.ts");
const sim = loaded("../src/lib/grade-simulation.ts");
const item = (id, points, maxScore = 100, remark = null, title = id, weight = null) => ({ id, points, maxScore, remark, title, weight });
const sample = {
  id: "enrollment-a", code: "ECE 18", title: "Wireless", percent: null, finalGrade: null, remarks: "",
  categories: [
    { id: "quiz", name: "Lecture / Quiz", weight: 25, conversionBase: 50, assessments: [
      item("quiz-1", 80), item("quiz-2", null)
    ] },
    { id: "exam", name: "Lecture / Exam", weight: 65, conversionBase: 50, assessments: [
      item("exam-1", 40)
    ] },
    { id: "attendance", name: "Lecture / Attendance", weight: 10, conversionBase: 70, assessments: [
      item("day-1", null, 1, "PRESENT", "Attendance · 2026-11-01"),
      item("day-2", null, 1, "ABSENT", "Attendance · 2026-11-02")
    ] }
  ],
  gradeBands: [{ minPercent: 75, finalGrade: "3.00", remarks: "Passed" }, { minPercent: 0, finalGrade: "5.00", remarks: "Failed" }]
};
test("baseline simulator uses the exact grading engine and custom grade bands", () => {
  const result = sim.simulateStudentGrade(sample);
  assert.equal(result.items.length, 3);
  assert.equal(result.totalPercent, 73);
  assert.equal(result.equivalent.finalGrade, "5.00");
});
test("hypothetical score changes only the simulated total, not teacher-owned grade data", () => {
  const before = JSON.stringify(sample);
  const result = sim.simulateStudentGrade(sample, { "quiz-2": "90" });
  assert.equal(result.totalPercent, 73.63);
  assert.equal(JSON.stringify(sample), before);
  assert.equal(sample.categories[0].assessments[1].points, null);
});
test("hypothetically replacing recorded scores changes outcome and never writes original", () => {
  const changed = sim.simulateStudentGrade(sample, { "exam-1": "95" });
  assert.equal(changed.totalPercent, 90.88);
  assert.equal(changed.equivalent.finalGrade, "3.00");
  assert.equal(sample.categories[1].assessments[0].points, 40);
});
test("attendance hypothetical uses the actual attendance ratio, not academic base transmutation", () => {
  const result = sim.simulateStudentGrade(sample, { "day-2": "PRESENT" });
  assert.equal(result.items.find(x=>x.categoryId==="attendance").earnedCourse, 10);
  assert.equal(result.items.find(x=>x.categoryId==="attendance").percent, 100);
  const excused = sim.simulateStudentGrade(sample, { "day-2": "EXCUSED" });
  assert.equal(excused.items.find(x=>x.categoryId==="attendance").earnedCourse, 10);
});
test("invalid/out of range values do not affect the simulated result", () => {
  for (const bad of ["999", "-2", "2.333", "abc", ""]) {
    assert.equal(sim.simulateStudentGrade(sample, { "exam-1": bad }).totalPercent, sim.simulateStudentGrade(sample).totalPercent);
  }
  assert.equal(sim.invalidScenarioCount(sample, { "exam-1": "999" }), 1);
  assert.equal(sim.invalidScenarioCount(sample, { "day-1": "7" }), 1);
});
test("quick fill applies only to pending non-attendance scores", () => {
  const generated = sim.scenarioPendingScores(sample, .70);
  assert.deepEqual(generated, { "quiz-2": "70" });
  assert.deepEqual(sim.scenarioPendingScores(sample, 1), { "quiz-2": "100" });
});
test("no recorded scores result in null, not a synthetic failing grade", () => {
  const empty = { ...sample, categories: [{ id: "a", name: "Exam", weight: 100, conversionBase: 70, assessments: [item("future", null)] }] };
  assert.equal(sim.simulateStudentGrade(empty).totalPercent, null);
  assert.equal(sim.simulateStudentGrade(empty, { future: "80" }).totalPercent, 86);
});
