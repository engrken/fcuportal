import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";

export async function GET() {
  const student = await requireRole("STUDENT");
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const enrollments = await prisma.enrollment.findMany({
    where: { studentUserId: student.id, subject: { gradeStatus: { in: ["SUBMITTED", "VERIFIED"] } } },
    include: {
      subject: {
        include: {
          teacher: { select: { fullName: true } },
          gradeBands: true,
          categories: {
            include: {
              assessments: {
                include: {
                  scores: {
                    where: { enrollment: { studentUserId: student.id } },
                    select: { points: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    orderBy: { subject: { code: "asc" } }
  });
  const grades = enrollments.map(enrollment => {
    const { subject } = enrollment;
    const percent = calculateFinal(subject.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: category.assessments.map(assessment => ({ maxScore: assessment.maxScore, weight: assessment.weight, scores: assessment.scores })) })));
    const equivalent = equivalentFromBands(percent, enrollment.subject.gradeBands);
    const pathFor = (categoryId: string): string => {
      const names: string[] = []; let current = subject.categories.find(category => category.id === categoryId);
      while (current) { names.unshift(current.name); current = current.parentId ? subject.categories.find(category => category.id === current?.parentId) : undefined; }
      return names.join(" / ");
    };
    const leafCategories = subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id));
    const categories = leafCategories.map(category => {
      let effectiveWeight = category.weight; let parentId = category.parentId;
      while (parentId) { const parent = subject.categories.find(item => item.id === parentId); if (!parent) break; effectiveWeight *= parent.weight / 100; parentId = parent.parentId; }
      return { name: pathFor(category.id), weight: effectiveWeight, assessments: category.assessments.map(item => ({ id: item.id, title: item.title, points: item.scores[0]?.points ?? null, maxScore: item.maxScore, weight: item.weight, dueDate: item.dueDate })) };
    });
    return { id: enrollment.id, code: subject.code, title: subject.title, term: subject.term, academicYear: subject.academicYear, teacher: subject.teacher.fullName, status: subject.gradeStatus, submittedAt: subject.submittedAt, verifiedAt: subject.verifiedAt, percent, finalGrade: equivalent.finalGrade, remarks: enrollment.remarks || equivalent.remarks, categories };
  });
  return NextResponse.json({ grades });
}
