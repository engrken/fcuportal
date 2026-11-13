import { createHash, randomBytes } from "node:crypto";

// A 32-character alphabet avoids 0/O and 1/I confusion and uses unbiased
// random bytes: 12 symbols represent 60 bits of code space.
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateClassJoinCode() {
  return Array.from(randomBytes(12), byte => alphabet[byte % 32]).join("");
}

export function normalizeClassJoinCode(value: string) {
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{12}$/.test(code) ? code : null;
}

export function hashClassJoinCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function formatClassJoinCode(code: string) {
  return code.match(/.{1,4}/g)?.join("-") || code;
}
