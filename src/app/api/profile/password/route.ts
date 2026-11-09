import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ currentPassword: z.string().min(1).max(100), newPassword: z.string().min(12).max(100) });

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to change your password." }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter your current password and a new password with at least 12 characters." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `profile-password-change:${user.id}`, 5);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many password change attempts. Try again in 15 minutes." }, { status: 429 });

  const account = await prisma.user.findFirst({ where: { id: user.id, schoolId: user.schoolId }, select: { passwordHash: true } });
  if (!account || !(await bcrypt.compare(parsed.data.currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }
  if (await bcrypt.compare(parsed.data.newPassword, account.passwordHash)) {
    return NextResponse.json({ error: "Choose a new password that differs from your current one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date() } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await tx.auditEvent.create({ data: { actorId: user.id, action: "changed account password", entity: "user", entityId: user.id } });
  });
  return NextResponse.json({ ok: true, message: "Password changed. Please sign in again with your new password." });
}
