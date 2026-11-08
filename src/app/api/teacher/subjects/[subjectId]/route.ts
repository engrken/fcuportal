import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateFinal } from "@/lib/grades";

type Context = { params: Promise<{ subjectId: string }> };
async function ownedSubject(subjectId: string, teacherId: string) {
  return prisma.subject.findFirst({ where: { id: subjectId, teacherId }, include: { categories: { orderBy: { sortOrder: "asc" } }, gradeBands: { orderBy: { sortOrder: "asc" } }, assessments: { orderBy: { createdAt: "asc" } }, enrollments: { orderBy: { studentName: "asc" }, include: { scores: true } } } });
}
export async function GET(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const details = subject.enrollments.map(enrollment => ({ ...enrollment, finalPercent: calculateFinal(subject.categories.map(category => ({ weight: category.weight, conversionBase: category.conversionBase, assessments: subject.assessments.filter(a => a.categoryId === category.id).map(a => ({ maxScore: a.maxScore, scores: enrollment.scores.filter(s => s.assessmentId === a.id) })) }))) }));
  return NextResponse.json({ subject: { ...subject, enrollments: details } });
}

const categorySchema = z.object({ categories: z.array(z.object({ id: z.string(), name: z.string().trim().min(1).max(80), weight: z.number().min(0).max(100), conversionBase: z.number().min(0).max(100) })).min(1).max(20) });
const rosterSchema = z.object({ students: z.array(z.object({ studentName: z.string().trim().min(2).max(120), studentNumber: z.string().trim().max(40).optional() })).min(1).max(100) });
const assessmentSchema = z.object({ categoryId: z.string(), title: z.string().trim().min(1).max(120), maxScore: z.number().positive().max(100000), dueDate: z.string().optional() });
const publishSchema = z.object({ isPublished: z.boolean() });
const bandsSchema = z.object({ gradeBands: z.array(z.object({ id: z.string(), minPercent: z.number().min(0).max(100), finalGrade: z.string().trim().min(1).max(12), remarks: z.string().trim().min(1).max(40) })).min(2).max(30) });
export async function PATCH(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const input = await request.json();
  if ("gradeBands" in input) {
    const parsed = bandsSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Invalid final-grade scale." }, { status: 400 });
    const values = parsed.data.gradeBands;
    if (new Set(values.map(b => b.finalGrade)).size !== values.length || new Set(values.map(b => b.minPercent)).size !== values.length) return NextResponse.json({ error: "Each grade and threshold must be unique." }, { status: 400 });
    if (values.filter(b => b.minPercent === 0).length !== 1) return NextResponse.json({ error: "Include exactly one grade band starting at 0%." }, { status: 400 });
    for (const band of values) if (!subject.gradeBands.some(existing => existing.id === band.id)) return NextResponse.json({ error: "A grade band does not belong to this subject." }, { status: 400 });
    for (const band of values) await prisma.gradeBand.update({ where: { id: band.id }, data: { minPercent: band.minPercent, finalGrade: band.finalGrade, remarks: band.remarks } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated grade scale", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
  if ("categories" in input) {
    const parsed = categorySchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Invalid grading categories." }, { status: 400 });
    const total = parsed.data.categories.reduce((sum, c) => sum + c.weight, 0);
    if (Math.abs(total - 100) > 0.01) return NextResponse.json({ error: "Category weights must total exactly 100%." }, { status: 400 });
    for (const category of parsed.data.categories) {
      if (!subject.categories.some(c => c.id === category.id)) return NextResponse.json({ error: "A category does not belong to this subject." }, { status: 400 });
      await prisma.gradeCategory.update({ where: { id: category.id }, data: { name: category.name, weight: category.weight, conversionBase: category.conversionBase } });
    }
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated grading weights", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
  const publish = publishSchema.safeParse(input);
  if (publish.success) {
    await prisma.subject.update({ where: { id: subjectId }, data: { isPublished: publish.data.isPublished } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: publish.data.isPublished ? "published grades" : "hid grades", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported update." }, { status: 400 });
}

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const input = await request.json();
  if ("students" in input) {
    const parsed = rosterSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Provide one or more valid student names." }, { status: 400 });
    const created = [];
    for (const s of parsed.data.students) {
      const item = await prisma.enrollment.create({ data: { subjectId, studentName: s.studentName, studentNumber: s.studentNumber || null } });
      created.push(item);
    }
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: `added ${created.length} roster record(s)`, entity: "subject", entityId: subjectId } });
    return NextResponse.json({ count: created.length }, { status: 201 });
  }
  const parsed = assessmentSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Check assessment title, category and maximum score." }, { status: 400 });
  if (!subject.categories.some(c => c.id === parsed.data.categoryId)) return NextResponse.json({ error: "Choose a category in this subject." }, { status: 400 });
  const assessment = await prisma.assessment.create({ data: { ...parsed.data, subjectId, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created assessment", entity: "assessment", entityId: assessment.id } });
  return NextResponse.json({ assessment }, { status: 201 });
}
