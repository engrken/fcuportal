import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ schoolId: z.string().min(1), email: z.string().trim().email().max(200) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  const schoolId = parsed.data.schoolId;
  const throttle = await checkAuthThrottle(request, `password-reset:${schoolId}:${email}`, 3);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many reset requests. Please try again in 15 minutes." }, { status: 429 });

  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!smtpUser || !smtpPassword) return NextResponse.json({ error: "Account recovery email is not configured yet. Please contact the portal administrator." }, { status: 503 });

  const user = await prisma.user.findFirst({ where: { schoolId, email }, select: { id: true, email: true } });
  if (user) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
    await prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 30 * 60 * 1000) } });
    const origin = process.env.APP_URL || new URL(request.url).origin;
    const link = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
    const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPassword } });
    try {
      await mailer.sendMail({ from: smtpUser, to: user.email, subject: "Reset your Student Grade Portal password", text: `A password reset was requested for your Student Grade Portal account.\n\nUse this link within 30 minutes to choose a new password:\n${link}\n\nIf you did not request this, you can ignore this email.` });
    } catch (error) {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
      console.error("Password recovery email failed", error);
      return NextResponse.json({ error: "We could not send the recovery email. Please try again later or contact the portal administrator." }, { status: 503 });
    }
  }
  return NextResponse.json({ ok: true, message: "If an account exists for that email, a password reset link has been sent." });
}
