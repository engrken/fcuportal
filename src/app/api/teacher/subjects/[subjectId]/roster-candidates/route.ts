import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { enrollVerifiedStudent, classEnrollmentError } from "@/lib/class-enrollment";

type Context = { params: Promise<{ subjectId: string }> };
const studentSchema = z.object({ studentUserId: z.string().min(1).max(128) });

export async function GET(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId: teacher.schoolId, teacherId: teacher.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const query = (new URL(request.url)).searchParams.get("q")?.trim() || "";
  if (query.length < 2 || query.length > 80) return NextResponse.json({ students: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const throttle = await checkAuthThrottle(request, "verified-roster-search:" + teacher.id, 40, 60_000, "identity");
  if (!throttle.allowed) return NextResponse.json({ error: "Too many searches. Please try again shortly." }, { status: 429 });
  const students = await prisma.user.findMany({
    where: {
      schoolId: teacher.schoolId, role: "STUDENT", emailVerifiedAt: { not: null }, studentNumber: { not: null },
      OR: [
        { fullName: { contains: query, mode: "insensitive" } },
        { studentNumber: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } }
      ],
      enrollments: { none: { subjectId } }
    },
    orderBy: { fullName: "asc" }, take: 20,
    select: { id: true, fullName: true, studentNumber: true }
  });
  return NextResponse.json({ students }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findFirst({ where: { id: subjectId, schoolId: teacher.schoolId, teacherId: teacher.id }, select: { id: true } });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  const parsed = studentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Select a verified student." }, { status: 400 });
  const student = await prisma.user.findFirst({
    where: { id: parsed.data.studentUserId, schoolId: teacher.schoolId, role: "STUDENT", emailVerifiedAt: { not: null } },
    select: { id: true, schoolId: true, role: true, emailVerifiedAt: true, studentNumber: true, fullName: true }
  });
  if (!student) return NextResponse.json({ error: "Verified student not found in this school." }, { status: 404 });
  try {
    const result = await enrollVerifiedStudent(subjectId, teacher.schoolId, student, teacher.id);
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    const failure = classEnrollmentError(error);
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
