import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(100) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Use a valid reset link and a password of at least 12 characters." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `password-reset-token:${parsed.data.token}`, 5);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many attempts. Request a new reset link." }, { status: 429 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const reset = await prisma.passwordResetToken.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userId: true } });
  if (!reset) return NextResponse.json({ error: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.$transaction([
    prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
    prisma.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } })
  ]);
  return NextResponse.json({ ok: true });
}
