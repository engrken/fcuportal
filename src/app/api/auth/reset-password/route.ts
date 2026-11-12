import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32).max(200), password: z.string().min(12).max(100) });
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use a valid reset link and a password of at least 12 characters." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `password-reset-token:${parsed.data.token}`, 5);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many attempts. Request a new reset link." }, { status: 429 });
  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const reset = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true, user: { select: { emailIdentityChangedAt: true } } }
  });
  const invalid = () => NextResponse.json({ error: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  if (!reset) return invalid();

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    await prisma.$transaction(async tx => {
      const now = new Date();
      const updated = await tx.user.updateMany({
        where: { id: reset.userId, emailIdentityChangedAt: reset.user.emailIdentityChangedAt },
        data: { passwordHash, passwordChangedAt: now }
      });
      if (updated.count !== 1) throw new Error("RESET_EXPIRED");
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: reset.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now }
      });
      if (claimed.count !== 1) throw new Error("RESET_EXPIRED");
      await tx.passwordResetToken.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "RESET_EXPIRED") return invalid();
    throw error;
  }
  return NextResponse.json({ ok: true });
}
