import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ subjectId: string }> };
export async function PATCH(request: Request, context: Context) {
  const registrar = await requireRole("REGISTRAR");
  if (!registrar) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findUnique({ where: { id: subjectId }, include: { categories: true, assessments: true, enrollments: { include: { scores: true } } } });
  const input = await request.json().catch(() => ({}));
  if (input.action === "recall") {
    if (!subject || !["SUBMITTED", "VERIFIED"].includes(subject.gradeStatus)) return NextResponse.json({ error: "Only submitted or verified grades can be recalled." }, { status: 409 });
    await prisma.$transaction([
      prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "DRAFT", isPublished: false, submittedAt: null, verifiedAt: null } }),
      prisma.auditEvent.create({ data: { actorId: registrar.id, action: `recalled ${subject.gradeStatus.toLocaleLowerCase()} grades to draft`, entity: "subject", entityId: subjectId } })
    ]);
    return NextResponse.json({ ok: true, gradeStatus: "DRAFT" });
  }
  if (!subject || subject.gradeStatus !== "SUBMITTED") return NextResponse.json({ error: "This class is not waiting for registrar verification." }, { status: 409 });
  const parents = new Set(subject.categories.map(category => category.parentId ?? "root"));
  for (const parentKey of parents) {
    const total = subject.categories.filter(category => (category.parentId ?? "root") === parentKey).reduce((sum, category) => sum + category.weight, 0);
    if (Math.abs(total - 100) > 0.01) return NextResponse.json({ error: "The grading weights changed or are incomplete. Return this class to the teacher for correction." }, { status: 409 });
  }
  const leaves = subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id));
  for (const category of leaves) {
    const items = subject.assessments.filter(item => item.categoryId === category.id);
    if (category.weight > 0 && !items.length) return NextResponse.json({ error: `The category ${category.name} has no assessment items. Return the record to the teacher for correction.` }, { status: 409 });
    if (items.some(item => item.weight !== null) && (items.some(item => item.weight === null) || Math.abs(items.reduce((sum, item) => sum + (item.weight ?? 0), 0) - 100) > 0.01)) return NextResponse.json({ error: `Assessment item weights in ${category.name} are incomplete.` }, { status: 409 });
  }
  const incomplete = subject.enrollments.filter(enrollment => !enrollment.remarks && subject.assessments.some(item => !enrollment.scores.some(score => score.assessmentId === item.id && (score.points !== null || !!score.remark))));
  if (incomplete.length) return NextResponse.json({ error: `${incomplete.length} student record(s) still have missing assessment scores.` }, { status: 409 });
  const now = new Date();
  await prisma.$transaction([
    prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "VERIFIED", verifiedAt: now } }),
    prisma.auditEvent.create({ data: { actorId: registrar.id, action: "verified submitted grades as final", entity: "subject", entityId: subjectId } })
  ]);
  return NextResponse.json({ ok: true, gradeStatus: "VERIFIED", verifiedAt: now });
}
