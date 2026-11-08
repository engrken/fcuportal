import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200),
  password: z.string().min(12).max(100), role: z.enum(["TEACHER", "STUDENT"]),
  studentNumber: z.string().trim().max(40).optional(), inviteCode: z.string().optional(), acknowledgedPrivacyNotice: z.literal(true)
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the required fields. Passwords must be at least 12 characters." }, { status: 400 });
    const { fullName, email, password, role, studentNumber, inviteCode } = parsed.data;
    const throttle = await checkAuthThrottle(request, `register:${email}`, 4);
    if (!throttle.allowed) return NextResponse.json({ error: "Too many account creation attempts. Try again in 15 minutes." }, { status: 429 });
    if (role === "TEACHER" && (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE)) {
      return NextResponse.json({ error: "Teacher registration requires an invitation code from the portal administrator." }, { status: 403 });
    }
    if (role === "STUDENT" && !studentNumber) return NextResponse.json({ error: "Student number is required." }, { status: 400 });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({ data: { fullName, email: email.toLowerCase(), passwordHash, role, studentNumber: role === "STUDENT" ? studentNumber : null, privacyNoticeAcceptedAt: new Date() }, select: { id: true, role: true } });
    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account already uses that email or student number." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
