const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function setup({ failingAddress } = {}) {
  const records = new Map();
  const deliveries = new Map();
  const table = {
    async create({ data }) { records.set(data.id, { attempts: 0, usedAt: null, ...data }); },
    async deleteMany({ where }) { return { count: where.id && records.delete(where.id) ? 1 : 0 }; },
    async updateMany({ where, data }) {
      const row = records.get(where.id);
      if (!row || row.bindingHash !== where.bindingHash || row.usedAt !== null
          || row.expiresAt <= where.expiresAt.gt || row.attempts >= where.attempts.lt
          || (where.codeHash && row.codeHash !== where.codeHash)) return { count: 0 };
      if (data.usedAt) row.usedAt = data.usedAt;
      if (data.attempts) row.attempts += data.attempts.increment;
      return { count: 1 };
    }
  };
  const db = { emailVerificationChallenge: table };
  const mocks = {
    "@/lib/prisma": { prisma: db },
    "@/lib/mailer": { sendPortalEmail: async ({ to, text }) => {
      if (to === failingAddress) throw new Error("SMTP delivery failed");
      deliveries.set(to, text.match(/\b\d{6}\b/)[0]);
    } }
  };
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/email-verification.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const scopedRequire = name => mocks[name] || require(name);
  new Function("require", "exports", "process", compiled)(scopedRequire, exports, { env: { AUTH_SECRET: "synthetic-signing-secret-for-unit-tests" } });
  return { db, records, code: (email = [...deliveries.keys()][0]) => deliveries.get(email), ...exports };
}

test("verification is bound to its school, account and purpose and can be consumed once", async () => {
  const { issueEmailChallenge, consumeEmailChallenge, db, code } = setup();
  const binding = ["quick-check", "school-1", "student-1", "student@example.test"];
  const id = await issueEmailChallenge(binding, binding[3]);
  assert.equal(await consumeEmailChallenge(db, ["quick-check", "school-2", ...binding.slice(2)], id, code()), false);
  assert.equal(await consumeEmailChallenge(db, ["register", ...binding.slice(1)], id, code()), false);
  const results = await Promise.all([consumeEmailChallenge(db, binding, id, code()), consumeEmailChallenge(db, binding, id, code())]);
  assert.deepEqual(results.sort(), [false, true]);
});

test("expired and repeatedly guessed codes cannot be redeemed", async () => {
  const { issueEmailChallenge, consumeEmailChallenge, db, records, code } = setup();
  const binding = ["sign-in", "user-1", "school-1", "student@example.test"];
  const expired = await issueEmailChallenge(binding, binding[3]);
  records.get(expired).expiresAt = new Date(0);
  assert.equal(await consumeEmailChallenge(db, binding, expired, code()), false);
  const guessed = await issueEmailChallenge(binding, binding[3]);
  const wrong = code() === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal(await consumeEmailChallenge(db, binding, guessed, wrong), false);
  assert.equal(await consumeEmailChallenge(db, binding, guessed, code()), false);
});

test("an email change requires codes from both addresses on the same challenge", async () => {
  const { issueEmailChangeChallenge, consumeEmailChallenge, db, code } = setup();
  const current = "current@example.test";
  const next = "new@example.test";
  const binding = ["profile-email-change", "account-1", "school-1", current, next];
  const id = await issueEmailChangeChallenge(binding, current, next);
  const pair = code(current) + code(next);
  const wrongCurrentCode = code(current) === "000000" ? "111111" : "000000";
  const wrongNewCode = code(next) === "000000" ? "111111" : "000000";
  assert.equal(await consumeEmailChallenge(db, binding, id, wrongCurrentCode + code(next)), false);
  assert.equal(await consumeEmailChallenge(db, binding, id, code(current) + wrongNewCode), false);
  assert.equal(await consumeEmailChallenge(db, [...binding, "other@example.test"], id, pair), false);
  assert.equal(await consumeEmailChallenge(db, binding, id, pair), true);
  assert.equal(await consumeEmailChallenge(db, binding, id, pair), false);
});

test("an email change challenge is removed when one address cannot receive the code", async () => {
  const current = "current@example.test";
  const next = "new@example.test";
  const { issueEmailChangeChallenge, records, code } = setup({ failingAddress: next });
  await assert.rejects(issueEmailChangeChallenge(["profile-email-change", current, next], current, next));
  assert.match(code(current), /^\d{6}$/);
  assert.equal(records.size, 0);
});
