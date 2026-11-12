const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function setup() {
  const records = new Map();
  let deliveredCode;
  const table = {
    async create({ data }) { records.set(data.id, { attempts: 0, usedAt: null, ...data }); },
    async deleteMany() { return { count: 0 }; },
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
    "@/lib/mailer": { sendPortalEmail: async ({ text }) => { deliveredCode = text.match(/\b\d{6}\b/)[0]; } }
  };
  const source = fs.readFileSync(path.join(__dirname, "../src/lib/email-verification.ts"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  const scopedRequire = name => mocks[name] || require(name);
  new Function("require", "exports", "process", compiled)(scopedRequire, exports, { env: { AUTH_SECRET: "synthetic-signing-secret-for-unit-tests" } });
  return { db, records, code: () => deliveredCode, ...exports };
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
