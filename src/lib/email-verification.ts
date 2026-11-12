import { createHmac, randomBytes, randomInt } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";

export const emailVerificationFields = {
  challengeId: z.string().regex(/^[a-f0-9]{48}$/).optional(),
  code: z.string().regex(/^\d{6}$/).optional()
};

export function opaqueChallengeId() {
  return randomBytes(24).toString("hex");
}

function digest(values: string[]) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("Email verification is unavailable.");
  return createHmac("sha256", secret).update(JSON.stringify(values)).digest("hex");
}

export async function issueEmailChallenge(binding: string[], email: string) {
  const id = opaqueChallengeId();
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const now = new Date();
  await prisma.emailVerificationChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.emailVerificationChallenge.create({
    data: {
      id,
      bindingHash: digest(["binding", ...binding]),
      codeHash: digest(["code", id, code]),
      expiresAt: new Date(now.getTime() + 10 * 60 * 1000)
    }
  });
  try {
    await sendPortalEmail({
      to: email,
      subject: "Your SAGA email verification code",
      text: `Enter this verification code in SAGA: ${code}\n\nThe code expires in 10 minutes. If you did not request it, you can ignore this email.`
    });
  } catch (error) {
    await prisma.emailVerificationChallenge.deleteMany({ where: { id } });
    throw error;
  }
  return id;
}

export async function consumeEmailChallenge(
  db: Pick<Prisma.TransactionClient, "emailVerificationChallenge">,
  binding: string[],
  id: string,
  code: string
) {
  const now = new Date();
  const where = {
    id,
    bindingHash: digest(["binding", ...binding]),
    usedAt: null,
    expiresAt: { gt: now },
    attempts: { lt: 5 }
  };
  const result = await db.emailVerificationChallenge.updateMany({
    where: { ...where, codeHash: digest(["code", id, code]) },
    data: { usedAt: now }
  });
  if (result.count === 1) return true;
  await db.emailVerificationChallenge.updateMany({ where, data: { attempts: { increment: 1 } } });
  return false;
}
