import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { calculateFinal, equivalentFromBands } from "@/lib/grades";

const schema = z.object({
  studentNumber: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter the student ID and email address on the class record." }, { status: 400 });
  const studentNumber = parsed.data.studentNumber.toUpperCase();
  const email = parsed.data.email.toLowerCase();
  const throttle = await checkAuthThrottle(request, `quick-check:${studentNumber}:${email}`, 5);
  const networkThrottle = await checkAuthThrottle(request, "quick-check-network", 25);
  if (!throttle.allowed || !networkThrottle.allowed) return NextResponse.json({ error: "Too many quick-check attempts. Try again in 15 minutes." }, { status: 429 });

  const profile = await prisma.studentDirectory.findFirst({ where: { studentNumber, email } });
  if (!profile) return NextResponse.json({ error: "We could not verify those details. Check the student ID and email address or contact your teacher." }, { status: 404 });
  const existingAccount = await prisma.user.findFirst({ where: { role: "STUDENT", studentNumber: profile.studentNumber, email }, select: { id: true } });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentNumber: profile.studentNumber, subject: { gradeStatus: { in: ["SUBMITTED", "VERIFIED"] } } },
    include: { subject: { include: {
      teacher: { select: { fullName: true } }, gradeBands: true,
      categories: { orderBy: { sortOrder: "asc" }, include: { assessments: { orderBy: { createdAt: "asc" }, include: { scores: { where: { enrollment: { studentNumber: profile.studentNumber } }, select: { enrollmentId: true, points: true } } } } } }
    } } },
    orderBy: [{ subject: { academicYear: "desc" } }, { subject: { code: "asc" } }]
  });

  const grades = enrollments.map(enrollment => {
    const { subject } = enrollment;
    const categories = subject.categories.map(category => ({ id: category.id, parentId: category.parentId, weight: category.weight, conversionBase: category.conversionBase, assessments: category.assessments.map(item => ({ maxScore: item.maxScore, weight: item.weight, scores: item.scores.filter(score => score.enrollmentId === enrollment.id) })) }));
    const percent = calculateFinal(categories);
    const equivalent = equivalentFromBands(percent, subject.gradeBands);
    const pathFor = (categoryId: string): string => {
      const names: string[] = []; let current = subject.categories.find(category => category.id === categoryId);
      while (current) { names.unshift(current.name); current = current.parentId ? subject.categories.find(category => category.id === current?.parentId) : undefined; }
      return names.join(" / ");
    };
    return {
      id: enrollment.id, code: subject.code, title: subject.title, term: subject.term, academicYear: subject.academicYear,
      teacher: subject.teacher.fullName, status: subject.gradeStatus, submittedAt: subject.submittedAt, verifiedAt: subject.verifiedAt,
      percent, finalGrade: equivalent.finalGrade, remarks: enrollment.remarks || equivalent.remarks,
      categories: subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id)).map(category => {
        const itemScores = category.assessments.map(item => ({
          id: item.id, title: item.title, points: item.scores.find(score => score.enrollmentId === enrollment.id)?.points ?? null,
          maxScore: item.maxScore, weight: item.weight, dueDate: item.dueDate
        }));
        let effectiveWeight = category.weight; let parentId = category.parentId;
        while (parentId) { const parent = subject.categories.find(item => item.id === parentId); if (!parent) break; effectiveWeight *= parent.weight / 100; parentId = parent.parentId; }
        return { name: pathFor(category.id), weight: effectiveWeight, conversionBase: category.conversionBase, assessments: itemScores };
      })
    };
  });
  return NextResponse.json({ student: { fullName: profile.fullName, studentNumber: profile.studentNumber }, accountExists: !!existingAccount, grades });
}
