import { prisma } from "@/lib/prisma";
import { SCHOOL_PLAN_LIMITS } from "@/lib/plans";

export class ClassEnrollmentError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

type VerifiedStudent = { id: string; schoolId: string; studentNumber: string | null; fullName: string; role: string; emailVerifiedAt: Date | null };

export async function enrollVerifiedStudent(subjectId: string, schoolId: string, student: VerifiedStudent, actorId: string) {
  if (student.role !== "STUDENT" || student.schoolId !== schoolId || !student.emailVerifiedAt || !student.studentNumber) {
    throw new ClassEnrollmentError("Only verified students with a Student ID from this school can be added.", 403);
  }
  try {
    return await prisma.$transaction(async tx => {
      const subject = await tx.subject.findFirst({
        where: { id: subjectId, schoolId },
        select: { id: true, gradeStatus: true, academicYear: true, school: { select: { plan: true } } }
      });
      if (!subject) throw new ClassEnrollmentError("Class not found.", 404);
      if (subject.gradeStatus !== "DRAFT") throw new ClassEnrollmentError("Class enrollment is closed. The teacher must recall the grades to draft first.", 409);

      const existing = await tx.enrollment.findFirst({
        where: { subjectId, OR: [
          { studentUserId: student.id },
          { studentNumber: { equals: student.studentNumber, mode: "insensitive" } }
        ] },
        select: { id: true, studentUserId: true, studentNumber: true }
      });
      if (existing) {
        if (existing.studentUserId && existing.studentUserId !== student.id) {
          throw new ClassEnrollmentError("This Student ID is already linked to another account. Contact your teacher.", 409);
        }
        if (existing.studentUserId === student.id) {
          return { enrollmentId: existing.id, created: false, linked: false };
        }
        await tx.enrollment.update({ where: { id: existing.id }, data: { studentUserId: student.id } });
        await tx.auditEvent.create({ data: { actorId, action: "linked verified student to existing class roster record", entity: "enrollment", entityId: existing.id } });
        return { enrollmentId: existing.id, created: false, linked: true };
      }

      const count = await tx.enrollment.count({ where: { subject: { schoolId, academicYear: subject.academicYear } } });
      const cap = SCHOOL_PLAN_LIMITS[subject.school.plan].studentSeats;
      if (count >= cap) throw new ClassEnrollmentError("School plan roster capacity has been reached.", 402);

      const created = await tx.enrollment.create({
        data: { subjectId, studentUserId: student.id, studentName: student.fullName, studentNumber: student.studentNumber }
      });
      await tx.auditEvent.create({ data: { actorId, action: "added verified student to class roster", entity: "enrollment", entityId: created.id } });
      return { enrollmentId: created.id, created: true, linked: false };
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ClassEnrollmentError("This student is already enrolled in this class. Refresh the roster.", 409);
    }
    throw error;
  }
}

export function classEnrollmentError(error: unknown) {
  if (error instanceof ClassEnrollmentError) return { error: error.message, status: error.status };
  return { error: "Could not update the class roster.", status: 500 };
}
