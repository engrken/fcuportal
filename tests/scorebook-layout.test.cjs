const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");
const raw = fs.readFileSync(path.join(__dirname, "../src/lib/scorebook-layout.ts"),"utf8");
const compiled=ts.transpileModule(raw,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function("exports","module",compiled)(m.exports,m);
const {buildWorkbookPages, workbookColumnBudget, estimateWorkbookSegmentWidth, workbookWidths}=m.exports;
const source=[
{id:"self",label:"Self-Evaluation",assessmentIds:["s1","s2","s3"]},
{id:"quizzes",label:"Quizzes",assessmentIds:["q1","q2","q3"]},
{id:"mid",label:"Midterm",assessmentIds:["m1"]},
{id:"final",label:"Final",assessmentIds:["f1"]},
{id:"lab",label:"Lab",assessmentIds:["l1","l2","l3","l4"]}
];
test("Auto-fit contains every assessment exactly once and preserves original order",()=>{
  for(const width of [760,900,1100,1440,1920,2560]){
    const pages=buildWorkbookPages(source,width);
    const actual=pages.flatMap(p=>p.segments.flatMap(s=>s.assessmentIds));
    assert.deepEqual(actual,source.flatMap(s=>s.assessmentIds));
    assert.equal(new Set(actual).size,actual.length);
  }
});
test("narrower workspaces show fewer assessment columns per page",()=>{
  assert.ok(buildWorkbookPages(source,900).length > buildWorkbookPages(source,2000).length);
});
test("each page fits the measured column budget at desktop widths",()=>{
  for (const width of [900,1100,1280,1600,1920]) {
    for (const page of buildWorkbookPages(source,width)) {
      const pixels=page.segments.reduce((sum,segment)=>sum+estimateWorkbookSegmentWidth(segment.assessmentIds.length,width),0);
      assert.ok(pixels<=workbookColumnBudget(width), `width ${width} exceeded by ${pixels-workbookColumnBudget(width)}`);
    }
  }
});
test("long individual category splits without hiding assessments or totals",()=>{
 const pages=buildWorkbookPages([{id:"ex",label:"Exercises",assessmentIds:Array.from({length:24},(_,i)=>String(i))}],980);
 assert.ok(pages.length>1);
 assert.equal(pages.flatMap(p=>p.segments.flatMap(s=>s.assessmentIds)).length,24);
 assert.ok(pages.every(p=>p.segments[0].totalParts===pages.length));
});
test("no category items does not create phantom pages",()=>{
 assert.deepEqual(buildWorkbookPages([],1200),[]);
 assert.deepEqual(buildWorkbookPages([{id:"a",label:"No items",assessmentIds:[]}],1200),[]);
});
test("student name and summary column widths remain useful",()=>{
 const w=workbookWidths(1500);
 assert.ok(w.student>=200);
 assert.ok(w.total>=100);
 assert.ok(w.final>=85);
 assert.ok(w.assessment>=75);
});
