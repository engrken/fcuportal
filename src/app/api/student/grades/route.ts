import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";
export async function GET() {
  const student = await requireRole("STUDENT"); if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const enrollments = await prisma.enrollment.findMany({ where: { studentUserId: student.id, subject: { isPublished: true } }, include: { subject: { include: { teacher: { select: { fullName: true } }, gradeBands: true, categories: { include: { assessments: { include: { scores: { where: { enrollment: { studentUserId: student.id } }, select: { points: true } } } } } } } }, orderBy: { subject: { code: "asc" } } });
  const grades = enrollments.map(e => {
    const percent = calculateFinal(e.subject.categories.map(c => ({ weight: c.weight, conversionBase: c.conversionBase, assessments: c.assessments.map(a => ({ maxScore: a.maxScore, scores: a.scores })) })));
    return { id: e.id, code: e.subject.code, title: e.subject.title, term: e.subject.term, academicYear: e.subject.academicYear, teacher: e.subject.teacher.fullName, percent, ...equivalentFromBands(percent, e.subject.gradeBands) };
  });
  return NextResponse.json({ grades });
}
