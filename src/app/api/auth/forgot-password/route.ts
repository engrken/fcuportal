import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailDeliveryConfigured, sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ schoolId: z.string().min(1), email: z.string().trim().email().max(200) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const schoolId = parsed.data.schoolId;
  const throttle = await checkAuthThrottle(request, `password-reset:${schoolId}:${email}`, 3);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many reset requests. Please try again in 15 minutes." }, { status: 429 });

  if (!emailDeliveryConfigured()) return NextResponse.json({ error: "Account recovery email is not configured yet. Please contact the portal administrator." }, { status: 503 });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const issued = await prisma.$transaction(async tx => {
    // Serialize recovery requests with email changes before issuing a link.
    const [user] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "schoolId" = ${schoolId} AND "email" = ${email}
        AND ("emailVerifiedAt" IS NOT NULL OR "emailIdentityChangedAt" IS NULL) FOR UPDATE
    `;
    if (!user) return false;
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    return true;
  });
  if (issued) {
    const origin = process.env.APP_URL || new URL(request.url).origin;
    const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await sendPortalEmail({ to: email, subject: "Reset your Student Grade Portal password", text: `A password reset was requested for your Student Grade Portal account.\n\nUse this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not request this, you can ignore this email.` });
    } catch {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      console.error("SECURITY_EVENT SAGA_PASSWORD_RECOVERY_MAIL_FAILED");
      return NextResponse.json({ error: "We could not send the recovery email. Please try again later or contact the portal administrator." }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true, message: "If an account exists for that email, a password reset link has been sent." });
}
