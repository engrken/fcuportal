import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";
import type { School } from "@/generated/prisma/client";
import { consumeEmailChallenge, emailVerificationFields, issueEmailChallenge } from "@/lib/email-verification";

const bodySchema = z.object({
  schoolId: z.string().min(1).optional(), schoolName: z.string().trim().min(2).max(160).optional(),
  fullName: z.string().trim().min(2).max(120).optional(), email: z.string().trim().email().max(200),
  password: z.string().min(12).max(100), role: z.enum(["TEACHER", "STUDENT"]),
  studentNumber: z.string().trim().max(40).optional(), inviteCode: z.string().optional(), acknowledgedPrivacyNotice: z.literal(true),
  acknowledgedTerms: z.literal(true), termsVersion: z.literal("2026-11-12"),
  ...emailVerificationFields
});

function schoolIdentity(name: string) {
  const words = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).filter(Boolean);
  const acronymWords = words.filter(word => !["of", "the", "and", "for", "in", "at"].includes(word.toLowerCase()));
  const shortName = (acronymWords.length ? acronymWords : words).map(word => word[0]).join("").toUpperCase().slice(0, 8) || "SCHOOL";
  const slugBase = shortName.toLowerCase();
  return { slug: slugBase, shortName, logoText: shortName.slice(0, 1) };
}

