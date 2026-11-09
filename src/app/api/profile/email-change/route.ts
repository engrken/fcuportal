import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({
  currentPassword: z.string().min(1).max(100),
  newEmail: z.string().trim().email().max(200)
});

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to change your email." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid new email and your current password." }, { status: 400 });

  const throttle = await checkAuthThrottle(request, `profile-email-change:${user.id}`, 3);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many email change requests. Try again in 15 minutes." }, { status: 429 });

  const passwordRecord = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { passwordHash: true } });
  if (!passwordRecord || !(await bcrypt.compare(parsed.data.currentPassword, passwordRecord.passwordHash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }

  const newEmail = parsed.data.newEmail.toLowerCase();
  if (newEmail === user.email.toLowerCase()) return NextResponse.json({ error: "That is already your sign-in email." }, { status: 409 });
  if (await prisma.user.findFirst({ where: { schoolId: user.schoolId, email: newEmail }, select: { id: true } })) {
    return NextResponse.json({ error: "An account in this school already uses that email." }, { status: 409 });
  }

  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!smtpUser || !smtpPassword) return NextResponse.json({ error: "Email verification is not configured. Contact the portal administrator." }, { status: 503 });

  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.emailChangeToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await prisma.emailChangeToken.create({ data: { userId: user.id, pendingEmail: newEmail, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });

  const origin = (process.env.APP_URL || new URL(request.url).origin).replace(/\/$/, "");
  const link = `${origin}/confirm-email-change?token=${encodeURIComponent(token)}`;
  const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPassword } });
  try {
    await mailer.sendMail({
      from: smtpUser,
      to: newEmail,
      subject: "Confirm your SAGA sign-in email",
      text: `A request was made to change your SAGA sign-in email to this address.\n\nConfirm the change within 30 minutes:\n${link}\n\nYour current email stays active until you confirm. If you did not request this, ignore this message.`
    });
  } catch (error) {
    await prisma.emailChangeToken.deleteMany({ where: { tokenHash } });
    console.error("Email change verification failed", error);
    return NextResponse.json({ error: "We could not send the verification email. Please try again later." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, message: `A verification link was sent to ${newEmail}. Your sign-in email will change after you confirm it.` });
}
