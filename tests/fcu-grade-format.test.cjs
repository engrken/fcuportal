const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync("src/components/Portal.tsx", "utf8");
const start = source.indexOf("async function downloadFcuGradeXlsx(");
const end = source.indexOf("function categoryPercent(", start);
assert.ok(start > 0 && end > start, "FCU exporter is present");
const compiled = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

const columns = index => {
  let n = index + 1, value = "";
  while (n) { n--; value = String.fromCharCode(65 + n % 26) + value; n = Math.floor(n / 26); }
  return value;
};
const escape = value => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");

async function generate(categories, enrollments) {
  let saved;
  const context = {
    Uint8Array, Number, String, Math, Set, console, Blob, TextEncoder,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    document: { createElement: () => ({ click() {} }) },
    setTimeout() {},
    fetch: async path => {
      assert.equal(path, "/fcu-grading-header.png");
      return { ok: true, arrayBuffer: async () => Uint8Array.from([137, 80, 78, 71]).buffer };
    },
    zipStored: files => { saved = files; return Uint8Array.from([80, 75]); },
    excelColumn: columns,
    xmlEscape: escape,
    weightedCategoryPercent: (enrollment, category) => enrollment.equivalents[category.id] ?? null,
    effectiveCategoryWeight: category => category.weight
  };
  vm.runInNewContext(compiled + "\nthis.generateGradeFile = downloadFcuGradeXlsx;", context);
  const detail = {
    code: "ECE 16", title: "Design 1/Capstone Project 1",
    classId: "BSECE 4", term: "First Semester", academicYear: "2026-2027",
    categories, enrollments,
    assessments: [],
    gradeBands: [{ minPercent: 75, finalGrade: "2.00", remarks: "PASSED" }]
  };
  await context.generateGradeFile("demo.xlsx", "FCU Grading Sheet", detail, categories, "Faculty Example");
  assert.ok(saved, "xlsx files created");
  return Object.fromEntries(saved.map(file => [file.name, file.content]));
}
const student = (name, equivalents, finalPercent = 95, remarks = "") => ({
  studentName: name, equivalents, finalPercent, finalGradeOverride: null, remarks
});

test("FCU export reproduces the approved sheet hierarchy and Folio print format", async () => {
  const cats = [{ id: "EXAM", name: "EXAM", weight: 25 }, { id: "LECT", name: "LECT", weight: 75 }];
  const files = await generate(cats, [
    student("Example Student", { EXAM: 80, LECT: 100 }),
    student("Incomplete Student", { EXAM: null, LECT: null }, null, "INC")
  ]);
  const sheet = files["xl/worksheets/sheet1.xml"];
  const styles = files["xl/styles.xml"];
  assert.match(sheet, /<mergeCell ref="A1:K9"/);
  assert.match(sheet, /<mergeCell ref="A15:D15"/);
  assert.match(sheet, /<mergeCell ref="A17:D17"/);
  assert.match(sheet, /<mergeCell ref="E15:F15"/);
  assert.match(sheet, /<mergeCell ref="G15:H15"/);
  assert.match(sheet, /<mergeCell ref="E17:F17"/);
  assert.match(sheet, /<mergeCell ref="G17:H17"/);
  assert.match(sheet, /<pageSetup paperSize="14" orientation="portrait" fitToWidth="1"/);
  assert.match(sheet, /<c r="A11"[^>]*><is>.*?<u\/>.*?ECE 16/s);
  assert.match(sheet, /<c r="A13"[^>]*><is>.*?First Semester/s);
  assert.match(sheet, /<c r="A15"[^>]*>.*?NAME OF STUDENTS/s);
  assert.match(sheet, /<c r="A17"[^>]*>.*?1\. EXAMPLE STUDENT/s);
  assert.match(sheet, /<c r="I17"[^>]*><v>95<\/v>/);
  assert.match(sheet, /<c r="K18"[^>]*>.*?INC/s);
  assert.doesNotMatch(sheet, /<c r="E18"[^>]*><v>/);
  assert.match(styles, /numFmtId="164"/);
  assert.ok(files["xl/drawings/drawing1.xml"]);
  assert.ok(files["xl/media/image1.png"]);
  assert.doesNotMatch(sheet, /Example Student ID/);
});

test("FCU export retains individual columns for four grading components", async () => {
  const cats = ["EXAM", "SE", "LECT", "LAB"].map((id, i) => ({ id, name: id, weight: [30, 20, 30, 20][i] }));
  const files = await generate(cats, [student("Student Name", { EXAM: 100, SE: 100, LECT: 100, LAB: 100 }, 100)]);
  const sheet = files["xl/worksheets/sheet1.xml"];
  assert.match(sheet, /<c r="E15"[^>]*>.*?: EXAM :/s);
  assert.match(sheet, /<c r="H15"[^>]*>.*?: LAB :/s);
  assert.match(sheet, /<c r="I15"[^>]*>.*?: TG :/s);
  assert.match(sheet, /<c r="J15"[^>]*>.*?: FG :/s);
  assert.match(sheet, /<c r="K15"[^>]*>.*?: REMARKS :/s);
  assert.doesNotMatch(sheet, /<mergeCell ref="E17:F17"/);
});
