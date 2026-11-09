import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";

const querySchema = z.object({
  q: z.string().trim().min(2).max(100),
  academicYear: z.string().max(20).optional(),
  term: z.string().max(40).optional()
});

function categoryPath(categoryId: string, categories: Array<{ id: string; parentId: string | null; name: string }>) {
  const path: string[] = [];
  let current = categories.find(category => category.id === categoryId);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? categories.find(category => category.id === current!.parentId) : undefined;
  }
  return path.join(" / ");
}

export async function GET(request: Request) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const throttle = await checkAuthThrottle(request, `teacher-student-search:${teacher.id}`, 60, 60 * 1000);
  if (!throttle.allowed) return NextResponse.json({ error: "Too many searches. Wait a minute and try again." }, { status: 429 });
  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({ q: params.get("q"), academicYear: params.get("academicYear") || undefined, term: params.get("term") || undefined });
  if (!parsed.success) return NextResponse.json({ matches: [] });
  const { q, academicYear, term } = parsed.data;
  const enrollments = await prisma.enrollment.findMany({
    where: {
      subject: {
        schoolId: teacher.schoolId,
        teacherId: teacher.id,
        ...(academicYear ? { academicYear } : {}),
        ...(term ? { term } : {})
      },
      OR: [
        { studentName: { contains: q, mode: "insensitive" } },
        { studentNumber: { contains: q, mode: "insensitive" } }
      ]
    },
    orderBy: [{ studentName: "asc" }, { subject: { academicYear: "desc" } }],
    take: 50,
    include: {
      scores: true,
      subject: {
        include: {
          categories: { orderBy: { sortOrder: "asc" } },
          gradeBands: { orderBy: { sortOrder: "asc" } },
          assessments: { orderBy: { createdAt: "asc" } }
        }
      }
    }
  });

  const matches = enrollments.map(enrollment => {
    const subject = enrollment.subject;
    const categories = subject.categories.map(category => ({
      id: category.id,
      parentId: category.parentId,
      weight: category.weight,
      conversionBase: category.conversionBase,
      assessments: subject.assessments.filter(item => item.categoryId === category.id).map(item => ({
        maxScore: item.maxScore,
        weight: item.weight,
        scores: enrollment.scores.filter(score => score.assessmentId === item.id).map(score => ({ points: score.points, remark: score.remark }))
      }))
    }));
    const percent = calculateFinal(categories);
    const equivalent = equivalentFromBands(percent, subject.gradeBands);
    return {
      enrollmentId: enrollment.id,
      studentName: enrollment.studentName,
      studentNumber: enrollment.studentNumber,
      studentRemark: enrollment.remarks,
      class: {
        id: subject.id,
        classId: subject.classId,
        code: subject.code,
        title: subject.title,
        term: subject.term,
        academicYear: subject.academicYear,
        status: subject.gradeStatus
      },
      finalPercent: percent,
      finalGrade: equivalent.finalGrade,
      finalRemark: enrollment.remarks || equivalent.remarks,
      records: subject.assessments.map(item => {
        const score = enrollment.scores.find(value => value.assessmentId === item.id);
        return {
          id: item.id,
          title: item.title,
          category: categoryPath(item.categoryId, subject.categories),
          points: score?.points ?? null,
          remark: score?.remark ?? null,
          maxScore: item.maxScore,
          dueDate: item.dueDate
        };
      })
    };
  });
  return NextResponse.json({ matches, limit: 50, truncated: matches.length === 50 });
}
