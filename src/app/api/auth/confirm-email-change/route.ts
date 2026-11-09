import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { emailDeliveryConfigured, sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ token: z.string().min(32).max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `confirm-email-change:${parsed.data.token}`, 5);
  const networkThrottle = await checkAuthThrottle(request, "confirm-email-change-network", 50);
  if (!throttle.allowed || !networkThrottle.allowed) return NextResponse.json({ error: "Too many attempts. Request a new email change link." }, { status: 429 });

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const pending = await prisma.emailChangeToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, userId: true, pendingEmail: true, user: { select: { email: true } } }
  });
  if (!pending) return NextResponse.json({ error: "This verification link is invalid or expired. Request a new one from your profile." }, { status: 400 });

  try {
    await prisma.$transaction(async tx => {
      const current = await tx.emailChangeToken.findFirst({ where: { id: pending.id, usedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, userId: true, pendingEmail: true } });
      if (!current) throw new Error("EMAIL_CHANGE_EXPIRED");
      await tx.user.update({ where: { id: current.userId }, data: { email: current.pendingEmail } });
      await tx.emailChangeToken.update({ where: { id: current.id }, data: { usedAt: new Date() } });
      await tx.emailChangeToken.deleteMany({ where: { userId: current.userId, id: { not: current.id } } });
      await tx.auditEvent.create({ data: { actorId: current.userId, action: "changed account sign-in email", entity: "user", entityId: current.userId } });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "EMAIL_CHANGE_EXPIRED") return NextResponse.json({ error: "This verification link is invalid or expired. Request a new one from your profile." }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account in this school already uses that email. Request a new link with a different address." }, { status: 409 });
    throw error;
  }

  if (emailDeliveryConfigured()) {
    await sendPortalEmail({ to: pending.user.email, subject: "Your SAGA sign-in email was changed", text: `The sign-in email for your SAGA account was changed to ${pending.pendingEmail}. If you did not make this change, use password recovery immediately and contact the portal administrator.` }).catch(error => console.error("Email change notification failed", error));
  }

  return NextResponse.json({ ok: true, message: "Your sign-in email has been changed." });
}
