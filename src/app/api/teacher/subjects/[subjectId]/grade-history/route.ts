import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ subjectId: string }> };

/**
 * Grade corrections are requested only when a teacher opens an individual
 * student's change-history dialog. Loading every student's entire audit
 * history with every class page is unnecessary and slows class navigation.
 */
export async function GET(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subjectId } = await context.params;
  const enrollmentId = new URL(request.url).searchParams.get("enrollmentId")?.trim();
  if (!enrollmentId || enrollmentId.length > 160) {
    return NextResponse.json({ error: "Choose a student to view their grade-change history." }, { status: 400 });
  }

  const enrollment = await prisma.enrollment.findFirst({
    where: {
      id: enrollmentId,
      subjectId,
      subject: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId }
    },
    select: {
      id: true,
      gradeChangeHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          previousFinalGrade: true,
          previousRemarks: true,
          newFinalGrade: true,
          newRemarks: true,
          reason: true,
          createdAt: true,
          actor: { select: { fullName: true } }
        }
      }
    }
  });
  if (!enrollment) return NextResponse.json({ error: "Student record not found in your class." }, { status: 404 });
  return NextResponse.json({ history: enrollment.gradeChangeHistory }, {
    headers: { "Cache-Control": "private, no-store" }
  });
}
