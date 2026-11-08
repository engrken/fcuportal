import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle, clearAuthThrottle } from "@/lib/rate-limit";

const schema = z.object({ email: z.string().email(), password: z.string().min(1).max(100) });
export async function POST(request: Request) {
  const input = schema.safeParse(await request.json());
  if (!input.success) return NextResponse.json({ error: "Enter a valid email and password." }, { status: 400 });
  const throttle = await checkAuthThrottle(request, input.data.email, 8);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many sign-in attempts. Try again in 15 minutes." }, { status: 429 });
  const user = await prisma.user.findUnique({ where: { email: input.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(input.data.password, user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  await clearAuthThrottle(throttle.key);
  await createSession(user);
  return NextResponse.json({ ok: true, role: user.role });
}
