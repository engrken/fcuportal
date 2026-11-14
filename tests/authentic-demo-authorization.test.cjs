const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("public demo session only allows the two synthetic tenant accounts", () => {
  const route = read("src/app/api/auth/demo/route.ts");
  const demo = read("src/lib/demo-access.ts");
  assert.match(route, /z\.enum\(\["TEACHER", "STUDENT"\]\)/);
  assert.match(route, /DEMO_USER_IDS\[parsed\.data\.role\]/);
  assert.match(route, /user\.schoolId !== school\.id/);
  assert.match(route, /createSession\(user, false, true\)/);
  assert.match(route, /checkAuthThrottle/);
  assert.match(route, /Cross-site demo sign-in/);
  assert.match(demo, /DEMO_SCHOOL_SLUG = "saga-demo"/);
  assert.match(demo, /saga-demo-teacher-2026/);
  assert.match(demo, /saga-demo-student-2026/);
});

test("demo sessions are short-lived, school-bound, never tenant manager, and only permit reads", () => {
  const auth = read("src/lib/auth.ts");
  const proxy = read("src/proxy.ts");
  assert.match(auth, /demo \? "45m" : "7d"/);
  assert.match(auth, /isDemoIdentity\(user\)/);
  assert.match(auth, /payload\.role !== user\.role/);
  assert.match(auth, /payload\.schoolId !== user\.schoolId/);
  assert.match(auth, /!isDemo && payload\.managerVerified === true/);
  assert.match(proxy, /jwtVerify\(token/);
  assert.match(proxy, /payload\.demo === true/);
  assert.match(proxy, /status: 403/);
  assert.match(proxy, /\["GET", "HEAD", "OPTIONS"\]/);
  assert.match(proxy, /path === "\/api\/auth\/demo" \|\| path === "\/api\/auth\/logout"/);
  assert.match(proxy, /matcher: \["\/api\/:path\*"\]/);
});

test("fictional school is hidden from ordinary school selection", () => {
  const schools = read("src/app/api/schools/route.ts");
  assert.match(schools, /DEMO_SCHOOL_SLUG/);
  assert.match(schools, /slug: \{ not: DEMO_SCHOOL_SLUG \}/);
});
