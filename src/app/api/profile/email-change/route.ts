import { after, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { clearSession, getSession, tenantManagerIdentity } from "@/lib/auth";
import { consumeEmailChallenge, issueEmailChangeChallenge } from "@/lib/email-verification";
import { emailDeliveryConfigured, sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const details = z.object({
  currentPassword: z.string().min(1).max(100),
  newEmail: z.string().trim().email().max(200)
});
const schema = z.discriminatedUnion("action", [
  details.extend({ action: z.literal("send") }),
  details.extend({
    action: z.literal("confirm"),
    challengeId: z.string().regex(/^[a-f0-9]{48}$/),
    currentCode: z.string().regex(/^\d{6}$/),
    newCode: z.string().regex(/^\d{6}$/)
  })
]);

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Sign in again to change your email." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter your current password, a valid new email, and both six-digit codes when confirming." }, { status: 400 });

  const input = parsed.data;
  const throttle = await checkAuthThrottle(request, `profile-email-change:${input.action}:${user.id}`, input.action === "send" ? 3 : 8, undefined, "identity");
  if (!throttle.allowed) return NextResponse.json({ error: "Too many email change attempts. Try again in 15 minutes." }, { status: 429 });

  const account = await prisma.user.findUnique({
    where: { id: user.id, schoolId: user.schoolId, email: user.email, emailVerifiedAt: { not: null } },
    select: { email: true, emailIdentityChangedAt: true, passwordHash: true, role: true, tenantManagerEmail: true }
  });
  if (!account || !(await bcrypt.compare(input.currentPassword, account.passwordHash))) {
    return NextResponse.json({ error: "Your current password is incorrect or your session changed." }, { status: 401 });
  }

  const newEmail = input.newEmail.toLowerCase();
  if (newEmail === account.email.toLowerCase()) return NextResponse.json({ error: "That is already your sign-in email." }, { status: 409 });
  const duplicate = await prisma.user.findFirst({
    where: { schoolId: user.schoolId, email: { equals: newEmail, mode: "insensitive" } },
    select: { id: true }
  });
  if (duplicate) return NextResponse.json({ error: "An account in this school already uses that email." }, { status: 409 });

  const managerIdentity = await tenantManagerIdentity(account);
  if (managerIdentity && !user.isTenantManager) {
    return NextResponse.json({ error: "Sign in again and complete your tenant-manager verification before changing your email." }, { status: 403 });
  }

  const binding = [
    "profile-email-change", user.id, user.schoolId, account.email, account.passwordHash,
    account.emailIdentityChangedAt?.toISOString() ?? "", managerIdentity ?? "", newEmail
  ];

  if (input.action === "send") {
    if (!emailDeliveryConfigured()) return NextResponse.json({ error: "Email delivery is temporarily unavailable." }, { status: 503 });
    try {
      const challengeId = await issueEmailChangeChallenge(binding, account.email, newEmail);
      return NextResponse.json({ challengeId }, { status: 202, headers: { "Cache-Control": "no-store" } });
    } catch {
      return NextResponse.json({ error: "We could not send both codes. Check the addresses and try again." }, { status: 503 });
    }
  }

  try {
    const changed = await prisma.$transaction(async tx => {
      if (!(await consumeEmailChallenge(tx, binding, input.challengeId, input.currentCode + input.newCode))) return false;
      const now = new Date();
      const updated = await tx.user.updateMany({
        where: {
          id: user.id,
          schoolId: user.schoolId,
          email: account.email,
          emailIdentityChangedAt: account.emailIdentityChangedAt,
          passwordHash: account.passwordHash,
          tenantManagerEmail: account.tenantManagerEmail
        },
        data: {
          email: newEmail,
          emailVerifiedAt: now,
          emailIdentityChangedAt: now,
          ...(managerIdentity ? { tenantManagerEmail: managerIdentity } : {})
        }
      });
      if (updated.count !== 1) return false;
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.emailChangeToken.deleteMany({ where: { userId: user.id } });
      await tx.auditEvent.create({ data: { actorId: user.id, action: "changed account sign-in email", entity: "user", entityId: user.id } });
      return true;
    });
    if (!changed) return NextResponse.json({ error: "The codes are invalid, expired, or already used. Request new codes if needed." }, { status: 400 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "The email is unavailable or the account changed. Refresh your profile and try again." }, { status: 409 });
    }
    throw error;
  }

  await clearSession();
  after(async () => {
    try {
      await sendPortalEmail({
        to: account.email,
        subject: "Your SAGA sign-in email was changed",
        text: `Your SAGA sign-in email was changed to ${newEmail}. If you did not make this change, contact your portal administrator immediately.`
      });
    } catch {
      console.error("SECURITY_EVENT SAGA_EMAIL_CHANGE_NOTICE_FAILED");
    }
  });
  return NextResponse.json({ ok: true });
}
