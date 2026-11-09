import { randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { emailDeliveryConfigured, sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({
  purpose: z.enum(["EMAIL_CHANGE", "PASSWORD_CHANGE"]),
  currentPassword: z.string().min(1).max(100),
  newEmail: z.string().trim().email().max(200).optional()
});

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}${"•".repeat(Math.min(Math.max(name.length - 1, 3), 8))}@${domain}`;
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to request a verification code." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success || (parsed.data.purpose === "EMAIL_CHANGE" && !parsed.data.newEmail)) {
    return NextResponse.json({ error: "Enter your current password and the required account details." }, { status: 400 });
  }
  const { purpose, currentPassword } = parsed.data;
  const throttle = await checkAuthThrottle(request, `profile-security-otp:${user.id}:${purpose}`, 3);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many code requests. Try again in 15 minutes." }, { status: 429 });
  const account = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { passwordHash: true, email: true } });
  if (!account || !(await bcrypt.compare(currentPassword, account.passwordHash))) return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  const target = purpose === "EMAIL_CHANGE" ? parsed.data.newEmail!.toLowerCase() : account.email.toLowerCase();
  if (purpose === "EMAIL_CHANGE") {
    if (target === account.email.toLowerCase()) return NextResponse.json({ error: "That is already your sign-in email." }, { status: 409 });
    if (await prisma.user.findFirst({ where: { schoolId: user.schoolId, email: target }, select: { id: true } })) return NextResponse.json({ error: "An account in this school already uses that email." }, { status: 409 });
  }
  if (!emailDeliveryConfigured()) return NextResponse.json({ error: "Email delivery is not configured. Contact the portal administrator." }, { status: 503 });

  const code = randomInt(100000, 1000000).toString();
  const codeHash = await bcrypt.hash(code, 10);
  await prisma.$transaction(async tx => {
    await tx.securityOtp.deleteMany({ where: { userId: user.id, purpose, usedAt: null } });
    await tx.securityOtp.create({ data: { userId: user.id, purpose, target, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) } });
  });
  const action = purpose === "EMAIL_CHANGE" ? "change your SAGA sign-in email" : "change your SAGA password";
  try {
    await sendPortalEmail({ to: target, subject: "Your SAGA verification code", text: `Your verification code to ${action} is ${code}.\n\nIt expires in 10 minutes and can be used once. If you did not request this code, you can ignore this email.` });
  } catch (error) {
    await prisma.securityOtp.deleteMany({ where: { userId: user.id, purpose, target, usedAt: null } });
    console.error("Account security OTP email failed", error);
    return NextResponse.json({ error: "We could not send the verification code. Check the mail settings or try again later." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, message: `A verification code was sent to ${maskEmail(target)}. It expires in 10 minutes.` });
}
