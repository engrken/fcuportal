import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle, clearAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ schoolId: z.string().min(1), email: z.string().email(), password: z.string().min(1).max(100) });
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, `login:${input.data.schoolId}:${input.data.email.toLowerCase()}`, 8);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { schoolId_email: { schoolId: input.data.schoolId, email: input.data.email.toLowerCase() } } });
  if (!user || !(await bcrypt.compare(input.data.password, user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const school = await prisma.school.findUnique({ where: { id: user.schoolId }, select: { isActive: true, subscriptionStatus: true, subscriptionExpiresAt: true } });
  if (!school?.isActive || school.subscriptionStatus !== "ACTIVE" || (school.subscriptionExpiresAt && school.subscriptionExpiresAt <= new Date())) return NextResponse.json({ error: "This school workspace is inactive or its subscription has expired. Contact SAGA support." }, { status: 403 });
  await clearAuthThrottle(throttle.key);
  await createSession(user);
  return NextResponse.json({ ok: true, role: user.role });
}
