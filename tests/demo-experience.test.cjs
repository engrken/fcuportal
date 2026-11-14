const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("public demo opens authentic SAGA screens, with a separately labeled practice simulator", () => {
  const page = read("src/app/demo/page.tsx");
  const chooser = read("src/components/ActualDemoEntry.tsx");
  const practice = read("src/app/demo/practice/page.tsx");
  const landing = read("src/components/LandingPage.tsx");
  const promo = read("src/components/DemoPromo.tsx");
  assert.match(page, /<ActualDemoEntry\s*\/>/);
  assert.match(practice, /<DemoWorkspace\s*\/>/);
  assert.match(chooser, /api\/auth\/demo/);
  assert.match(chooser, /"TEACHER"/);
  assert.match(chooser, /"STUDENT"/);
  assert.doesNotMatch(chooser, /"DEAN"/);
  assert.doesNotMatch(chooser, /"ADMIN"/);
  assert.match(chooser, /read-only/i);
  assert.match(promo, /actual Teacher or Student portal/);
  assert.match(landing, /<DemoPromo\s*\/>/);
  assert.match(landing, /href="\/demo"/);
});

test("older editable practice simulator remains local-only and is not mislabeled as actual SAGA", () => {
  const demo = read("src/components/DemoWorkspace.tsx");
  const practice = read("src/app/demo/practice/page.tsx");
  assert.doesNotMatch(demo, /\bfetch\s*\(/);
  assert.doesNotMatch(demo, /@\/lib\/(auth|prisma)/);
  assert.match(demo, /setMarks\(/);
  assert.match(demo, /setAttendance\(/);
  assert.match(demo, /reset\s*=\s*\(\)/);
  assert.match(practice, /not the real portal/i);
});

test("authentic demo navigation and styling remain mobile and theme aware", () => {
  const chooser = read("src/components/ActualDemoEntry.tsx");
  const css = read("src/components/DemoWorkspace.module.css");
  const realBanner = read("src/components/RealDemoBanner.tsx");
  const portal = read("src/components/Portal.tsx");
  assert.match(chooser, /actualRoleGrid/);
  assert.match(css, /@media\(max-width:760px\)\{\.actualRoleGrid/);
  assert.match(css, /data-saga-theme="dark"/);
  assert.match(portal, /user\.isDemo && <RealDemoBanner/);
  assert.match(realBanner, /READ-ONLY DEMO/);
});
