import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";
import type { School } from "@/generated/prisma/client";

const bodySchema = z.object({
  schoolId: z.string().min(1).optional(), schoolName: z.string().trim().min(2).max(160).optional(),
  fullName: z.string().trim().min(2).max(120).optional(), email: z.string().trim().email().max(200),
  password: z.string().min(12).max(100), role: z.enum(["TEACHER", "STUDENT"]),
  studentNumber: z.string().trim().max(40).optional(), inviteCode: z.string().optional(), acknowledgedPrivacyNotice: z.literal(true)
});

function schoolIdentity(name: string) {
  const slugBase = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "school";
  const shortName = name.split(/\s+/).filter(Boolean).map(word => word[0]).join("").toUpperCase().slice(0, 8) || "SCHOOL";
  return { slug: `${slugBase}-${Math.random().toString(36).slice(2, 7)}`, shortName, logoText: shortName.slice(0, 1) };
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the required fields. Passwords must be at least 12 characters." }, { status: 400 });
    const { schoolId, schoolName, fullName, email, password, role, studentNumber, inviteCode } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    const throttle = await checkAuthThrottle(request, `register:${role}:${normalizedEmail}`, 4);
    if (!throttle.allowed) return NextResponse.json({ error: "Too many account creation attempts. Try again in 15 minutes." }, { status: 429 });

    if (role === "TEACHER" && (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE)) {
      return NextResponse.json({ error: "Teacher registration requires an invitation code from the portal owner." }, { status: 403 });
    }
    if (role === "TEACHER" && !fullName) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    if (role === "TEACHER" && !schoolName?.trim()) return NextResponse.json({ error: "Enter your school name." }, { status: 400 });
    if (role === "STUDENT" && (!schoolId || !studentNumber)) return NextResponse.json({ error: "Choose your school and enter your student ID." }, { status: 400 });

    const normalizedStudentNumber = studentNumber?.trim().toUpperCase();
    const studentProfile = role === "STUDENT" ? await prisma.studentDirectory.findUnique({ where: { schoolId_studentNumber: { schoolId: schoolId!, studentNumber: normalizedStudentNumber! } } }) : null;
    if (role === "STUDENT") {
      const school = await prisma.school.findFirst({ where: { id: schoolId!, isActive: true, users: { some: { role: "TEACHER" } } }, select: { id: true } });
      if (!school) return NextResponse.json({ error: "That school is not accepting student registration yet." }, { status: 400 });
      if (!studentProfile || studentProfile.schoolId !== schoolId || studentProfile.email.toLowerCase() !== normalizedEmail) {
        return NextResponse.json({ error: "Use the student number and email address listed in your class registration information, or contact your teacher." }, { status: 403 });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async tx => {
      let school: School | null = null;
      if (role === "TEACHER") {
        const normalizedSchoolName = schoolName!.trim().replace(/\s+/g, " ");
        school = await tx.school.findFirst({ where: { name: { equals: normalizedSchoolName, mode: "insensitive" }, isActive: true } });
        if (!school) {
          const unavailableSchool = await tx.school.findFirst({ where: { name: { equals: normalizedSchoolName, mode: "insensitive" }, isActive: false }, select: { id: true } });
          if (unavailableSchool) throw new Error("SCHOOL_INACTIVE");
          const identity = schoolIdentity(normalizedSchoolName);
          school = await tx.school.create({ data: { name: normalizedSchoolName, ...identity, portalTitle: "SAGA Portal" } });
        }
        if (!school) throw new Error("SCHOOL_NOT_READY");
        const teacherCount = await tx.user.count({ where: { schoolId: school.id, role: "TEACHER" } });
        const limits = SCHOOL_PLAN_LIMITS[school.plan];
        if (teacherCount >= limits.teachers) throw new Error(`PLAN_LIMIT_TEACHERS:${limits.teachers}`);
      } else {
        school = await tx.school.findFirst({ where: { id: schoolId!, isActive: true, users: { some: { role: "TEACHER" } } } });
        if (!school) throw new Error("SCHOOL_NOT_READY");
      }
      if (!school) throw new Error("SCHOOL_NOT_READY");
      const created = await tx.user.create({ data: { schoolId: school.id, fullName: studentProfile?.fullName ?? fullName!, email: normalizedEmail, passwordHash, role, studentNumber: role === "STUDENT" ? studentProfile?.studentNumber : null, courseProgram: studentProfile?.courseProgram ?? null, yearLevel: studentProfile?.yearLevel ?? null, privacyNoticeAcceptedAt: new Date() }, select: { id: true, role: true, schoolId: true } });
      if (studentProfile) await tx.enrollment.updateMany({ where: { studentNumber: studentProfile.studentNumber, studentUserId: null, subject: { schoolId: school.id } }, data: { studentUserId: created.id } });
      return created;
    });
    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PLAN_LIMIT_TEACHERS:")) return NextResponse.json({ error: `This school has reached its teacher limit (${error.message.split(":")[1]}). Contact SAGA to upgrade the school plan.` }, { status: 402 });
    if (error instanceof Error && error.message === "SCHOOL_INACTIVE") return NextResponse.json({ error: "This school workspace is currently inactive. Contact SAGA support to restore access." }, { status: 403 });
    if (error instanceof Error && error.message === "SCHOOL_NOT_READY") return NextResponse.json({ error: "That school is not accepting student registration yet." }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account already uses that email or student number." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
