import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ enrollmentId: z.string(), email: z.string().email() });
export async function PUT(request: Request) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Enter the student's account email." }, { status: 400 });
  const enrollment = await prisma.enrollment.findFirst({ where: { id: parsed.data.enrollmentId, subject: { teacherId: teacher.id } }, include: { subject: true } });
  const student = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!enrollment || !student || student.role !== "STUDENT") return NextResponse.json({ error: "Student account or roster record not found." }, { status: 404 });
  if (enrollment.studentNumber && student.studentNumber !== enrollment.studentNumber) return NextResponse.json({ error: "Student number does not match this roster record." }, { status: 409 });
  const conflict = await prisma.enrollment.findFirst({ where: { subjectId: enrollment.subjectId, studentUserId: student.id, NOT: { id: enrollment.id } } });
  if (conflict) return NextResponse.json({ error: "This student account is already linked in the subject." }, { status: 409 });
  await prisma.enrollment.update({ where: { id: enrollment.id }, data: { studentUserId: student.id } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "linked student account", entity: "enrollment", entityId: enrollment.id } });
  return NextResponse.json({ ok: true });
}
