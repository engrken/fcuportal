import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ currentPassword: z.string().min(1).max(100), newEmail: z.string().trim().email().max(200), code: z.string().regex(/^\d{6}$/) });

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to change your email." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid new email, your current password, and the six-digit verification code." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `profile-email-change:${user.id}`, 5);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many email change attempts. Try again in 15 minutes." }, { status: 429 });
  const newEmail = parsed.data.newEmail.toLowerCase();
  const account = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { email: true, passwordHash: true } });
  if (!account || !(await bcrypt.compare(parsed.data.currentPassword, account.passwordHash))) return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  if (newEmail === account.email.toLowerCase()) return NextResponse.json({ error: "That is already your sign-in email." }, { status: 409 });
  if (await prisma.user.findFirst({ where: { schoolId: user.schoolId, email: newEmail }, select: { id: true } })) return NextResponse.json({ error: "An account in this school already uses that email." }, { status: 409 });

  const otp = await prisma.securityOtp.findFirst({ where: { userId: user.id, purpose: "EMAIL_CHANGE", target: newEmail, usedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
  if (!otp) return NextResponse.json({ error: "The verification code is invalid or expired. Request a new code." }, { status: 400 });
  if (!(await bcrypt.compare(parsed.data.code, otp.codeHash))) {
    await prisma.securityOtp.updateMany({ where: { id: otp.id, usedAt: null }, data: { attempts: { increment: 1 } } });
    return NextResponse.json({ error: "The verification code is incorrect." }, { status: 400 });
  }
  try {
    await prisma.$transaction(async tx => {
      const claimed = await tx.securityOtp.updateMany({ where: { id: otp.id, userId: user.id, purpose: "EMAIL_CHANGE", target: newEmail, usedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new Error("OTP_INVALID");
      await tx.user.update({ where: { id: user.id }, data: { email: newEmail } });
      await tx.emailChangeToken.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "changed account sign-in email", entity: "user", entityId: user.id } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OTP_INVALID") return NextResponse.json({ error: "The verification code is invalid or expired. Request a new code." }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account in this school already uses that email." }, { status: 409 });
    throw error;
  }
  await sendPortalEmail({ to: account.email, subject: "Your SAGA sign-in email was changed", text: `The sign-in email for your SAGA account was changed to ${newEmail}. If you did not make this change, use password recovery immediately and contact the portal administrator.` }).catch(error => console.error("Email change notification failed", error));
  return NextResponse.json({ ok: true, message: "Your sign-in email has been changed." });
}
