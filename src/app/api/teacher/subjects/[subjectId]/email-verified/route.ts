import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { emailDeliveryConfigured, sendPortalEmail } from "@/lib/mailer";
import { calculateCategoryPercent, calculateFinal, equivalentFromBands } from "@/lib/grades";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ subjectId: string }> };

export async function POST(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId },
    include: {
      categories: { orderBy: { sortOrder: "asc" }, include: { assessments: { include: { scores: true } } } },
      gradeBands: true,
      enrollments: { orderBy: { studentName: "asc" } }
    }
  });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (subject.gradeStatus !== "VERIFIED") return NextResponse.json({ error: "Email is available only after the teacher finalizes the class." }, { status: 409 });

  if (!emailDeliveryConfigured()) return NextResponse.json({ error: "Email delivery is not configured yet. Contact the portal administrator." }, { status: 503 });

  const ids = subject.enrollments.map(enrollment => enrollment.studentNumber).filter((value): value is string => !!value);
  const [directory, portalAccounts] = await Promise.all([
    prisma.studentDirectory.findMany({ where: { schoolId: teacher.schoolId, studentNumber: { in: ids } }, select: { studentNumber: true, email: true } }),
    prisma.user.findMany({ where: { schoolId: teacher.schoolId, role: "STUDENT", studentNumber: { in: ids } }, select: { studentNumber: true, email: true, emailVerifiedAt: true } })
  ]);
  const directoryEmailById = new Map(directory.map(student => [student.studentNumber, student.email]));
  const portalAccountById = new Map(portalAccounts.map(student => [student.studentNumber, student]));
  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const enrollment of subject.enrollments) {
    const studentNumber = enrollment.studentNumber;
    const account = studentNumber ? portalAccountById.get(studentNumber) : undefined;
    const to = account ? (account.emailVerifiedAt ? account.email : null) : studentNumber && directoryEmailById.get(studentNumber);
    if (!to) { skipped++; continue; }
    const categories = subject.categories.map(category => ({
      id: category.id,
      parentId: category.parentId,
      weight: category.weight,
      conversionBase: category.conversionBase,
      assessments: category.assessments.map(item => ({
        maxScore: item.maxScore,
        weight: item.weight,
        scores: item.scores.filter(score => score.enrollmentId === enrollment.id)
      }))
    }));
    const percent = calculateFinal(categories);
    const equivalent = equivalentFromBands(percent, subject.gradeBands);
    const leaves = subject.categories.filter(category => !subject.categories.some(child => child.parentId === category.id));
    const parts = leaves.map(category => {
      const base = category.parentId ? subject.categories.find(parent => parent.id === category.parentId)?.conversionBase : category.conversionBase;
      const score = calculateCategoryPercent({
        conversionBase: base ?? 50,
        assessments: category.assessments.map(item => ({ maxScore: item.maxScore, weight: item.weight, scores: item.scores.filter(value => value.enrollmentId === enrollment.id) }))
      });
      let root = category;
      while (root.parentId) { const parent = subject.categories.find(item => item.id === root.parentId); if (!parent) break; root = parent; }
      const weight = category.id === root.id ? root.weight : root.weight * category.weight / 100;
      return `- ${category.name} (${weight.toFixed(2)}% of course): ${score == null ? "Not graded" : score.toFixed(2) + "%"}`;
    });
    const text = [
      `Hello ${enrollment.studentName},`,
      "",
      `Your final grade for ${subject.code}: ${subject.title} (${subject.term}, ${subject.academicYear}) has been verified in the SAGA Student Portal.`,
      "",
      ...parts,
      "",
      `Total course grade: ${percent == null ? "—" : percent.toFixed(2) + "%"}`,
      `Final grade: ${enrollment.finalGradeOverride ?? equivalent.finalGrade ?? "—"}`,
      `Remarks: ${enrollment.remarks || equivalent.remarks}`,
      "",
      "This is an informational SAGA grade notice sent by the teacher. Contact your school for official records."
    ].join("\n");
    try {
      await sendPortalEmail({ to, subject: `Verified grade: ${subject.code} · ${subject.term} ${subject.academicYear}`, text });
      sent++;
    } catch {
      failures.push(enrollment.studentNumber || enrollment.studentName);
    }
  }
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: `emailed verified grades to ${sent} student(s); skipped ${skipped}`, entity: "subject", entityId: subject.id } });
  return NextResponse.json({ sent, skipped, failed: failures.length, failures });
}
