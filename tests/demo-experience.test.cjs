const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("the demo is public, discoverable, and uses only existing experiences", () => {
  const page = read("src/app/demo/page.tsx");
  const landing = read("src/components/LandingPage.tsx");
  const demo = read("src/components/DemoWorkspace.tsx");
  assert.match(page, /<DemoWorkspace\s*\/>/);
  assert.match(landing, /<DemoPromo\s*\/>/);
  assert.match(landing, /href="\/demo"/);
  for (const role of ['role: "teacher"', 'role: "student"', 'role: "admin"']) {
    assert.ok(demo.includes(role), role);
  }
  assert.doesNotMatch(demo, /role:\s*["']dean["']/i);
});

test("public demo is local-only and cannot call account or academic record APIs", () => {
  const files = [
    "src/app/demo/page.tsx",
    "src/components/DemoWorkspace.tsx",
    "src/components/DemoPromo.tsx"
  ].map(read);
  for (const content of files) {
    assert.doesNotMatch(content, /\bfetch\s*\(/);
    assert.doesNotMatch(content, /@\/lib\/(auth|prisma)/);
    assert.doesNotMatch(content, /createSession|requireTenantManager|localStorage|sessionStorage/);
  }
  const demo = files[1];
  assert.match(demo, /setMarks\(/);
  assert.match(demo, /setAttendance\(/);
  assert.match(demo, /reset\s*=\s*\(\)/);
  assert.match(demo, /Fictional data only/);
});

test("the demo is navigable and styles are scoped", () => {
  const component = read("src/components/DemoWorkspace.tsx");
  const css = read("src/components/DemoWorkspace.module.css");
  assert.match(component, /aria-label="Demo navigation"/);
  assert.match(component, /aria-label=\{"Attendance for "/);
  assert.match(component, /role="status"/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /data-saga-theme="dark"/);
});
