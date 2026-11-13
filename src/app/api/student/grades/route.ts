import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";

export async function GET(request: Request) {
  const student = await requireRole("STUDENT");
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const summaryOnly = params.get("view") === "summary";
  const enrollmentId = params.get("enrollmentId")?.trim();
  if (enrollmentId && enrollmentId.length > 160) {
    return NextResponse.json({ error: "Invalid class record." }, { status: 400 });
  }
  const enrollmentIdentity = [
    { studentUserId: student.id },
    ...(student.studentNumber ? [{ studentNumber: { equals: student.studentNumber.trim(), mode: "insensitive" as const } }] : [])
  ];
  const enrollments = await prisma.enrollment.findMany({
    where: { OR: enrollmentIdentity, subject: { schoolId: student.schoolId, isPublished: true }, ...(enrollmentId ? { id: enrollmentId } : {}) },
    select: {
      id: true, remarks: true, finalGradeOverride: true,
      scores: { select: { assessmentId: true, points: true, remark: true } },
      subject: {
        select: {
          code: true, title: true, term: true, academicYear: true,
          gradeStatus: true, submittedAt: true, verifiedAt: true,
          teacher: { select: { fullName: true } },
          gradeBands: { select: { minPercent: true, finalGrade: true, remarks: true } },
          categories: { select: {
            id: true, parentId: true, name: true, weight: true, conversionBase: true,
            assessments: { select: { id: true, title: true, maxScore: true, weight: true, dueDate: true } }
          } }
        }
      }
    },
    orderBy: { subject: { code: "asc" } }
  });
  const grades = enrollments.map(enrollment => {
    const { subject } = enrollment;
    // Only use scores belonging to THIS enrollment, never scores from
    // another student who happens to have a matching student number.
    const scoresByItem = new Map(enrollment.scores.map(score => [score.assessmentId, score]));
    const categoryById = new Map(subject.categories.map(category => [category.id, category]));
    const parents = new Set(subject.categories.flatMap(category => category.parentId ? [category.parentId] : []));
    const percent = calculateFinal(subject.categories.map(category => ({
      id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase,
      assessments: category.assessments.map(assessment => ({
        title: assessment.title, maxScore: assessment.maxScore, weight: assessment.weight,
        scores: scoresByItem.has(assessment.id) ? [scoresByItem.get(assessment.id)!] : []
      }))
    })));
    const equivalent = equivalentFromBands(percent, enrollment.subject.gradeBands);
    const pathFor = (categoryId: string): string => {
      const names: string[] = []; let current = categoryById.get(categoryId);
      const seen = new Set<string>();
      while (current && !seen.has(current.id)) { seen.add(current.id); names.unshift(current.name); current = current.parentId ? categoryById.get(current.parentId) : undefined; }
      return names.join(" / ");
    };
    const leafCategories = subject.categories.filter(category => !parents.has(category.id));
    const allItems = subject.categories.flatMap(category => category.assessments);
    const itemCount = allItems.length;
    const recordedCount = allItems.filter(item => {
      const score = scoresByItem.get(item.id);
      return score && (score.points !== null || !!score.remark);
    }).length;
    const categories = summaryOnly ? [] : leafCategories.map(category => {
      let root = category;
      while (root.parentId) { const parent = categoryById.get(root.parentId); if (!parent) break; root = parent; }
      const weight = category.id === root.id ? root.weight : root.weight * category.weight / 100;
      const parent = category.parentId ? categoryById.get(category.parentId) : null;
      return {
        id: category.id, name: pathFor(category.id), weight,
        conversionBase: parent?.conversionBase ?? category.conversionBase,
        assessments: category.assessments.map(item => ({
          id: item.id, title: item.title,
          points: scoresByItem.get(item.id)?.points ?? null,
          remark: scoresByItem.get(item.id)?.remark ?? null,
          maxScore: item.maxScore, weight: item.weight, dueDate: item.dueDate
        }))
      };
    });
    return { id: enrollment.id, code: subject.code, title: subject.title, term: subject.term, academicYear: subject.academicYear, teacher: subject.teacher.fullName, status: subject.gradeStatus, submittedAt: subject.submittedAt, verifiedAt: subject.verifiedAt, percent, finalGrade: enrollment.finalGradeOverride ?? equivalent.finalGrade, remarks: enrollment.remarks || equivalent.remarks,
      itemCount, recordedCount,
      categories,
      gradeBands: summaryOnly ? [] : subject.gradeBands.map(band => ({
        minPercent: band.minPercent, finalGrade: band.finalGrade, remarks: band.remarks
      }))
    };
  });
  if (enrollmentId && grades.length === 0) return NextResponse.json({ error: "This class is not available to your account." }, { status: 404 });
  return NextResponse.json(enrollmentId ? { grade: grades[0] } : { grades }, { headers: { "Cache-Control": "private, no-store" } });
}
