import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ enrollmentId: z.string(), assessmentId: z.string(), points: z.number().min(0).nullable(), remark: z.enum(["EXCUSED", "ABSENT", "DID_NOT_SUBMIT", "PRESENT"]).nullable().optional() });
export async function PUT(request: Request) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid score." }, { status: 400 });
  const [enrollment, assessment] = await Promise.all([
    prisma.enrollment.findFirst({ where: { id: parsed.data.enrollmentId, subject: { teacherId: teacher.id, schoolId: teacher.schoolId } }, include: { subject: { select: { gradeStatus: true } } } }),
    prisma.assessment.findFirst({ where: { id: parsed.data.assessmentId, subject: { teacherId: teacher.id, schoolId: teacher.schoolId } } })
  ]);
  if (!enrollment || !assessment || enrollment.subjectId !== assessment.subjectId) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  if (enrollment.subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record is final. Ask the registrar to reopen it before changing scores." }, { status: 409 });
  const isAttendance = assessment.title.toLocaleLowerCase().startsWith("attendance ·");
  if (isAttendance && parsed.data.points !== null) return NextResponse.json({ error: "Attendance is recorded as present, absent, or excused days, not points." }, { status: 400 });
  if (parsed.data.points !== null && parsed.data.points > assessment.maxScore) return NextResponse.json({ error: "Score cannot exceed the maximum points." }, { status: 400 });
  if (parsed.data.remark === "PRESENT" && !isAttendance) return NextResponse.json({ error: "Present status is only valid for attendance days." }, { status: 400 });
  const points = parsed.data.remark ? null : parsed.data.points;
  const remark = parsed.data.remark ?? null;
  await prisma.score.upsert({ where: { enrollmentId_assessmentId: { enrollmentId: enrollment.id, assessmentId: assessment.id } }, create: { enrollmentId: enrollment.id, assessmentId: assessment.id, points, remark }, update: { points, remark } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: remark ? `updated item status ${remark}` : "updated score", entity: "score", entityId: `${enrollment.id}:${assessment.id}` } });
  return NextResponse.json({ ok: true });
}
