import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleWeekdays, weekdayFromDate } from "@/lib/schedule-days";

type Context = { params: Promise<{ subjectId: string }> };

const sessionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  categoryId: z.string().min(1),
  attendanceType: z.enum(["FACE_TO_FACE", "ONLINE"]),
  reason: z.string().trim().max(120).optional()
});

const marksSchema = z.object({
  changes: z.array(z.object({
    enrollmentId: z.string().min(1),
    assessmentId: z.string().min(1),
    remark: z.enum(["PRESENT", "ABSENT", "EXCUSED"]).nullable()
  })).min(1).max(50)
});

/**
 * Fast path for adding a meeting: fetch only the identifiers needed to seed
 * attendance, never the complete gradebook or grade-change history.
 */
export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = sessionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a valid attendance date and type." }, { status: 400 });

  const { subjectId } = await context.params;
  const { date, categoryId, attendanceType } = parsed.data;
  const meetingDate = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(meetingDate.getTime()) || meetingDate.toISOString().slice(0, 10) !== date) {
    return NextResponse.json({ error: "Choose a valid class date." }, { status: 400 });
  }
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId },
    select: {
      gradeStatus: true, schedule: true,
      categories: { select: { id: true, name: true, parentId: true } },
      assessments: {
        where: { OR: [
          { title: { startsWith: "Attendance ·" }, dueDate: meetingDate },
          { categoryId, weight: { not: null } }
        ] },
        select: { id: true, categoryId: true, weight: true, title: true, dueDate: true }
      },
      enrollments: { select: { id: true } }
    }
  });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "Recall verified grades before recording attendance." }, { status: 409 });

  const category = subject.categories.find(item => item.id === categoryId);
  if (!category || !category.name.toLocaleLowerCase().includes("attendance") || subject.categories.some(item => item.parentId === categoryId)) {
    return NextResponse.json({ error: "Choose an Attendance leaf category." }, { status: 400 });
  }
  const weekday = weekdayFromDate(date);
  const scheduledDays = scheduleWeekdays(subject.schedule);
  if (weekday === null || !scheduledDays.length) return NextResponse.json({ error: "Set a valid class schedule before adding attendance." }, { status: 400 });
  const reason = parsed.data.reason || null;
  if (!scheduledDays.includes(weekday) && (!reason || reason.length < 4)) {
    return NextResponse.json({ error: "A make-up class reason is required outside scheduled days." }, { status: 400 });
  }
  if (subject.assessments.some(item => item.title.toLocaleLowerCase().startsWith("attendance ·") && item.dueDate?.toISOString().slice(0, 10) === date)) {
    return NextResponse.json({ error: "An attendance day already exists for this date." }, { status: 409 });
  }
  if (subject.assessments.some(item => item.categoryId === categoryId && item.weight !== null)) {
    return NextResponse.json({ error: "This category uses individual item weights. Configure the attendance category before adding a meeting." }, { status: 400 });
  }

  const assessment = await prisma.$transaction(async tx => {
    const created = await tx.assessment.create({
      data: { subjectId, categoryId, title: `Attendance · ${date}`, maxScore: 1, weight: null, dueDate: meetingDate, scheduleOverrideReason: reason, attendanceType }
    });
    if (subject.enrollments.length) {
      await tx.score.createMany({
        data: subject.enrollments.map(enrollment => ({
          enrollmentId: enrollment.id, assessmentId: created.id, points: null, remark: "PRESENT"
        }))
      });
    }
    await tx.auditEvent.create({ data: { actorId: teacher.id, action: "created attendance day", entity: "assessment", entityId: created.id } });
    return created;
  });
  return NextResponse.json({ assessment }, { status: 201 });
}

/**
 * Save a small batch of attendance marks in one HTTP request and one
 * transaction. All enrolments and assessments are checked against the teacher's
 * school/class before any row is written.
 */
export async function PUT(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = marksSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid attendance changes." }, { status: 400 });

  const { subjectId } = await context.params;
  const changes = parsed.data.changes;
  const keys = changes.map(c => `${c.enrollmentId}:${c.assessmentId}`);
  if (new Set(keys).size !== keys.length) return NextResponse.json({ error: "Duplicate attendance entries in a batch." }, { status: 400 });
  const enrollmentIds = [...new Set(changes.map(c => c.enrollmentId))];
  const assessmentIds = [...new Set(changes.map(c => c.assessmentId))];
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId },
    select: {
      gradeStatus: true,
      enrollments: { where: { id: { in: enrollmentIds } }, select: { id: true } },
      assessments: { where: { id: { in: assessmentIds }, title: { startsWith: "Attendance ·" } }, select: { id: true } }
    }
  });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "Recall verified grades before editing attendance." }, { status: 409 });
  if (subject.enrollments.length !== enrollmentIds.length || subject.assessments.length !== assessmentIds.length) {
    return NextResponse.json({ error: "One or more attendance cells do not belong to this class." }, { status: 400 });
  }

  // Use one parameterized SQL upsert for the batch. One Prisma upsert per
  // student would serialize many Neon queries and can hit transaction timeouts.
  await prisma.$transaction(async tx => {
    const values = changes.map(change => Prisma.sql`(${randomUUID()}, ${change.enrollmentId}, ${change.assessmentId}, NULL, ${change.remark}, CURRENT_TIMESTAMP)`);
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO "Score" ("id", "enrollmentId", "assessmentId", "points", "remark", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("enrollmentId", "assessmentId") DO UPDATE SET
        "points" = NULL,
        "remark" = EXCLUDED."remark",
        "updatedAt" = CURRENT_TIMESTAMP
    `);
    await tx.auditEvent.createMany({
      data: changes.map(change => ({
        actorId: teacher.id,
        action: `updated attendance ${change.remark || "NOT_MARKED"}`,
        entity: "score",
        entityId: `${change.enrollmentId}:${change.assessmentId}`
      }))
    });
  });
  return NextResponse.json({ ok: true, saved: changes.length });
}
