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

function verificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function issueEmailChallenge(binding: string[], email: string) {
  const code = verificationCode();
  return issueChallenge(binding, code, () => sendPortalEmail({
    to: email,
    subject: "Your SAGA email verification code",
    text: `Enter this verification code in SAGA: ${code}\n\nThe code expires in 10 minutes. If you did not request it, you can ignore this email.`
  }));
}

export function issueEmailChangeChallenge(binding: string[], currentEmail: string, newEmail: string) {
  const currentCode = verificationCode();
  const newCode = verificationCode();
  return issueChallenge(binding, currentCode + newCode, async () => {
    const results = await Promise.allSettled([
      sendPortalEmail({
        to: currentEmail,
        subject: "SAGA email change code for your current address",
        text: `Use ${currentCode} in SAGA to approve changing your sign-in email to ${newEmail}.\n\nThe code expires in 10 minutes. If you did not request this change, do not share this code and contact your portal administrator.`
      }),
      sendPortalEmail({
        to: newEmail,
        subject: "SAGA email change code for your new address",
        text: `Use ${newCode} in SAGA to verify this as your new sign-in email.\n\nThe code expires in 10 minutes. If you did not request this change, you can ignore this message.`
      })
    ]);
    if (results.some(result => result.status === "rejected")) throw new Error("EMAIL_CHANGE_DELIVERY_FAILED");
  });
}

async function issueChallenge(binding: string[], code: string, deliver: () => Promise<void>) {
  const id = opaqueChallengeId();
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
    await deliver();
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