export async function POST(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      if (parsed.error.issues.some(issue => issue.path[0] === "acknowledgedTerms" || issue.path[0] === "termsVersion")) {
        return NextResponse.json({ error: "Accept the current Terms of Service before creating your account." }, { status: 400 });
      }
      if (parsed.error.issues.some(issue => issue.path[0] === "acknowledgedPrivacyNotice")) {
        return NextResponse.json({ error: "Read and acknowledge the Privacy Notice before creating your account." }, { status: 400 });
      }
      return NextResponse.json({ error: "Check the required fields. Passwords must be at least 12 characters." }, { status: 400 });
    }
    const { schoolId, schoolName, fullName, email, password, role, studentNumber, inviteCode, termsVersion, challengeId, code } = parsed.data;
    const normalizedEmail = email.toLowerCase();
    if (Boolean(challengeId) !== Boolean(code)) return NextResponse.json({ error: "Request a code and enter all six digits." }, { status: 400 });
    const phase = challengeId ? "verify" : "send";
    const throttle = await checkAuthThrottle(request, `register:${phase}:${role}:${normalizedEmail}`, challengeId ? 8 : 4, undefined, "identity");
    const network = await checkAuthThrottle(request, `register:${phase}:network`, 30);
    if (!network.allowed) return NextResponse.json({ error: "Too many account creation attempts. Try again in 15 minutes." }, { status: 429 });
    if (!throttle.allowed) return NextResponse.json({ error: "Too many account creation attempts. Try again in 15 minutes." }, { status: 429 });

    if (role === "TEACHER" && (!process.env.TEACHER_INVITE_CODE || inviteCode !== process.env.TEACHER_INVITE_CODE)) {
      return NextResponse.json({ error: "Teacher registration requires an invitation code from the portal owner." }, { status: 403 });
    }
    if (role === "TEACHER" && !fullName) return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    if (role === "TEACHER") {
      const existingSchoolSelected = Boolean(schoolId);
      const newSchoolNamed = Boolean(schoolName?.trim());
      if (existingSchoolSelected === newSchoolNamed) {
        return NextResponse.json({ error: "Select an existing school or choose Not listed and enter the new school name." }, { status: 400 });
      }
      if (existingSchoolSelected) {
        const selectedSchool = await prisma.school.findUnique({ where: { id: schoolId! }, select: { isActive: true } });
        if (!selectedSchool) return NextResponse.json({ error: "School not found. Refresh the list and select a school." }, { status: 404 });
        if (!selectedSchool.isActive) return NextResponse.json({ error: "This school workspace is inactive. Contact SAGA support." }, { status: 403 });
      } else {
        const normalizedSchoolName = schoolName!.trim().replace(/\s+/g, " ");
        const alreadyListed = await prisma.school.findFirst({
          where: { name: { equals: normalizedSchoolName, mode: "insensitive" } },
          select: { isActive: true }
        });
        if (alreadyListed) return NextResponse.json({
          error: alreadyListed.isActive
            ? "This school already exists. Please select it from the school dropdown instead of creating another workspace."
            : "This school workspace is inactive. Contact SAGA support to restore access."
        }, { status: alreadyListed.isActive ? 409 : 403 });
      }
    }
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

    const binding = ["register", role, schoolId || "", schoolName?.trim().replace(/\s+/g, " ").toLowerCase() || "", normalizedStudentNumber || "", normalizedEmail];
    if (!challengeId || !code) {
      const id = await issueEmailChallenge(binding, normalizedEmail);
      return NextResponse.json({ challengeId: id }, { status: 202, headers: { "Cache-Control": "no-store" } });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.$transaction(async tx => {
      if (!(await consumeEmailChallenge(tx, binding, challengeId, code))) return null;
      let school: School | null = null;
      if (role === "TEACHER") {
        if (schoolId) {
          // Existing-school registration must use the selected school ID.
          // Never create another school when an existing one was selected.
          school = await tx.school.findUnique({ where: { id: schoolId } });
          if (!school) throw new Error("SCHOOL_NOT_FOUND");
          if (!school.isActive) throw new Error("SCHOOL_INACTIVE");
        } else {
          const normalizedSchoolName = schoolName!.trim().replace(/\s+/g, " ");
          // Serialize simultaneous attempts to register the same school.
          // This avoids duplicates even if two teachers verify their OTPs together.
          await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${normalizedSchoolName.toLowerCase()}))::text`;
          const existingSchool = await tx.school.findFirst({
            where: { name: { equals: normalizedSchoolName, mode: "insensitive" } }
          });
          if (existingSchool) throw new Error(existingSchool.isActive ? "SCHOOL_ALREADY_EXISTS" : "SCHOOL_INACTIVE");
          const identity = schoolIdentity(normalizedSchoolName);
          if (await tx.school.findUnique({ where: { slug: identity.slug }, select: { id: true } })) {
            identity.slug = `${identity.slug}-${Math.random().toString(36).slice(2, 7)}`;
          }
          school = await tx.school.create({
            data: { name: normalizedSchoolName, ...identity, portalTitle: "SAGA Portal" }
          });
        }
        if (!school) throw new Error("SCHOOL_NOT_READY");
        const teacherCount = await tx.user.count({ where: { schoolId: school.id, role: "TEACHER" } });
        const limits = SCHOOL_PLAN_LIMITS[school.plan];
        if (teacherCount >= limits.teachers) throw new Error(`PLAN_LIMIT_TEACHERS:${limits.teachers}`);
      } else {
        const [currentProfile] = await tx.$queryRaw<{ email: string }[]>`
          SELECT "email" FROM "StudentDirectory"
          WHERE "schoolId" = ${schoolId!} AND "studentNumber" = ${normalizedStudentNumber!} FOR UPDATE
        `;
        if (currentProfile?.email.toLowerCase() !== normalizedEmail) throw new Error("STUDENT_EMAIL_CHANGED");
        school = await tx.school.findFirst({ where: { id: schoolId!, isActive: true, users: { some: { role: "TEACHER" } } } });
        if (!school) throw new Error("SCHOOL_NOT_READY");
      }
      if (!school) throw new Error("SCHOOL_NOT_READY");
      const created = await tx.user.create({ data: { schoolId: school.id, fullName: studentProfile?.fullName ?? fullName!, email: normalizedEmail, emailVerifiedAt: new Date(), passwordHash, role, studentNumber: role === "STUDENT" ? studentProfile?.studentNumber : null, courseProgram: studentProfile?.courseProgram ?? null, yearLevel: studentProfile?.yearLevel ?? null, privacyNoticeAcceptedAt: new Date(), termsAcceptedAt: new Date(), termsOfServiceVersion: termsVersion }, select: { id: true, role: true, schoolId: true } });
      if (studentProfile) await tx.enrollment.updateMany({ where: { studentNumber: studentProfile.studentNumber, studentUserId: null, subject: { schoolId: school.id } }, data: { studentUserId: created.id } });
      return created;
    });
    if (!user) return NextResponse.json({ error: "The verification code is invalid, expired, or already used." }, { status: 400 });
    await createSession(user);
    return NextResponse.json({ ok: true, role: user.role }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("PLAN_LIMIT_TEACHERS:")) return NextResponse.json({ error: `This school has reached its teacher limit (${error.message.split(":")[1]}). Contact SAGA to upgrade the school plan.` }, { status: 402 });
    if (error instanceof Error && error.message === "SCHOOL_INACTIVE") return NextResponse.json({ error: "This school workspace is currently inactive. Contact SAGA support to restore access." }, { status: 403 });
    if (error instanceof Error && error.message === "SCHOOL_NOT_FOUND") return NextResponse.json({ error: "School not found. Refresh the school list and try again." }, { status: 404 });
    if (error instanceof Error && error.message === "SCHOOL_ALREADY_EXISTS") return NextResponse.json({ error: "This school already exists. Select it from the dropdown instead of creating a duplicate." }, { status: 409 });
    if (error instanceof Error && error.message === "STUDENT_EMAIL_CHANGED") return NextResponse.json({ error: "Your school roster email changed. Check it with your school and start registration again." }, { status: 409 });
    if (error instanceof Error && error.message === "SCHOOL_NOT_READY") return NextResponse.json({ error: "That school is not accepting student registration yet." }, { status: 400 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "An account already uses that email or student number." }, { status: 409 });
    return NextResponse.json({ error: "Could not create the account." }, { status: 500 });
  }
}
