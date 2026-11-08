import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SAMPLE_GRADE_BANDS } from "@/lib/grades";
import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";

const schema = z.object({ code: z.string().trim().min(1).max(30), title: z.string().trim().min(2).max(160), term: z.string().trim().min(1).max(40), academicYear: z.string().trim().min(4).max(20), schedule: z.string().trim().max(4000).optional(), courseYear: z.string().trim().max(80).optional() });
export async function GET() {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subjects = await prisma.subject.findMany({ where: { teacherId: teacher.id, schoolId: teacher.schoolId }, orderBy: [{ academicYear: "desc" }, { code: "asc" }], include: { _count: { select: { enrollments: true } } } });
  return NextResponse.json({ subjects });
}
export async function POST(request: Request) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Complete the subject details." }, { status: 400 });
  const school = await prisma.school.findUnique({ where: { id: teacher.schoolId }, select: { plan: true } });
  const classCount = await prisma.subject.count({ where: { schoolId: teacher.schoolId } });
  const classLimit = SCHOOL_PLAN_LIMITS[school?.plan || "FREE"].classes;
  if (classCount >= classLimit) return NextResponse.json({ error: `Your school plan allows ${classLimit} classes. Upgrade the school plan to add another class.` }, { status: 402 });
  const subject = await prisma.subject.create({ data: { ...parsed.data, schoolId: teacher.schoolId, teacherId: teacher.id, gradeBands: { create: SAMPLE_GRADE_BANDS.map((band, sortOrder) => ({ ...band, sortOrder })) } } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created", entity: "subject", entityId: subject.id } });
  return NextResponse.json({ subject }, { status: 201 });
}
