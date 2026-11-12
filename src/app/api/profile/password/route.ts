import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ currentPassword: z.string().min(1).max(100), newPassword: z.string().min(12).max(100), code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to change your password." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter your current password, a new password with at least 12 characters, and the six-digit verification code." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `profile-password-change:${user.id}`, 5);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many password change attempts. Try again in 15 minutes." }, { status: 429 });
  const account = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { email: true, emailIdentityChangedAt: true, passwordHash: true } });
  if (!account || !(await bcrypt.compare(parsed.data.currentPassword, account.passwordHash))) return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  if (await bcrypt.compare(parsed.data.newPassword, account.passwordHash)) return NextResponse.json({ error: "Choose a new password that differs from your current one." }, { status: 400 });
  const otp = await prisma.securityOtp.findFirst({ where: { userId: user.id, purpose: "PASSWORD_CHANGE", target: account.email.toLowerCase(), usedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!otp) return NextResponse.json({ error: "The verification code is invalid or expired. Request a new code." }, { status: 400 });
  if (!(await bcrypt.compare(parsed.data.code, otp.codeHash))) {
    await prisma.securityOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "The verification code is incorrect." }, { status: 400 });
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  try {
    await prisma.$transaction(async tx => {
      const updated = await tx.user.updateMany({
        where: { id: user.id, email: account.email, emailIdentityChangedAt: account.emailIdentityChangedAt, passwordHash: account.passwordHash },
        data: { passwordHash, passwordChangedAt: new Date() }
      });
      if (updated.count !== 1) throw new Error("OTP_INVALID");
      const claimed = await tx.securityOtp.updateMany({ where: { id: otp.id, userId: user.id, purpose: "PASSWORD_CHANGE", target: account.email.toLowerCase(), usedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("OTP_INVALID");
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.securityOtp.deleteMany({ where: { userId: user.id, id: { not: otp.id } } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "changed account password", entity: "user", entityId: user.id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OTP_INVALID") return NextResponse.json({ error: "The verification code is invalid or expired. Request a new code." }, { status: 400 });
    throw error;
  }
  await sendPortalEmail({ to: account.email, subject: "Your SAGA password was changed", text: "The password for your SAGA account was changed. If you did not make this change, use password recovery immediately and contact the portal administrator." }).catch(error => console.error("Password change notification failed", error));
  return NextResponse.json({ ok: true, message: "Password changed. Please sign in again with your new password." });
}
