import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateCategoryPercent, calculateFinal, equivalentFromBands, LECTURE_LAB_GRADING_TEMPLATE, LECTURE_ONLY_GRADING_TEMPLATE, LABORATORY_ONLY_GRADING_TEMPLATE, expectedChildAllocation, remainingChildAllocation, firstOverallocatedCategoryGroup } from "@/lib/grades";
import { scheduleWeekdays, weekdayFromDate } from "@/lib/schedule-days";

type Context = { params: Promise<{ subjectId: string }> };
async function ownedSubject(subjectId: string, teacherId: string, schoolId: string) {
  return prisma.subject.findFirst({ where: { id: subjectId, teacherId, schoolId }, include: { categories: { orderBy: { sortOrder: "asc" } }, gradeBands: { orderBy: { sortOrder: "asc" } }, assessments: { orderBy: { createdAt: "asc" } }, enrollments: { orderBy: { studentName: "asc" }, include: { scores: true, gradeChangeHistory: { orderBy: { createdAt: "desc" }, include: { actor: { select: { fullName: true } } } } } } } });
}
export async function GET(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const details = subject.enrollments.map(enrollment => ({ ...enrollment, finalPercent: calculateFinal(subject.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: subject.assessments.filter(a => a.categoryId === category.id).map(a => ({ title: a.title, maxScore: a.maxScore, weight: a.weight, scores: enrollment.scores.filter(s => s.assessmentId === a.id) })) }))) }));
  return NextResponse.json({ subject: { ...subject, enrollments: details } });
}

