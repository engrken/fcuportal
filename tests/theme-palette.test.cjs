const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = file => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function luminance(hex) {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(channel => parseInt(channel, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
}
function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

test("theme choices persist and update the shared footer immediately", () => {
  const theme = read("src/components/ThemeSync.tsx");
  const layout = read("src/app/layout.tsx");
  const portal = read("src/components/Portal.tsx");
  const manager = read("src/components/TenantManagement.tsx");
  const roster = read("src/components/TenantRoster.tsx");
  assert.match(layout, /<ThemeSync\s*\/>/);
  assert.match(layout, /<SiteFooter\s*\/>/);
  assert.match(theme, /document\.body\.dataset\.sagaTheme = theme/);
  assert.match(theme, /localStorage\.setItem\(storageKey, theme\)/);
  assert.match(theme, /window\.addEventListener\("storage", sync\)/);
  assert.match(theme, /window\.addEventListener\(changeEvent, sync\)/);
  for (const component of [portal, manager, roster]) {
    assert.match(component, /saveSagaTheme\(next\)/);
  }
  assert.match(portal, /data-saga-role=\{teacher \? "teacher" : "student"\}/);
});

test("student and teacher workspaces have distinct accessible palettes", () => {
  const css = read("src/app/globals.css");
  for (const selector of [
    '.portal-layout[data-saga-role="teacher"]',
    '.portal-layout[data-saga-role="student"]',
    '.portal-layout[data-bs-theme="dark"][data-saga-role="teacher"]',
    '.portal-layout[data-bs-theme="dark"][data-saga-role="student"]'
  ]) assert.ok(css.includes(selector), selector + " missing");
  const pairs = [
    ["#255991", "#ffffff"], // teacher primary actions
    ["#086d73", "#ffffff"], // student primary actions
    ["#165e75", "#ffffff"], // dark teacher actions
    ["#08646b", "#ffffff"], // dark student actions
    ["#165e66", "#e5f7f4"], // student hero title
    ["#456f74", "#e5f7f4"], // student explanatory text
    ["#193b64", "#eaf1fb"], // light teacher footer
    ["#174b53", "#eaf8f5"], // light student footer
    ["#eff6ff", "#15243a"], // dark teacher footer
    ["#e4f9f6", "#122d30"]  // dark student footer
  ];
  for (const [foreground, background] of pairs) {
    assert.ok(contrast(foreground, background) >= 4.5,
      `Insufficient AA contrast for ${foreground} on ${background}`);
  }
});

test("global footer adapts to role and appearance and stays out of print", () => {
  const css = read("src/app/globals.css");
  assert.match(css, /body\[data-saga-theme="dark"\] \.saga-site-footer/);
  assert.match(css, /body:has\(\.portal-layout\[data-saga-role="student"\]\) \.saga-site-footer/);
  assert.match(css, /body:has\(\.portal-layout\[data-saga-role="teacher"\]\) \.saga-site-footer/);
  assert.match(css, /body\[data-saga-theme="dark"\]:has\(\.portal-layout\[data-saga-role="student"\]\)/);
  assert.match(css, /body\[data-saga-theme="dark"\]:has\(\.portal-layout\[data-saga-role="teacher"\]\)/);
  assert.match(css, /@media print\{[\s\S]*?\.saga-site-footer\{display:none!important\}/);
  assert.match(css, /@media\(max-width:760px\)/);
});
