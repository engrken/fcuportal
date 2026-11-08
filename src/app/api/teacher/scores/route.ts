import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ enrollmentId: z.string(), assessmentId: z.string(), points: z.number().min(0).nullable() });
export async function PUT(request: Request) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid score." }, { status: 400 });
  const [enrollment, assessment] = await Promise.all([
    prisma.enrollment.findFirst({ where: { id: parsed.data.enrollmentId, subject: { teacherId: teacher.id } }, include: { subject: { select: { gradeStatus: true } } } }),
    prisma.assessment.findFirst({ where: { id: parsed.data.assessmentId, subject: { teacherId: teacher.id } } })
  ]);
  if (!enrollment || !assessment || enrollment.subjectId !== assessment.subjectId) return NextResponse.json({ error: "Record not found." }, { status: 404 });
  if (enrollment.subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record is final. Ask the registrar to reopen it before changing scores." }, { status: 409 });
  if (parsed.data.points !== null && parsed.data.points > assessment.maxScore) return NextResponse.json({ error: "Score cannot exceed the maximum points." }, { status: 400 });
  await prisma.score.upsert({ where: { enrollmentId_assessmentId: { enrollmentId: enrollment.id, assessmentId: assessment.id } }, create: { enrollmentId: enrollment.id, assessmentId: assessment.id, points: parsed.data.points }, update: { points: parsed.data.points } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated score", entity: "score", entityId: `${enrollment.id}:${assessment.id}` } });
  return NextResponse.json({ ok: true });
}