const categoryValuesSchema = z.array(z.object({ id: z.string(), parentId: z.string().nullable().optional(), name: z.string().trim().min(1).max(80), weight: z.number().min(0).max(100), conversionBase: z.number().min(1).max(100) })).max(40);
const categorySchema = z.object({ categories: categoryValuesSchema.min(1) });
const newCategorySchema = z.object({ name: z.string().trim().min(1).max(80), parentId: z.string().nullable().optional(), weight: z.number().min(0).max(100).optional(), conversionBase: z.number().min(1).max(100).optional() });
const rosterSchema = z.object({ students: z.array(z.object({ studentName: z.string().trim().min(2).max(120), studentNumber: z.string().trim().max(40).optional() })).min(1).max(100) });
const enrollmentUpdateSchema = z.object({ updateEnrollment: z.object({ enrollmentId: z.string(), studentName: z.string().trim().min(2).max(120), studentNumber: z.string().trim().max(40).nullable().optional() }) });
const assessmentSchema = z.object({ categoryId: z.string(), title: z.string().trim().min(1).max(120), maxScore: z.number().positive().max(100000), weight: z.number().min(0).max(100).nullable().optional(), dueDate: z.string().optional(), scheduleOverrideReason: z.string().trim().max(120).optional(), attendanceType: z.enum(["FACE_TO_FACE", "ONLINE"]).nullable().optional() });
const assessmentUpdatesSchema = z.object({ assessmentItems: z.array(z.object({ id: z.string(), categoryId: z.string(), title: z.string().trim().min(1).max(120), maxScore: z.number().positive().max(100000), weight: z.number().min(0).max(100).nullable(), dueDate: z.string().nullable().optional(), scheduleOverrideReason: z.string().trim().max(120).nullable().optional(), attendanceType: z.enum(["FACE_TO_FACE", "ONLINE"]).nullable().optional() })).min(1).max(200) });
const remarkSchema = z.object({ enrollmentId: z.string(), remark: z.enum(["INC", "NP", "DROPPED"]).nullable() });
const gradeChangeSchema = z.object({ gradeChange: z.object({ enrollmentId: z.string(), finalGrade: z.string().trim().min(1).max(12), remarks: z.string().trim().max(40), reason: z.string().trim().min(10).max(500) }) });
const copyGradingSchema = z.object({ copyGradingFromSubjectId: z.string() });
const bandsSchema = z.object({ gradeBands: z.array(z.object({ id: z.string().optional(), minPercent: z.number().min(0).max(100), finalGrade: z.string().trim().min(1).max(12), remarks: z.string().trim().min(1).max(40) })).min(2).max(30) });
const subjectDetailsSchema = z.object({ updateSubject: z.object({ classId: z.string().trim().min(1).max(40), code: z.string().trim().min(1).max(30), title: z.string().trim().min(2).max(160), term: z.string().trim().min(1).max(40), academicYear: z.string().trim().min(4).max(20), schedule: z.string().trim().max(4000).nullable(), courseYear: z.string().trim().max(80).nullable() }) });
export async function PATCH(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params; const subject = await ownedSubject(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  const input = await request.json().catch(() => null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if ("setStudentVisibility" in input) {
    const parsed = z.object({ setStudentVisibility: z.boolean() }).safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "Choose visible or hidden." }, { status: 400 });
    const visible = parsed.data.setStudentVisibility;
    if (subject.isPublished !== visible) {
      await prisma.$transaction([
        prisma.subject.update({ where: { id: subjectId }, data: { isPublished: visible } }),
        prisma.auditEvent.create({ data: { actorId: teacher.id, entity: "subject", entityId: subjectId, action: visible ? "made student grades visible" : "hid student grades" } })
      ]);
    }
    return NextResponse.json({ ok: true, isPublished: visible }, { headers: { "Cache-Control": "no-store" } });
  }
  if ("gradeChange" in input) {
    if (subject.gradeStatus !== "VERIFIED") return NextResponse.json({ error: "Grade changes are available after this class is verified to the Registrar." }, { status: 409 });
    const parsed = gradeChangeSchema.safeParse(input);
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid grade and remark, and enter a reason of at least 10 characters." }, { status: 400 });
    const change = parsed.data.gradeChange;
    const enrollment = subject.enrollments.find(item => item.id === change.enrollmentId);
    if (!enrollment) return NextResponse.json({ error: "Student roster record not found in this class." }, { status: 404 });
    const allowedGrades = new Set(["AUTO", ...subject.gradeBands.map(band => band.finalGrade)]);
    const allowedRemarks = new Set(["AUTO", "Passed", "Failed", "INC", "NP", "DROPPED"]);
    if (!allowedGrades.has(change.finalGrade) || !allowedRemarks.has(change.remarks)) return NextResponse.json({ error: "Choose a grade and remark from this class's grading scale." }, { status: 400 });
    const calculatedPercent = calculateFinal(subject.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: subject.assessments.filter(item => item.categoryId === category.id).map(item => ({ title: item.title, maxScore: item.maxScore, weight: item.weight, scores: enrollment.scores.filter(score => score.assessmentId === item.id) })) })));
    const automatic = equivalentFromBands(calculatedPercent, subject.gradeBands);
    const previousFinalGrade = enrollment.finalGradeOverride ?? automatic.finalGrade;
    const previousRemarks = enrollment.remarks ?? automatic.remarks;
    const finalGradeOverride = change.finalGrade === "AUTO" ? null : change.finalGrade;
    const remarks = change.remarks === "AUTO" ? null : change.remarks;
    const nextFinalGrade = finalGradeOverride ?? automatic.finalGrade;
    const nextRemarks = remarks ?? automatic.remarks;
    if (previousFinalGrade === nextFinalGrade && previousRemarks === nextRemarks) return NextResponse.json({ error: "The selected grade and remark match the current record." }, { status: 400 });
    await prisma.$transaction(async tx => {
      await tx.enrollment.update({ where: { id: enrollment.id }, data: { finalGradeOverride, remarks } });
      await tx.gradeChangeHistory.create({ data: { enrollmentId: enrollment.id, actorId: teacher.id, previousFinalGrade, previousRemarks, newFinalGrade: nextFinalGrade, newRemarks: nextRemarks, reason: change.reason } });
      await tx.auditEvent.create({ data: { actorId: teacher.id, action: `changed verified grade from ${previousFinalGrade ?? "—"} to ${nextFinalGrade ?? "—"}: ${change.reason}`, entity: "enrollment", entityId: enrollment.id } });
    });
    return NextResponse.json({ ok: true });
  }
  if ("recallGrades" in input) {
    if (input.recallGrades !== true) return NextResponse.json({ error: "Confirm recall of the submitted grades." }, { status: 400 });
    if (subject.gradeStatus === "DRAFT") return NextResponse.json({ error: "This class has no submitted grades to recall." }, { status: 409 });
    await prisma.$transaction([
      prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "DRAFT", isPublished: false, submittedAt: null, verifiedAt: null } }),
      prisma.auditEvent.create({ data: { actorId: teacher.id, action: "recalled submitted grades to draft", entity: "subject", entityId: subjectId } })
    ]);
    return NextResponse.json({ ok: true, gradeStatus: "DRAFT" });
  }
  if ("updateSubject" in input) {
    if (subject.gradeStatus !== "DRAFT") return NextResponse.json({ error: "Recall submitted grades before editing class details." }, { status: 409 });
    const parsed = subjectDetailsSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Check the Class ID and class details." }, { status: 400 });
    const details = parsed.data.updateSubject;
    if (details.term === "Trimester") details.term = "3rd Semester";
    if (await prisma.subject.findFirst({ where: { schoolId: teacher.schoolId, id: { not: subjectId }, classId: { equals: details.classId, mode: "insensitive" } }, select: { id: true } })) return NextResponse.json({ error: "That Class ID is already used in this school." }, { status: 409 });
    await prisma.subject.update({ where: { id: subjectId }, data: details });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated class identity, schedule, or course details", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true });
  }
  if ("deleteSubject" in input) {
    if (input.deleteSubject !== true) return NextResponse.json({ error: "Confirm class deletion." }, { status: 400 });
    if (subject.gradeStatus !== "DRAFT") return NextResponse.json({ error: "Recall submitted grades before deleting this class." }, { status: 409 });
    await prisma.$transaction(async tx => {
      await tx.auditEvent.create({ data: { actorId: teacher.id, action: `deleted draft class ${subject.classId || subject.code}`, entity: "subject", entityId: subjectId } });
      await tx.subject.delete({ where: { id: subjectId } });
    });
    return NextResponse.json({ ok: true, deleted: true });
  }
  if ("submitGrades" in input) {
    if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "These grades have already been finalized. Recall them before making a correction." }, { status: 409 });
    if (input.submitGrades !== true) return NextResponse.json({ error: "Confirm grade submission." }, { status: 400 });
    if (!subject.categories.length || !subject.assessments.length || !subject.enrollments.length) return NextResponse.json({ error: "Add grading categories, assessment items, and students before submitting grades." }, { status: 400 });
    const parents = new Set(subject.categories.map(category => category.parentId ?? "root"));
    for (const parentKey of parents) {
      const siblings = subject.categories.filter(category => (category.parentId ?? "root") === parentKey);
      const parentId = parentKey === "root" ? null : parentKey;
      const expected = expectedChildAllocation(parentId, subject.categories);
      const total = siblings.reduce((sum, category) => sum + category.weight, 0);
      if (Math.abs(total - expected) > 0.01) {
        const parentName = parentId ? subject.categories.find(category => category.id === parentId)?.name : "Overall course groups";
        return NextResponse.json({ error: `${parentName} allocations total ${total.toFixed(2)}%; they must total ${expected}% before submission. Check the subcategories directly under that parent.` }, { status: 400 });
      }
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
    await prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "SUBMITTED", submittedAt: now, verifiedAt: null } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "submitted class grade record; student visibility unchanged", entity: "subject", entityId: subjectId } });
    return NextResponse.json({ ok: true, gradeStatus: "SUBMITTED", submittedAt: now, verifiedAt: null });
  }
  if ("verifyGrades" in input) {
    if (input.verifyGrades !== true) return NextResponse.json({ error: "Confirm that the official school-record grades have been submitted to the Registrar." }, { status: 400 });
    if (subject.gradeStatus !== "SUBMITTED") return NextResponse.json({ error: "Submit these grades to students before marking them verified with the Registrar." }, { status: 409 });
    const now = new Date();
    await prisma.$transaction([
      prisma.subject.update({ where: { id: subjectId }, data: { gradeStatus: "VERIFIED", verifiedAt: now } }),
      prisma.auditEvent.create({ data: { actorId: teacher.id, action: "teacher confirmed official grades submitted to Registrar", entity: "subject", entityId: subjectId } })
    ]);
    return NextResponse.json({ ok: true, gradeStatus: "VERIFIED", submittedAt: subject.submittedAt, verifiedAt: now });
  }
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record has been finalized. Recall it before making changes." }, { status: 409 });
  if ("updateEnrollment" in input) {
    const parsed = enrollmentUpdateSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Enter a valid student name and number." }, { status: 400 });
    const { enrollmentId, studentName, studentNumber } = parsed.data.updateEnrollment;
    const enrollment = subject.enrollments.find(item => item.id === enrollmentId);
    if (!enrollment) return NextResponse.json({ error: "Student roster record not found." }, { status: 404 });
    const number = studentNumber?.trim().toUpperCase() || null;
    if (number && subject.enrollments.some(item => item.id !== enrollmentId && item.studentNumber?.toLocaleLowerCase() === number.toLocaleLowerCase())) return NextResponse.json({ error: "That student number is already in this class roster." }, { status: 409 });
    const matchingStudent = number ? await prisma.user.findFirst({ where: { schoolId: teacher.schoolId, role: "STUDENT", studentNumber: number }, select: { id: true } }) : null;
    await prisma.enrollment.update({ where: { id: enrollmentId }, data: { studentName, studentNumber: number, studentUserId: matchingStudent?.id ?? null } });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated class roster details", entity: "enrollment", entityId: enrollmentId } });
    return NextResponse.json({ ok: true, studentUserId: matchingStudent?.id ?? null });
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
        const created = await tx.gradeCategory.create({ data: { subjectId, parentId: category.parentId ? categoryIds.get(category.parentId) : null, name: category.name, weight: category.weight, conversionBase: category.conversionBase ?? 50, sortOrder: category.sortOrder } });
        categoryIds.set(category.id, created.id);
      }
      for (const band of source.gradeBands) await tx.gradeBand.create({ data: { subjectId, minPercent: band.minPercent, finalGrade: band.finalGrade, remarks: band.remarks, sortOrder: band.sortOrder } });
      await tx.auditEvent.create({ data: { actorId: teacher.id, action: `copied grading setup from ${source.code}`, entity: "subject", entityId: subjectId } });
    });
    return NextResponse.json({ ok: true });
  }
  if (["LECTURE_ONLY", "LABORATORY_ONLY", "LECTURE_LAB", "LECTURE_LAB_60_40"].includes(input.gradingTemplate)) {
    if (subject.gradeStatus !== "DRAFT") return NextResponse.json({ error: "Recall this class to draft before changing its grading structure." }, { status: 409 });
    const lectureOnly = input.gradingTemplate === "LECTURE_ONLY";
    const laboratoryOnly = input.gradingTemplate === "LABORATORY_ONLY";
    const legacyTemplate = input.gradingTemplate === "LECTURE_LAB_60_40";
    const lectureWeight = lectureOnly ? 100 : laboratoryOnly ? 0 : input.lectureWeight ?? (legacyTemplate ? 60 : undefined);
    const laboratoryWeight = laboratoryOnly ? 100 : lectureOnly ? 0 : input.laboratoryWeight ?? (legacyTemplate ? 40 : undefined);
    const validWeights = lectureOnly ? lectureWeight === 100 : laboratoryOnly ? laboratoryWeight === 100 : typeof lectureWeight === "number" && typeof laboratoryWeight === "number" && lectureWeight >= 1 && laboratoryWeight >= 1 && Math.abs(lectureWeight + laboratoryWeight - 100) <= 0.01;
    if (typeof lectureWeight !== "number" || typeof laboratoryWeight !== "number" || !validWeights) {
      return NextResponse.json({ error: "Enter Lecture and Laboratory weights that total exactly 100%." }, { status: 400 });
    }
    const template = (lectureOnly ? LECTURE_ONLY_GRADING_TEMPLATE : laboratoryOnly ? LABORATORY_ONLY_GRADING_TEMPLATE : LECTURE_LAB_GRADING_TEMPLATE).map(category => ({
      ...category,
      weight: category.key === "lecture" ? lectureWeight : category.key === "laboratory" ? laboratoryWeight : category.weight
    }));
    const categoryById = new Map(subject.categories.map(category => [category.id, category]));
    const categoryPathFor = (categoryId: string) => {
      const path: string[] = [];
      let category = categoryById.get(categoryId);
      while (category) { path.unshift(category.name); category = category.parentId ? categoryById.get(category.parentId) : undefined; }
      return path.join(" ").toLocaleLowerCase().replace(/[\s_-]+/g, " ");
    };
    const remap = subject.assessments.map(item => {
      const source = categoryPathFor(item.categoryId);
      const label = `${source} ${item.title.toLocaleLowerCase()}`.replace(/[\s_-]+/g, " ");
      const isLab = /\blab(?:oratory)?\b/.test(label);
      let key: string | null = null;
      if (isLab && /\b(?:exam|examination|test|practical)\b/.test(label)) key = "laboratory-exam";
      else if (isLab && /\b(?:exercise|activity|activities)\b/.test(label)) key = "laboratory-exercise";
      else if (isLab && /\b(?:mid\s*term|finals?)\b/.test(label)) key = "laboratory-exam";
      else if (/\bprelim(?:inary)?\b/.test(label)) key = "prelim";
      else if (/\bmid\s*term\b/.test(label)) key = "midterm";
      else if (/\bfinals?\b/.test(label)) key = "finals";
      else if (/self evaluation|self eval/.test(label)) key = "self-evaluation";
      else if (/\bquiz(?:zes)?\b|\bassignments?\b/.test(label)) key = "quizzes-assignments";
      else if (/\battendance\b|\bparticipation\b/.test(label)) key = "attendance-participation";
      return { assessmentId: item.id, title: item.title, key };
    });
    const templateKeys = new Set<string>(template.map(category => category.key));
    const unmapped = remap.filter(item => !item.key || !templateKeys.has(item.key));
    if (unmapped.length) return NextResponse.json({ error: `Could not safely place these assessment items: ${unmapped.map(item => item.title).join(", ")}. Rename or move them to a clear grading category first; no changes were made.` }, { status: 409 });
    await prisma.$transaction(async tx => {
      const oldCategoryIds = subject.categories.map(category => category.id);
      for (const category of subject.categories) await tx.gradeCategory.update({ where: { id: category.id }, data: { name: `__template_replaced_${category.id}` } });
      const categoryIds = new Map<string, string>();
      const siblingOrder = new Map<string, number>();
      for (const category of template) {
        const parentId = category.parentKey ? categoryIds.get(category.parentKey) : null;
        if (category.parentKey && !parentId) throw new Error(`Missing template parent: ${category.parentKey}`);
        const siblingKey = category.parentKey ?? "root";
        const sortOrder = siblingOrder.get(siblingKey) ?? 0;
        const created = await tx.gradeCategory.create({ data: { subjectId, parentId: parentId ?? null, name: category.name, weight: category.weight, conversionBase: 70, sortOrder } });
        categoryIds.set(category.key, created.id);
        siblingOrder.set(siblingKey, sortOrder + 1);
      }
      for (const item of remap) {
        const categoryId = item.key ? categoryIds.get(item.key) : null;
        if (!categoryId) throw new Error(`Missing template category for assessment: ${item.title}`);
        await tx.assessment.update({ where: { id: item.assessmentId }, data: { categoryId } });
      }
      if (oldCategoryIds.length) await tx.gradeCategory.deleteMany({ where: { subjectId, id: { in: oldCategoryIds } } });
      const action = lectureOnly ? "applied lecture-only grading template" : laboratoryOnly ? "applied laboratory-only grading template" : `applied Lecture ${lectureWeight}% / Laboratory ${laboratoryWeight}% grading template`;
      await tx.auditEvent.create({ data: { actorId: teacher.id, action, entity: "subject", entityId: subjectId } });
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
    // An onBlur edit usually changes a single row. Do not send up to 200
    // identical UPDATE statements to Neon on each edit.
    const existingById = new Map(subject.assessments.map(item => [item.id, item]));
    const changed = items.filter(item => {
      const previous = existingById.get(item.id)!;
      return item.categoryId !== previous.categoryId || item.title !== previous.title ||
        item.maxScore !== previous.maxScore || (item.weight ?? null) !== (previous.weight ?? null) ||
        (item.dueDate?.slice(0, 10) || null) !== (previous.dueDate?.toISOString().slice(0, 10) || null) ||
        (item.scheduleOverrideReason || null) !== (previous.scheduleOverrideReason || null) ||
        (item.attendanceType || null) !== (previous.attendanceType || null);
    });
    if (changed.length) {
      await prisma.$transaction([
        ...changed.map(item => prisma.assessment.update({
          where: { id: item.id },
          data: {
            categoryId: item.categoryId, title: item.title, maxScore: item.maxScore, weight: item.weight,
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            scheduleOverrideReason: item.scheduleOverrideReason || null,
            attendanceType: item.attendanceType || null
          }
        })),
        prisma.auditEvent.create({ data: { actorId: teacher.id, action: `updated ${changed.length} assessment item(s)`, entity: "subject", entityId: subjectId } })
      ]);
    }
    return NextResponse.json({ ok: true });
  }
  if ("gradeBands" in input) {
    const parsed = bandsSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Invalid final-grade scale." }, { status: 400 });
    const values = parsed.data.gradeBands;
    if (new Set(values.map(b => b.finalGrade)).size !== values.length || new Set(values.map(b => b.minPercent)).size !== values.length) return NextResponse.json({ error: "Each grade and threshold must be unique." }, { status: 400 });
    if (values.filter(b => b.minPercent === 0).length !== 1) return NextResponse.json({ error: "Include exactly one grade band starting at 0%." }, { status: 400 });
    if (values.some(band => band.id && !subject.gradeBands.some(existing => existing.id === band.id))) return NextResponse.json({ error: "A grade band does not belong to this subject." }, { status: 400 });
    await prisma.$transaction(async tx => {
      const retainedIds = values.flatMap(band => band.id && !band.id.startsWith("draft-") ? [band.id] : []);
      for (const band of values) {
        const data = { minPercent: band.minPercent, finalGrade: band.finalGrade, remarks: band.remarks };
        if (band.id && !band.id.startsWith("draft-")) await tx.gradeBand.update({ where: { id: band.id }, data });
        else await tx.gradeBand.create({ data: { ...data, subjectId, sortOrder: values.indexOf(band) } });
      }
      await tx.gradeBand.deleteMany({ where: { subjectId, ...(retainedIds.length ? { id: { notIn: retainedIds } } : {}) } });
    });
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
      const parentId = parentKey === "root" ? null : parentKey;
      const expected = expectedChildAllocation(parentId, values);
      if (Math.abs(total - expected) > 0.01) {
        const parentName = parentId ? values.find(category => category.id === parentId)?.name || "Parent category" : "Overall course groups";
        return NextResponse.json({ error: `${parentName} allocations total ${total.toFixed(2)}%; they must total ${expected}%. Check the subcategories directly under that parent.` }, { status: 400 });
      }
    }
    for (const category of values) {
      const existing = subject.categories.find(c => c.id === category.id)!;
      if ((category.parentId ?? null) !== (existing.parentId ?? null) && subject.assessments.some(a => a.categoryId === existing.id)) return NextResponse.json({ error: "Move assessments before changing a category that contains them." }, { status: 409 });
    }
    const changed = values.filter(category => {
      const old = subject.categories.find(item => item.id === category.id)!;
      return (category.parentId ?? null) !== (old.parentId ?? null) || category.name !== old.name ||
        category.weight !== old.weight || category.conversionBase !== old.conversionBase;
    });
    if (changed.length) {
      await prisma.$transaction([
        ...changed.map(category => prisma.gradeCategory.update({
          where: { id: category.id },
          data: { parentId: category.parentId ?? null, name: category.name, weight: category.weight, conversionBase: category.conversionBase }
        })),
        prisma.auditEvent.create({ data: { actorId: teacher.id, action: "updated grading weights", entity: "subject", entityId: subjectId } })
      ]);
    }
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unsupported update." }, { status: 400 });
}

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER"); if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Class creation paths do not need every historic score, grade correction
  // record or final-grade calculation. Fetch only the fields used below.
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId },
    select: {
      id: true, gradeStatus: true, academicYear: true, schedule: true,
      categories: { orderBy: { sortOrder: "asc" } },
      assessments: { select: { id: true, categoryId: true, title: true, weight: true, dueDate: true } },
      enrollments: { select: { id: true, studentNumber: true } }
    }
  });
  if (!subject) return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "This grade record has been finalized. Recall it before making changes." }, { status: 409 });
  const input = await request.json();
  if ("category" in input) {
    const parsed = newCategorySchema.safeParse(input.category);
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid subcategory name and weight." }, { status: 400 });
    const parentId = parsed.data.parentId || null;
    if (parentId && !subject.categories.some(category => category.id === parentId)) return NextResponse.json({ error: "Parent category not found." }, { status: 404 });
    if (parentId && subject.assessments.some(assessment => assessment.categoryId === parentId)) return NextResponse.json({ error: "Move assessment items out of this category before adding subcategories." }, { status: 409 });
    if (subject.categories.length >= 40) return NextResponse.json({ error: "This class already has the maximum of 40 grading categories." }, { status: 400 });

    // The teacher may have edited existing weights without saving the full path.
    // Use those edits for validation and persist them atomically with the new child.
    let existingCategories = subject.categories.map(category => ({
      id: category.id, parentId: category.parentId, name: category.name,
      weight: category.weight, conversionBase: category.conversionBase
    }));
    if ("existingCategories" in input) {
      const draft = categoryValuesSchema.safeParse(input.existingCategories);
      if (!draft.success) return NextResponse.json({ error: "Invalid pending grading edits. Check category names and percentages." }, { status: 400 });
      const ids = new Set(draft.data.map(category => category.id));
      const originalById = new Map(subject.categories.map(category => [category.id, category]));
      if (draft.data.length !== subject.categories.length || ids.size !== subject.categories.length ||
        draft.data.some(category => !originalById.has(category.id))) {
        return NextResponse.json({ error: "The grading setup changed. Refresh the class before adding a subcategory." }, { status: 409 });
      }
      if (draft.data.some(category => (category.parentId ?? null) !== originalById.get(category.id)?.parentId)) {
        return NextResponse.json({ error: "Cannot change category parents while adding a subcategory." }, { status: 400 });
      }
      existingCategories = draft.data.map(category => ({ ...category, parentId: category.parentId ?? null }));
    }

    const names = [...existingCategories.map(category => category.name.toLocaleLowerCase()), parsed.data.name.toLocaleLowerCase()];
    if (new Set(names).size !== names.length) return NextResponse.json({ error: "Category names must be unique within a class." }, { status: 409 });
    const invalid = firstOverallocatedCategoryGroup(existingCategories);
    if (invalid) {
      const parentName = invalid.parentId ? existingCategories.find(category => category.id === invalid.parentId)?.name || "Parent" : "Course";
      return NextResponse.json({ error: `${parentName} is over-allocated (${invalid.allocated.toFixed(2)}% / ${invalid.expected.toFixed(2)}%). Adjust the weights before adding another category.` }, { status: 400 });
    }

    const remaining = remainingChildAllocation(parentId, existingCategories);
    const requested = parsed.data.weight ?? remaining;
    if (requested > remaining + 0.01) {
      return NextResponse.json({ error: `Only ${remaining.toFixed(2)}% remains ${parentId ? "within this parent" : "in the course total"}. Reduce the new subcategory weight or an existing allocation.` }, { status: 400 });
    }
    const siblings = existingCategories.filter(category => (category.parentId ?? null) === parentId);
    const parentBase = parentId ? existingCategories.find(category => category.id === parentId)?.conversionBase ?? 50 : 50;
    const category = await prisma.$transaction(async tx => {
      const originals = new Map(subject.categories.map(item => [item.id, item]));
      for (const item of existingCategories) {
        const previous = originals.get(item.id)!;
        if (previous.name !== item.name || previous.weight !== item.weight || previous.conversionBase !== item.conversionBase) {
          await tx.gradeCategory.update({ where: { id: item.id }, data: { name: item.name, weight: item.weight, conversionBase: item.conversionBase } });
        }
      }
      return tx.gradeCategory.create({ data: { subjectId, parentId, name: parsed.data.name, weight: requested, conversionBase: parsed.data.conversionBase ?? parentBase, sortOrder: siblings.length } });
    });
    await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created grading category and saved pending grading edits", entity: "grade-category", entityId: category.id } });
    return NextResponse.json({ category }, { status: 201 });
  }
  if ("students" in input) {
    const parsed = rosterSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Provide one or more valid student names." }, { status: 400 });
    const school = await prisma.school.findUnique({ where: { id: teacher.schoolId }, select: { plan: true } });
    const rosterSeats = await prisma.enrollment.count({ where: { subject: { schoolId: teacher.schoolId, academicYear: subject.academicYear } } });
    const seatLimit = SCHOOL_PLAN_LIMITS[school?.plan || "FREE"].studentSeats;
    if (rosterSeats + parsed.data.students.length > seatLimit) return NextResponse.json({ error: `Your school plan allows ${seatLimit} student-class seats. Upgrade the school plan to add more roster entries.` }, { status: 402 });
    const normalized = parsed.data.students.map(student => ({
      studentName: student.studentName,
      studentNumber: student.studentNumber?.trim().toUpperCase() || null
    }));
    const allNumbers = normalized.flatMap(student => student.studentNumber ? [student.studentNumber] : []);
    if (new Set(allNumbers).size !== allNumbers.length) {
      return NextResponse.json({ error: "Student IDs must be unique within the imported roster." }, { status: 409 });
    }
    const numbers = [...new Set(allNumbers)];
    const [existing, matchingStudents] = await Promise.all([
      numbers.length ? prisma.enrollment.findMany({ where: { subjectId, studentNumber: { in: numbers } }, select: { studentNumber: true } }) : Promise.resolve([]),
      numbers.length ? prisma.user.findMany({ where: { schoolId: teacher.schoolId, role: "STUDENT", studentNumber: { in: numbers } }, select: { id: true, studentNumber: true } }) : Promise.resolve([])
    ]);
    if (existing.length) return NextResponse.json({ error: "A student ID already exists in this class roster. Remove the duplicate from the import." }, { status: 409 });
    const studentByNumber = new Map(matchingStudents.map(student => [student.studentNumber, student.id]));
    let created;
    try {
      created = await prisma.$transaction(async tx => {
        const rows = await tx.enrollment.createManyAndReturn({
          data: normalized.map(student => ({
            subjectId, studentName: student.studentName,
            studentNumber: student.studentNumber,
            studentUserId: student.studentNumber ? studentByNumber.get(student.studentNumber) ?? null : null
          }))
        });
        await tx.auditEvent.create({ data: { actorId: teacher.id, action: `added ${rows.length} roster record(s)`, entity: "subject", entityId: subjectId } });
        return rows;
      });
    } catch (error) {
      // A concurrent import may have inserted the same class/student ID.
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return NextResponse.json({ error: "One or more student IDs are already enrolled in this class." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ count: created.length, enrollments: created }, { status: 201 });
  }
  const parsed = assessmentSchema.safeParse(input); if (!parsed.success) return NextResponse.json({ error: "Check assessment title, category and maximum score." }, { status: 400 });
  if (!subject.categories.some(c => c.id === parsed.data.categoryId)) return NextResponse.json({ error: "Choose a category in this subject." }, { status: 400 });
  const category = subject.categories.find(item => item.id === parsed.data.categoryId);
  if (category && subject.categories.some(item => item.parentId === category.id)) return NextResponse.json({ error: "Choose a leaf category for assessment items." }, { status: 400 });
  const isAttendance = parsed.data.title.toLocaleLowerCase().startsWith("attendance ·");
  if (isAttendance) {
    if (!parsed.data.attendanceType) return NextResponse.json({ error: "Choose Face-to-Face or Online for this attendance day." }, { status: 400 });
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
  const assessment = await prisma.$transaction(async tx => {
    const created = await tx.assessment.create({ data: { ...parsed.data, weight: parsed.data.weight ?? null, subjectId, dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null, scheduleOverrideReason: parsed.data.scheduleOverrideReason || null, attendanceType: parsed.data.attendanceType || null } });
    if (isAttendance && subject.enrollments.length) await tx.score.createMany({ data: subject.enrollments.map(enrollment => ({ enrollmentId: enrollment.id, assessmentId: created.id, points: null, remark: "PRESENT" })) });
    return created;
  });
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: "created assessment", entity: "assessment", entityId: assessment.id } });
  return NextResponse.json({ assessment }, { status: 201 });
}
