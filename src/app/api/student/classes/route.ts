import { normalizeClassJoinCode, hashClassJoinCode } from "@/lib/class-invite-code";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { enrollVerifiedStudent, classEnrollmentError } from "@/lib/class-enrollment";

const joinSchema = z.object({ code: z.string().trim().min(12).max(32) });

export async function GET() {
  const student = await requireRole("STUDENT");
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const records = await prisma.enrollment.findMany({
    where: { subject: { schoolId: student.schoolId }, OR: [
      { studentUserId: student.id },
      ...(student.studentNumber ? [{ studentUserId: null, studentNumber: { equals: student.studentNumber.trim(), mode: "insensitive" as const } }] : [])
    ] },
    orderBy: { subject: { academicYear: "desc" } }, take: 100,
    select: {
      id: true, subject: { select: { code: true, title: true, term: true, academicYear: true, isPublished: true } }
    }
  });
  return NextResponse.json({ classes: records.map(row => ({ id: row.id, ...row.subject })) },
    { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const student = await requireRole("STUDENT");
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const throttle = await checkAuthThrottle(request, "class-join:" + student.id, 10, 60 * 60_000, "identity");
  if (!throttle.allowed) return NextResponse.json({ error: "Too many code attempts. Try again later." }, { status: 429 });
  const parsed = joinSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid 12-character invitation code." }, { status: 400 });
  const code = normalizeClassJoinCode(parsed.data.code);
  if (!code) return NextResponse.json({ error: "Enter a valid 12-character invitation code." }, { status: 400 });
  const hash = hashClassJoinCode(code);
  const subject = await prisma.subject.findFirst({
    where: { schoolId: student.schoolId, joinCodeHash: hash, joinCodeExpiresAt: { gt: new Date() }, gradeStatus: "DRAFT" },
    select: { id: true, code: true, title: true }
  });
  if (!subject) return NextResponse.json({ error: "Invalid or expired invitation code for your school." }, { status: 404 });
  const verified = await prisma.user.findFirst({
    where: { id: student.id, role: "STUDENT", schoolId: student.schoolId, emailVerifiedAt: { not: null } },
    select: { id: true, schoolId: true, role: true, fullName: true, studentNumber: true, emailVerifiedAt: true }
  });
  if (!verified) return NextResponse.json({ error: "Verify your account before joining a class." }, { status: 403 });
  try {
    const result = await enrollVerifiedStudent(subject.id, student.schoolId, verified, student.id);
    return NextResponse.json({ ...result, class: { code: subject.code, title: subject.title } },
      { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = classEnrollmentError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
