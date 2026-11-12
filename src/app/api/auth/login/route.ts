import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession, tenantManagerIdentity } from "@/lib/auth";
import { consumeEmailChallenge, emailVerificationFields, issueEmailChallenge } from "@/lib/email-verification";
import { checkAuthThrottle, clearAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ schoolId: z.string().min(1), email: z.string().trim().email().max(200), password: z.string().min(1).max(100), ...emailVerificationFields });
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `login:${input.data.schoolId}:${input.data.email.toLowerCase()}`, 8);
  if (!throttle.allowed) {
    console.warn("SECURITY_EVENT SAGA_LOGIN_THROTTLED");
    return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  }
  const user = await prisma.user.findUnique({ where: { schoolId_email: { schoolId: input.data.schoolId, email: input.data.email.toLowerCase() } } });
  if (!user || !(await bcrypt.compare(input.data.password, user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { isActive: true, subscriptionStatus: true, subscriptionExpiresAt: true } });
  if (!school?.isActive || school.subscriptionStatus !== "ACTIVE" || (school.subscriptionExpiresAt && school.subscriptionExpiresAt <= new Date())) return NextResponse.json({ error: "This school workspace is inactive or its subscription has expired. Contact SAGA support." }, { status: 403 });
  const { challengeId, code } = input.data;
  const manager = (await tenantManagerIdentity(user)) !== null;
  if (Boolean(challengeId) !== Boolean(code)) return NextResponse.json({ error: "Request a code and enter all six digits." }, { status: 400 });
  if (!user.emailVerifiedAt || manager || challengeId) {
    const binding = ["sign-in", user.id, user.schoolId, user.email.toLowerCase(), user.passwordHash];
    if (user.emailIdentityChangedAt) binding.push(user.emailIdentityChangedAt.toISOString());
    if (!challengeId || !code) {
      const allowance = await checkAuthThrottle(request, `sign-in-email:${user.id}`, 4, undefined, "identity");
      if (!allowance.allowed) return NextResponse.json({ error: "Too many code requests. Try again in 15 minutes." }, { status: 429 });
      try {
        const id = await issueEmailChallenge(binding, user.email);
        return NextResponse.json({ challengeId: id }, { status: 202, headers: { "Cache-Control": "no-store" } });
      } catch {
        return NextResponse.json({ error: "Email verification is temporarily unavailable." }, { status: 503 });
      }
    }
    const verified = await prisma.$transaction(async tx => {
      if (!(await consumeEmailChallenge(tx, binding, challengeId, code))) return false;
      const updated = await tx.user.updateMany({
        where: { id: user.id, email: user.email, passwordHash: user.passwordHash, emailIdentityChangedAt: user.emailIdentityChangedAt },
        data: { emailVerifiedAt: new Date() }
      });
      return updated.count === 1;
    });
    if (!verified) return NextResponse.json({ error: "The verification code is invalid, expired, or already used." }, { status: 400 });
  }
  await clearAuthThrottle(throttle.key);
  await createSession(user, manager);
  return NextResponse.json({ ok: true, role: user.role });
}
