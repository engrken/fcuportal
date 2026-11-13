const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = relative => fs.readFileSync(path.join(root, relative), "utf8");

test("release manifest, npm package and lockfile agree", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  const releases = JSON.parse(read("src/data/releases.json"));
  assert.equal(pkg.version, lock.version);
  assert.equal(pkg.version, lock.packages[""].version);
  assert.equal(pkg.version, releases[0].version);
  assert.ok(releases[0].changes.length > 0);
  assert.match(pkg.scripts["version:fix"], /bump-release\.mjs fix/);
  assert.match(pkg.scripts["version:feature"], /bump-release\.mjs feature/);
});

test("release bump policy distinguishes fixes, features and breaking updates", async () => {
  const { nextReleaseVersion } = await import(pathToFileURL(path.join(root, "scripts/bump-release.mjs")).href);
  assert.equal(nextReleaseVersion("0.2.0-beta.1", "fix"), "0.2.0-beta.2");
  assert.equal(nextReleaseVersion("0.2.0-beta.9", "feature"), "0.3.0-beta.1");
  assert.equal(nextReleaseVersion("0.2.0-beta.1", "major"), "1.0.0-beta.1");
  assert.equal(nextReleaseVersion("1.4.0", "fix"), "1.4.1-beta.1");
  assert.throws(() => nextReleaseVersion("bad", "fix"));
  assert.throws(() => nextReleaseVersion("1.2.3", "other"));
});

test("global footer uses committed version and deployment build, including privacy link", () => {
  const layout = read("src/app/layout.tsx");
  const footer = read("src/components/SiteFooter.tsx");
  const css = read("src/app/globals.css");
  assert.match(layout, /<SiteFooter\s*\/>/);
  assert.match(footer, /packageJson\.version/);
  assert.match(footer, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(footer, /href="\/privacy"/);
  assert.match(footer, /href="\/updates"/);
  assert.match(footer, /All rights reserved/);
  assert.match(footer, /Engr\. Bulquerin/);
  assert.match(css, /@media print\{[\s\S]*?\.saga-site-footer\{display:none!important\}/);
  assert.doesNotMatch(read("src/components/LandingPage.tsx"), /<footer className="saga-footer">/);
});

test("public release history follows the shared version manifest", () => {
  const page = read("src/app/updates/page.tsx");
  assert.match(page, /releases\.map\(/);
  assert.match(page, /packageJson\.version/);
  assert.match(page, /VERCEL_GIT_COMMIT_SHA/);
});
