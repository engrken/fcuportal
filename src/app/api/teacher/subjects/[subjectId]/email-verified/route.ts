import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { requireRole } from "@/lib/auth";
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
  if (subject.gradeStatus !== "VERIFIED") return NextResponse.json({ error: "Email is available only after the registrar verifies this class as final." }, { status: 409 });

  const smtpUser = process.env.GMAIL_SMTP_USER;
  const smtpPassword = process.env.GMAIL_SMTP_APP_PASSWORD;
  if (!smtpUser || !smtpPassword) return NextResponse.json({ error: "Gmail SMTP is not configured yet. Add GMAIL_SMTP_USER and GMAIL_SMTP_APP_PASSWORD in the Vercel production environment." }, { status: 503 });

  const ids = subject.enrollments.map(enrollment => enrollment.studentNumber).filter((value): value is string => !!value);
  const directory = await prisma.studentDirectory.findMany({ where: { schoolId: teacher.schoolId, studentNumber: { in: ids } }, select: { studentNumber: true, email: true } });
  const emailById = new Map(directory.map(student => [student.studentNumber, student.email]));
  const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: smtpUser, pass: smtpPassword } });
  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const enrollment of subject.enrollments) {
    const to = enrollment.studentNumber ? emailById.get(enrollment.studentNumber) : undefined;
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
      const score = calculateCategoryPercent({
        conversionBase: category.conversionBase,
        assessments: category.assessments.map(item => ({ maxScore: item.maxScore, weight: item.weight, scores: item.scores.filter(value => value.enrollmentId === enrollment.id) }))
      });
      let weight = category.weight;
      let parentId = category.parentId;
      while (parentId) {
        const parent = subject.categories.find(item => item.id === parentId);
        if (!parent) break;
        weight *= parent.weight / 100;
        parentId = parent.parentId;
      }
      return `- ${category.name} (${weight.toFixed(2)}% of course): ${score == null ? "Not graded" : score.toFixed(2) + "%"}`;
    });
    const text = [
      `Hello ${enrollment.studentName},`,
      "",
      `Your final grade for ${subject.code}: ${subject.title} (${subject.term}, ${subject.academicYear}) has been verified in the independent Faculty Grade Portal.`,
      "",
      ...parts,
      "",
      `Total course grade: ${percent == null ? "—" : percent.toFixed(2) + "%"}`,
      `Final grade: ${equivalent.finalGrade ?? "—"}`,
      `Remarks: ${enrollment.remarks || equivalent.remarks}`,
      "",
      "This is an independent faculty portal and is not an official FCU registrar notice."
    ].join("\n");
    try {
      await transporter.sendMail({ from: smtpUser, to, subject: `Verified grade: ${subject.code} · ${subject.term} ${subject.academicYear}`, text });
      sent++;
    } catch {
      failures.push(enrollment.studentNumber || enrollment.studentName);
    }
  }
  await prisma.auditEvent.create({ data: { actorId: teacher.id, action: `emailed verified grades to ${sent} student(s); skipped ${skipped}`, entity: "subject", entityId: subject.id } });
  return NextResponse.json({ sent, skipped, failed: failures.length, failures });
}
