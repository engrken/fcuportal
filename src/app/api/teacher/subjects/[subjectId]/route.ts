import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCategoryPercent, calculateFinal, equivalentFromBands } from "@/lib/grades";
import { scheduleWeekdays, weekdayFromDate } from "@/lib/schedule-days";

type Context = { params: Promise<{ subjectId: string }> };
async function ownedSubject(subjectId: string, teacherId: string, schoolId: string) {
  return prisma.subject.findFirst({ where: { id: subjectId, teacherId, schoolId }, include: { categories: { orderBy: { sortOrder: "asc" } }, gradeBands: { orderBy: { sortOrder: "asc" } }, assessments: { orderBy: { createdAt: "asc" } }, enrollments: { orderBy: { studentName: "asc" }, include: { scores: true, student: { select: { email: true } } } } } });
}
export async function GET(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const details = subject.enrollments.map(enrollment => ({ ...enrollment, finalPercent: calculateFinal(subject.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: subject.assessments.filter(a => a.categoryId === category.id).map(a => ({ maxScore: a.maxScore, weight: a.weight, scores: enrollment.scores.filter(s => s.assessmentId === a.id) })) }))) }));
  return NextResponse.json({ subject: { ...subject, enrollments: details } });
}

const categorySchema = z.object({ categories: z.array(z.object({ id: z.string(), parentId: z.string().nullable().optional(), name: z.string().trim().min(1).max(80), weight: z.number().min(0).max(100), conversionBase: z.number().min(0).max(100) })).min(1).max(40) });
const newCategorySchema = z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().nullable().optional(), weight: z.number().min(0).max(100).optional(), conversionBase: z.number().min(0).max(100).optional() });
const rosterSchema = z.object({ students: z.array(z.object({ studentName: z.string().trim().min(2).max(120), studentNumber: z.string().trim().max(40).optional() })).min(1).max(100) });
const enrollmentUpdateSchema = z.object({ updateEnrollment: z.object({ enrollmentId: z.string(), studentName: z.string().trim().min(2).max(120), studentNumber: z.string().trim().max(40).nullable().optional() }) });
const assessmentSchema = z.object({ categoryId: z.string(), title: z.string().trim().min(1).max(120), maxScore: z.number().positive().max(100000), weight: z.number().min(0).max(100).nullable().optional(), dueDate: z.string().optional(), scheduleOverrideReason: z.string().trim().max(120).optional() });
const assessmentUpdatesSchema = z.object({ assessmentItems: z.array(z.object({ id: z.string(), categoryId: z.string(), title: z.string().trim().min(1).max(120), maxScore: z.number().positive().max(100000), weight: z.number().min(0).max(100).nullable(), dueDate: z.string().nullable().optional(), scheduleOverrideReason: z.string().trim().max(120).nullable().optional() })).min(1).max(200) });
const remarkSchema = z.object({ enrollmentId: z.string(), remark: z.enum(["INC", "NP", "DROPPED"]).nullable() });
const copyGradingSchema = z.object({ copyGradingFromSubjectId: z.string() });
const bandsSchema = z.object({ gradeBands: z.array(z.object({ id: z.string(), minPercent: z.number().min(0).max(100), finalGrade: z.string().trim().min(1).max(12), remarks: z.string().trim().min(1).max(40) })).min(2).max(30) });
export async function PATCH(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const input = await request.json();
  if ("recallGrades" in input) {
    if (input.recallGrades !== true) return NextResponse.json({ error: "Confirm recall of the submitted grades." }, { status: 400 });
    if (subject.gradeStatus !== "SUBMITTED") return NextResponse.json({ error: "Only submitted, not-yet-verified grades can be recalled by the teacher." }, { status: 409 });
    await prisma.$transaction([
      prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "DRAFT", isPublished: false, submittedAt: null, verifiedAt: null } }),
      prisma.auditEvent.create({ data: { actorId: teacher.id, action: "recalled submitted grades to draft", entity: "subject", entityId: subjectId } })
    ]);
    return NextResponse.json({ ok: true, gradeStatus: "DRAFT" });
  }
  if ("submitGrades" in input) {
    if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "These grades have been verified and are final. Ask the registrar to reopen the record before making a correction." }, { status: 409 });
    if (input.submitGrades !== true) return NextResponse.json({ error: "Confirm grade submission." }, { status: 400 });
    if (!subject.categories.length || !subject.assessments.length || !subject.enrollments.length) return NextResponse.json({ error: "Add grading categories, assessment items, and students before submitting grades." }, { status: 400 });
    const parents = new Set(subject.categories.map(category => category.parentId ?? "root"));
    for (const parentKey of parents) {
      const siblings = subject.categories.filter(category => (category.parentId ?? "root") === parentKey);
      if (Math.abs(siblings.reduce((sum, category) => sum + category.weight, 0) - 100) > 0.01) return NextResponse.json({ error: `${parentKey === "root" ? "Overall" : "Subcategory"} weights must total exactly 100% before submission.` }, { status: 400 });
    }
    const leaves = subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id));
    for (const category of leaves) {
      const items = subject.assessments.filter(item => item.categoryId === category.id);
      if (category.weight > 0 && !items.length) return NextResponse.json({ error: `Add at least one assessment item to ${category.name} before submission.` }, { status: 400 });
      if (items.some(item => item.weight !== null) && (items.some(item => item.weight === null) || Math.abs(items.reduce((sum, item) => sum + (item.weight ?? 0), 0) - 100) > 0.01)) return NextResponse.json({ error: `Assessment item weights in ${category.name} must total exactly 100%.` }, { status: 400 });
    }
    const missingScores = subject.enrollments.filter(enrollment => !enrollment.remarks && subject.assessments.some(item => !enrollment.scores.some(score => score.assessmentId === item.id && (score.points !== null || !!score.remark)))).length;
    if (missingScores) return NextResponse.json({ error: `${missingScores} student record(s) have missing assessment scores. Enter a score or set an item status such as Excused, Absent, or Did not submit.` }, { status: 400 });
    const now = new Date();
    await prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "SUBMITTED", isPublished: true, submittedAt: now, verifiedAt: null } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "submitted grades for registrar verification", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true, gradeStatus: "SUBMITTED", submittedAt: now });
  }
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record has been verified and is final. Ask the registrar to reopen it before editing." }, { status: 409 });
  if ("updateEnrollment" in input) {
    const parsed = enrollmentUpdateSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Enter a valid student name and number." }, { status: 400 });
    const { enrollmentId, studentName, studentNumber } = parsed.data.updateEnrollment;
    const enrollment = subject.enrollments.find(item => item.id === enrollmentId);
    if (!enrollment) return NextResponse.json({ error: "Student roster record not found." }, { status: 404 });
    const number = studentNumber?.trim() || null;
    if (number && subject.enrollments.some(item => item.id !== enrollmentId && item.studentNumber?.toLocaleLowerCase() === number.toLocaleLowerCase())) return NextResponse.json({ error: "That student number is already in this class roster." }, { status: 409 });
    const changedNumber = (enrollment.studentNumber || null) !== number;
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { studentName, studentNumber: number, ...(changedNumber ? { studentUserId: null } : {}) } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: changedNumber ? "updated roster details and unlinked the mismatched student account" : "updated roster student name", entity: "enrollment", entityId: enrollmentId } });
    return NextResponse.json({ ok: true, accountUnlinked: changedNumber && !!enrollment.studentUserId });
  }
  if ("deleteEnrollmentId" in input) {
    const enrollmentId = z.string().safeParse(input.deleteEnrollmentId); if (!enrollmentId.success) return NextResponse.json({ error: "Choose a student roster record to remove." }, { status: 400 });
    const enrollment = subject.enrollments.find(item => item.id === enrollmentId.data);
    if (!enrollment) return NextResponse.json({ error: "Student roster record not found." }, { status: 404 });
    await prisma.enrollment.delete({ where: { id: enrollment.id } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "removed student and scores from class roster", entity: "enrollment", entityId: enrollment.id } });
    return NextResponse.json({ ok: true });
  }
  if ("copyGradingFromSubjectId" in input) {
    const parsed = copyGradingSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Choose a class grading setup to copy." }, { status: 400 });
    if (parsed.data.copyGradingFromSubjectId === subjectId) return NextResponse.json({ error: "Choose a different class." }, { status: 400 });
    if (subject.assessments.length > 0) return NextResponse.json({ error: "Copy the grading setup before adding assessments; this class already has assessments." }, { status: 409 });
    const source = await ownedSubject(parsed.data.copyGradingFromSubjectId, teacher.id, teacher.schoolId);
    if (!source) return NextResponse.json({ error: "Source class not found." }, { status: 404 });
    await prisma.$transaction(async tx => {
      await tx.gradeCategory.deleteMany({ where: { subjectId } });
      await tx.gradeBand.deleteMany({ where: { subjectId } });
      const categoryIds = new Map<string, string>();
      const pending = [...source.categories];
      while (pending.length) {
        const index = pending.findIndex(category => !category.parentId || categoryIds.has(category.parentId));
        if (index < 0) throw new Error("The source grading structure contains a cycle.");
        const [category] = pending.splice(index, 1);
        const created = await tx.gradeCategory.create({ data: { subjectId, parentId: category.parentId ? categoryIds.get(category.parentId) : null, name: category.name, weight: category.weight, conversionBase: 0, sortOrder: category.sortOrder } });
        categoryIds.set(category.id, created.id);
      }
      for (const band of source.gradeBands) await tx.gradeBand.create({ data: { subjectId, minPercent: band.minPercent, finalGrade: band.finalGrade, remarks: band.remarks, sortOrder: band.sortOrder } });
      await tx.auditEvent.create({ data: { actorId: teacher.id, action: `copied grading setup from ${source.code}`, entity: "subject", entityId: subjectId } });
    });
    return NextResponse.json({ ok: true });
  }
  if ("remark" in input) {
    const parsed = remarkSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Choose a valid class remark." }, { status: 400 });
    const enrollment = await prisma.enrollment.findFirst({ where: { id: parsed.data.enrollmentId, subjectId } });
    if (!enrollment) return NextResponse.json({ error: "Student roster record not found." }, { status: 404 });
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { remarks: parsed.data.remark } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: parsed.data.remark ? `set student remark ${parsed.data.remark}` : "cleared student remark", entity: "enrollment", entityId: enrollment.id } });
    return NextResponse.json({ ok: true });
  }
  if ("deleteCategoryId" in input) {
    const categoryId = z.string().safeParse(input.deleteCategoryId); if (!categoryId.success) return NextResponse.json({ error: "Choose a category to remove." }, { status: 400 });
    const category = subject.categories.find(item => item.id === categoryId.data);
    if (!category) return NextResponse.json({ error: "Category not found." }, { status: 404 });
    if (subject.assessments.some(item => item.categoryId === category.id) || subject.categories.some(item => item.parentId === category.id)) return NextResponse.json({ error: "Move its assessment items and subcategories before removing it." }, { status: 409 });
    await prisma.gradeCategory.delete({ where: { id: category.id } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "deleted empty grading category", entity: "grade-category", entityId: category.id } });
    return NextResponse.json({ ok: true });
  }
  if ("deleteAssessmentId" in input) {
    const assessmentId = z.string().safeParse(input.deleteAssessmentId); if (!assessmentId.success) return NextResponse.json({ error: "Choose an assessment to remove." }, { status: 400 });
    const assessment = subject.assessments.find(item => item.id === assessmentId.data);
    if (!assessment) return NextResponse.json({ error: "Assessment not found." }, { status: 404 });
    await prisma.assessment.delete({ where: { id: assessment.id } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "deleted assessment and its associated score records", entity: "assessment", entityId: assessment.id } });
    return NextResponse.json({ ok: true });
  }
  if ("assessmentItems" in input) {
    const parsed = assessmentUpdatesSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Check assessment names, maximum points, and item weights." }, { status: 400 });
    const items = parsed.data.assessmentItems;
    if (items.length !== subject.assessments.length || items.some(item => !subject.assessments.some(existing => existing.id === item.id))) return NextResponse.json({ error: "The assessment list changed. Refresh and try again." }, { status: 409 });
    if (items.some(item => !subject.categories.some(category => category.id === item.categoryId) || subject.categories.some(category => category.parentId === item.categoryId))) return NextResponse.json({ error: "Choose a leaf category for every assessment item." }, { status: 400 });
    for (const item of items.filter(value => value.title.toLocaleLowerCase().startsWith("attendance ·"))) {
      const weekday = item.dueDate ? weekdayFromDate(item.dueDate.slice(0, 10)) : null;
      if (weekday === null) return NextResponse.json({ error: `Choose a date for ${item.title}.` }, { status: 400 });
      if (!subject.categories.some(category => category.id === item.categoryId && category.name.toLocaleLowerCase().includes("attendance"))) return NextResponse.json({ error: "Attendance days must use a category whose name includes Attendance." }, { status: 400 });
      if (!scheduleWeekdays(subject.schedule).includes(weekday) && (item.scheduleOverrideReason || "").trim().length < 4) return NextResponse.json({ error: `${item.title} is outside the class schedule. Add a make-up class reason or select a scheduled day.` }, { status: 400 });
    }
    const attendanceDates = items.filter(item => item.title.toLocaleLowerCase().startsWith("attendance ·")).map(item => item.dueDate?.slice(0, 10));
    if (attendanceDates.some((date, index) => date && attendanceDates.indexOf(date) !== index)) return NextResponse.json({ error: "Only one attendance day can be recorded per date." }, { status: 409 });
    if (items.some(item => item.maxScore < Math.max(0, ...subject.enrollments.flatMap(enrollment => enrollment.scores.filter(score => score.assessmentId === item.id).map(score => score.points ?? 0))))) return NextResponse.json({ error: "Perfect score cannot be lower than a score already entered." }, { status: 400 });
    for (const item of items) await prisma.assessment.update({ where: { id: item.id }, data: { categoryId: item.categoryId, title: item.title, maxScore: item.maxScore, weight: item.weight, dueDate: item.dueDate ? new Date(item.dueDate) : null, scheduleOverrideReason: item.scheduleOverrideReason || null } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated assessment setup", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
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
    const values = parsed.data.categories;
    if (new Set(values.map(c => c.name.toLocaleLowerCase())).size !== values.length) return NextResponse.json({ error: "Category names must be unique within a class." }, { status: 400 });
    if (values.some(c => !subject.categories.some(existing => existing.id === c.id) || (c.parentId && !values.some(parent => parent.id === c.parentId)))) return NextResponse.json({ error: "A category or parent does not belong to this class." }, { status: 400 });
    if (values.some(c => c.parentId && subject.assessments.some(a => a.categoryId === c.parentId))) return NextResponse.json({ error: "Move assessment items out of a category before nesting other categories under it." }, { status: 409 });
    for (const category of values) if (category.id === category.parentId) return NextResponse.json({ error: "A category cannot be its own parent." }, { status: 400 });
    const byId = new Map(values.map(category => [category.id, category]));
    for (const category of values) {
      const ancestors = new Set([category.id]); let parentId = category.parentId ?? null;
      while (parentId) { if (ancestors.has(parentId)) return NextResponse.json({ error: "Grading categories cannot contain a cycle." }, { status: 400 }); ancestors.add(parentId); parentId = byId.get(parentId)?.parentId ?? null; }
    }
    const parents = new Set(values.map(category => category.parentId ?? "root"));
    for (const parentKey of parents) {
      const siblings = values.filter(category => (category.parentId ?? "root") === parentKey);
      const total = siblings.reduce((sum, category) => sum + category.weight, 0);
      if (Math.abs(total - 100) > 0.01) return NextResponse.json({ error: `${parentKey === "root" ? "Top-level" : "Subcategory"} weights must total exactly 100%.` }, { status: 400 });
    }
    for (const category of values) {
      const existing = subject.categories.find(c => c.id === category.id)!;
      if ((category.parentId ?? null) !== (existing.parentId ?? null) && subject.assessments.some(a => a.categoryId === existing.id)) return NextResponse.json({ error: "Move assessments before changing a category that contains them." }, { status: 409 });
    }
    for (const category of values) await prisma.gradeCategory.update({ where: { id: category.id }, data: { parentId: category.parentId ?? null, name: category.name, weight: category.weight, conversionBase: 0 } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated grading weights", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported update." }, { status: 400 });
}

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record has been verified and is final. Ask the registrar to reopen it before editing." }, { status: 409 });
  const input = await request.json();
  if ("category" in input) {
    const parsed = newCategorySchema.safeParse(input.category); if (!parsed.success) return NextResponse.json({ error: "Provide a category name." }, { status: 400 });
    const parentId = parsed.data.parentId || null;
    if (parentId && !subject.categories.some(category => category.id === parentId)) return NextResponse.json({ error: "Parent category not found." }, { status: 404 });
    if (parentId && subject.assessments.some(assessment => assessment.categoryId === parentId)) return NextResponse.json({ error: "Move assessment items out of this category before adding subcategories." }, { status: 409 });
    const siblings = subject.categories.filter(category => (category.parentId ?? null) === parentId);
    if (subject.categories.some(category => category.name.toLocaleLowerCase() === parsed.data.name.toLocaleLowerCase())) return NextResponse.json({ error: "A category with that name already exists in this class." }, { status: 409 });
    const category = await prisma.gradeCategory.create({ data: { subjectId, parentId, name: parsed.data.name, weight: parsed.data.weight ?? 0, conversionBase: parsed.data.conversionBase ?? 0, sortOrder: siblings.length } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created grading category", entity: "grade-category", entityId: category.id } });
    return NextResponse.json({ category }, { status: 201 });
  }
  if ("students" in input) {
    const parsed = rosterSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Provide one or more valid student names." }, { status: 400 });
    const school = await prisma.school.findUnique({ where: { id: teacher.schoolId }, select: { plan: true } });
    const rosterSeats = await prisma.enrollment.count({ where: { subject: { schoolId: teacher.schoolId } } });
    const seatLimit = SCHOOL_PLAN_LIMITS[school?.plan || "FREE"].studentSeats;
    if (rosterSeats + parsed.data.students.length > seatLimit) return NextResponse.json({ error: `Your school plan allows ${seatLimit} student-class seats. Upgrade the school plan to add more roster entries.` }, { status: 402 });
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
  const category = subject.categories.find(item => item.id === parsed.data.categoryId);
  if (category && subject.categories.some(item => item.parentId === category.id)) return NextResponse.json({ error: "Choose a leaf category for assessment items." }, { status: 400 });
  const isAttendance = parsed.data.title.toLocaleLowerCase().startsWith("attendance ·");
  if (isAttendance) {
    const weekday = parsed.data.dueDate ? weekdayFromDate(parsed.data.dueDate.slice(0, 10)) : null;
    if (weekday === null) return NextResponse.json({ error: "Choose a valid date for this attendance day." }, { status: 400 });
    if (!scheduleWeekdays(subject.schedule).length) return NextResponse.json({ error: "Set the class schedule before adding attendance days." }, { status: 400 });
    if (!subject.categories.some(item => item.id === parsed.data.categoryId && item.name.toLocaleLowerCase().includes("attendance"))) return NextResponse.json({ error: "Choose a category whose name includes Attendance for attendance days." }, { status: 400 });
    const matches = scheduleWeekdays(subject.schedule).includes(weekday);
    if (!matches && (parsed.data.scheduleOverrideReason || "").trim().length < 4) return NextResponse.json({ error: "This date is outside the class schedule. Add a reason such as “Make-up class”." }, { status: 400 });
    const duplicate = subject.assessments.some(item => item.title.toLocaleLowerCase().startsWith("attendance ·") && item.dueDate?.toISOString().slice(0, 10) === parsed.data.dueDate?.slice(0, 10));
    if (duplicate) return NextResponse.json({ error: "An attendance day already exists for this date." }, { status: 409 });
  }
  const existingItems = subject.assessments.filter(item => item.categoryId === parsed.data.categoryId);
  if (existingItems.some(item => item.weight !== null) && (parsed.data.weight === undefined || parsed.data.weight === null)) return NextResponse.json({ error: "This category uses item weights. Enter a weight for this item." }, { status: 400 });
  const assessment = await prisma.assessment.create({ data: { ...parsed.data, weight: parsed.data.weight ?? null, subjectId, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null, scheduleOverrideReason: parsed.data.scheduleOverrideReason || null } });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created assessment", entity: "assessment", entityId: assessment.id } });
  return NextResponse.json({ assessment }, { status: 201 });
}
