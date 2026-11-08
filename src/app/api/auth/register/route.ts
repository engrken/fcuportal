import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";

const bodySchema = z.object({
  schoolId: z.string().min(1), fullName: z.string().trim().min(2).max(120).optional(), email: z.string().trim().email().max(200),
  password: z.string().min(12).max(100), role: z.enum(["TEACHER", "STUDENT", "REGISTRAR"]),
  studentNumber: z.string().trim().max(40).optional(), inviteCode: z.string().optional(), acknowledgedPrivacyNotice: z.literal(true)
});

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the required fields. Passwords must be at least 12 characters." }, { status: 400 });
    const { schoolId, fullName, email, password, role, studentNumber, inviteCode } = parsed.data;
    if (role !== "STUDENT" && !fullName) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    const throttle = await checkAuthThrottle(request, `register:${schoolId}:${email}`, 4);
    if (!throttle.allowed) return NextResponse.json({ error: "Too many account creation attempts. Try again in 15 minutes." }, { status: 429 });
    if (role === "TEACHER" && (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE)) {
      return NextResponse.json({ error: "Teacher registration requires an invitation code from the portal owner." }, { status: 403 });
    }
    if (role === "REGISTRAR" && (!process.env.REGISTRAR_INVITE_CODE || inviteCode !== process.env.REGISTRAR_INVITE_CODE)) {
      return NextResponse.json({ error: "Registrar accounts require a separate invitation code from the portal owner." }, { status: 403 });
    }
    if (role === "STUDENT" && !studentNumber) return NextResponse.json({ error: "Student number is required." }, { status: 400 });
    const school = await prisma.school.findFirst({ where: { id: schoolId, isActive: true }, select: { id: true } });
    if (!school) return NextResponse.json({ error: "Choose an active school." }, { status: 400 });
    const normalizedEmail = email.toLowerCase();
    const normalizedStudentNumber = studentNumber?.toUpperCase();
    const studentProfile = role === "STUDENT" ? await prisma.studentDirectory.findUnique({ where: { schoolId_studentNumber: { schoolId, studentNumber: normalizedStudentNumber! } } }) : null;
    if (role === "STUDENT" && (!studentProfile || studentProfile.schoolId !== schoolId || studentProfile.email.toLowerCase() !== normalizedEmail)) {
      return NextResponse.json({ error: "Use the student number and email address listed in your class registration information, or contact your teacher." }, { status: 403 });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({ data: { schoolId, fullName: studentProfile?.fullName ?? fullName!, email: normalizedEmail, passwordHash, role, studentNumber: role === "STUDENT" ? studentProfile?.studentNumber : null, courseProgram: studentProfile?.courseProgram ?? null, yearLevel: studentProfile?.yearLevel ?? null, privacyNoticeAcceptedAt: new Date() }, select: { id: true, role: true, schoolId: true } });
      if (studentProfile) await tx.enrollment.updateMany({ where: { studentNumber: studentProfile.studentNumber, studentUserId: null, subject: { schoolId } }, data: { studentUserId: created.id } });
      return created;
    });
    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account already uses that email or student number." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
