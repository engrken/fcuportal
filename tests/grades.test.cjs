const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

// Run actual production calculator code without requiring Next.js or a database.
const source = fs.readFileSync(path.join(__dirname, "../src/lib/grades.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const calculatorExports = {};
new Function("exports", "module", compiled)(calculatorExports, { exports: calculatorExports });
const { calculateCategoryPercent, calculateGradeBreakdown, calculateFinal, convertRawPercent } = calculatorExports;
const scored = (points, maxScore = 100, title = "Exam", remark = null, weight = null) =>
  ({ title, maxScore, weight, scores: [{ points, remark }] });
const pending = (maxScore = 100, title = "Exam", weight = null) =>
  ({ title, maxScore, weight, scores: [] });
const cat = (id, parentId, weight, assessments = [], conversionBase = 100) =>
  ({ id, parentId, weight, assessments, conversionBase });

test("transmutation respects school passing base", () => {
  assert.equal(convertRawPercent(70, 70), 79);
  assert.equal(convertRawPercent(50, 50), 75);
  assert.equal(convertRawPercent(100, 70), 100);
});

test("Lecture 60% and child 15% contributes a maximum 9% of course", () => {
  const categories = [
    cat("lecture", null, 60),
    cat("quizzes", "lecture", 15, [scored(70)])
  ];
  const breakdown = calculateGradeBreakdown(categories);
  const quiz = breakdown.items.find(item => item.categoryId === "quizzes");
  assert.equal(quiz.courseWeight, 9);
  assert.equal(quiz.earnedCourse, 6.3);
  assert.equal(quiz.withinRootWeight, 15);
  assert.equal(quiz.earnedWithinRoot, 10.5);
  assert.equal(calculateFinal(categories), 6.3);
});

test("three-level major examination uses the root-group allocation (not double multiplication)", () => {
  const categories = [
    cat("lecture", null, 60),
    cat("major", "lecture", 50),
    cat("prelim", "major", 10, [scored(75)])
  ];
  const result = calculateGradeBreakdown(categories);
  assert.equal(result.items[0].courseWeight, 6);
  assert.equal(result.items[0].earnedCourse, 4.5);
  assert.equal(result.items[0].earnedWithinRoot, 7.5);
});

test("base 70 exams show course contribution after transmutation", () => {
  const categories = [cat("exam", null, 15, [scored(80)], 70)];
  const result = calculateGradeBreakdown(categories);
  assert.equal(result.items[0].percent, 86);
  assert.equal(result.items[0].earnedCourse, 12.9);
  assert.equal(result.totalPercent, 12.9);
});

test("attendance ignores grade-transmutation base and excludes excused dates", () => {
  const assessments = [
    scored(null, 1, "Attendance · 2026-11-01", "PRESENT"),
    scored(null, 1, "Attendance · 2026-11-02", "PRESENT"),
    scored(null, 1, "Attendance · 2026-11-03", "ABSENT"),
    scored(null, 1, "Attendance · 2026-11-04", "EXCUSED")
  ];
  const data = calculateGradeBreakdown([cat("attendance", null, 10, assessments, 70)]);
  assert.equal(data.items[0].percent, 66.67);
  assert.equal(data.items[0].earnedCourse, 6.67);
  assert.equal(data.items[0].excusedItems, 1);
  assert.equal(data.items[0].pendingItems, 0);
});

test("blank score is pending; recorded zero is not a pending score", () => {
  const items = [scored(100), pending()];
  const first = calculateGradeBreakdown([cat("tests", null, 25, items, 50)]);
  assert.equal(first.items[0].percent, 100);
  assert.equal(first.items[0].earnedCourse, 25);
  assert.equal(first.items[0].pendingItems, 1);
  const second = calculateGradeBreakdown([cat("tests", null, 25, [scored(100), scored(0)], 50)]);
  assert.equal(second.items[0].percent, 75);
  assert.equal(second.items[0].earnedCourse, 18.75);
  assert.equal(second.items[0].pendingItems, 0);
});

test("EXCUSED is omitted; ABSENT and DID_NOT_SUBMIT are recorded as zero raw marks", () => {
  assert.equal(calculateCategoryPercent({ conversionBase: 100, assessments: [scored(80), scored(null, 100, "Quiz", "EXCUSED")] }), 80);
  assert.equal(calculateCategoryPercent({ conversionBase: 100, assessments: [scored(80), scored(null, 100, "Quiz", "ABSENT")] }), 40);
  assert.equal(calculateCategoryPercent({ conversionBase: 100, assessments: [scored(80), scored(null, 100, "Quiz", "DID_NOT_SUBMIT")] }), 40);
});

test("explicitly weighted questions normalize over recorded and non-excused assessments", () => {
  const quiz = [scored(80, 100, "Quiz A", null, 25), pending(100, "Quiz B", 75)];
  assert.equal(calculateCategoryPercent({ conversionBase: 100, assessments: quiz }), 80);
  assert.equal(calculateCategoryPercent({ conversionBase: 100, assessments: [scored(80,100,"Quiz A",null,25),scored(40,100,"Quiz B",null,75)] }), 50);
});

test("all score cells blank: final is null rather than a failing zero", () => {
  const data = calculateGradeBreakdown([cat("lecture", null, 100, [pending()])]);
  assert.equal(data.totalPercent, null);
  assert.equal(data.items[0].pendingItems, 1);
});

test("displayed earned course parts add to displayed final percent", () => {
  const categories = [
    cat("lecture",null,60),
    cat("major","lecture",50),
    cat("prelim","major",10,[scored(72)]),
    cat("midterm","major",15,[scored(78)]),
    cat("finals","major",25,[scored(91)]),
    cat("self","lecture",25,[scored(65)]),
    cat("quiz","lecture",15,[scored(95)]),
    cat("att","lecture",10,[scored(null,1,"Attendance · 2026-11-06","PRESENT"),scored(null,1,"Attendance · 2026-11-07","ABSENT")],70),
    cat("lab",null,40),
    cat("labexam","lab",50,[scored(77)]),
    cat("labwork","lab",50,[scored(83)])
  ];
  const data = calculateGradeBreakdown(categories);
  assert.equal(data.items.reduce((sum,item)=>sum+item.courseWeight,0),100);
  assert.equal(Math.round(data.items.reduce((sum,item)=>sum+(item.earnedCourse||0),0)*100)/100, data.totalPercent);
  assert.equal(calculateFinal(categories),data.totalPercent);
});

test("fully recorded perfect course returns 100 across nested categories", () => {
  const c=[cat("lec",null,60),cat("exam","lec",25,[scored(100)]),cat("quiz","lec",75,[scored(100)]),cat("lab",null,40),cat("experiment","lab",100,[scored(100)])];
  assert.equal(calculateFinal(c),100);
});
