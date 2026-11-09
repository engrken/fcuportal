import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle } from "@/lib/rate-limit";
import { calculateCategoryPercent, calculateFinal, equivalentFromBands } from "@/lib/grades";

const schema = z.object({
  schoolId: z.string().min(1),
  studentNumber: z.string().trim().min(4).max(40),
  email: z.string().trim().email().max(200)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Enter the student ID and email address on the class record." }, { status: 400 });
  const schoolId = parsed.data.schoolId;
  const studentNumber = parsed.data.studentNumber.toUpperCase();
  const email = parsed.data.email.toLowerCase();
  const throttle = await checkAuthThrottle(request, `quick-check:${schoolId}:${studentNumber}:${email}`, 5);
  const networkThrottle = await checkAuthThrottle(request, "quick-check-network", 25);
  if (!throttle.allowed || !networkThrottle.allowed) return NextResponse.json({ error: "Too many quick-check attempts. Try again in 15 minutes." }, { status: 429 });

  const profile = await prisma.studentDirectory.findUnique({ where: { schoolId_studentNumber: { schoolId, studentNumber } } });
  if (!profile) return NextResponse.json({ error: "We could not verify those details. Check the student ID and email address or contact your teacher." }, { status: 404 });
  const existingAccount = await prisma.user.findFirst({ where: { schoolId, role: "STUDENT", studentNumber: profile.studentNumber, email }, select: { id: true } });
  if (profile.email.toLowerCase() !== email && !existingAccount) return NextResponse.json({ error: "We could not verify those details. Check the student ID and email address or contact your teacher." }, { status: 404 });

  const enrollments = await prisma.enrollment.findMany({
    where: { studentNumber: profile.studentNumber, subject: { schoolId, gradeStatus: { in: ["SUBMITTED", "VERIFIED"] } } },
    include: { subject: { include: {
      teacher: { select: { fullName: true } }, gradeBands: true,
      categories: { orderBy: { sortOrder: "asc" }, include: { assessments: { orderBy: { createdAt: "asc" }, include: { scores: { where: { enrollment: { studentNumber: profile.studentNumber } }, select: { enrollmentId: true, points: true, remark: true } } } } } }
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
      percent, finalGrade: enrollment.finalGradeOverride ?? equivalent.finalGrade, remarks: enrollment.remarks || equivalent.remarks,
      categories: subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id)).map(category => {
        const base = category.parentId ? subject.categories.find(parent => parent.id === category.parentId)?.conversionBase : category.conversionBase;
        const gradeCategory = { conversionBase: base ?? 50, assessments: category.assessments.map(item => ({ maxScore: item.maxScore, weight: item.weight, scores: item.scores.filter(score => score.enrollmentId === enrollment.id) })) };
        let root = category;
        while (root.parentId) { const parent = subject.categories.find(item => item.id === root.parentId); if (!parent) break; root = parent; }
        const weight = category.id === root.id ? root.weight : root.weight * category.weight / 100;
        return { name: pathFor(category.id), weight, percent: calculateCategoryPercent(gradeCategory) };
      })
    };
  });
  return NextResponse.json({ student: { fullName: profile.fullName, studentNumber: profile.studentNumber }, accountExists: !!existingAccount, schoolId, grades });
}
