import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";

export async function GET() {
  const student = await requireRole("STUDENT");
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentUserId: student.id, subject: { isPublished: true } },
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
    const percent = calculateFinal(
      enrollment.subject.categories.map(category => ({
        weight: category.weight,
        conversionBase: category.conversionBase,
        assessments: category.assessments.map(assessment => ({
          maxScore: assessment.maxScore,
          scores: assessment.scores
        }))
      }))
    );
    const equivalent = equivalentFromBands(percent, enrollment.subject.gradeBands);

    return {
      id: enrollment.id,
      code: enrollment.subject.code,
      title: enrollment.subject.title,
      term: enrollment.subject.term,
      academicYear: enrollment.subject.academicYear,
      teacher: enrollment.subject.teacher.fullName,
      percent,
      finalGrade: equivalent.finalGrade,
      remarks: enrollment.remarks || equivalent.remarks
    };
  });

  return NextResponse.json({ grades });
}
