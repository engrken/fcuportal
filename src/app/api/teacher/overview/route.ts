import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleWeekdays } from "@/lib/schedule-days";

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function nextDay(date: Date) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function scheduleForWeekday(raw: string | null, weekday: number) {
  if (!raw?.trim()) return [] as string[];
  try {
    const rows = JSON.parse(raw) as Array<{ label?: string; day?: string; startTime?: string; endTime?: string }>;
    if (Array.isArray(rows)) return rows.filter(row => scheduleWeekdays(JSON.stringify([row])).includes(weekday)).map(row => `${row.label || "Class"}${row.startTime || row.endTime ? ` · ${row.startTime || ""}${row.startTime && row.endTime ? "–" : ""}${row.endTime || ""}` : ""}`);
  } catch { /* Legacy free-text schedules are checked by scheduleWeekdays below. */ }
  return scheduleWeekdays(raw).includes(weekday) ? [raw] : [];
}

export async function GET(request: Request) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const from = parseDate(params.get("from"));
  const to = parseDate(params.get("to"));
  if (!from || !to || from > to) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
  const rangeEnd = nextDay(to);
  const manilaDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const today = new Date(`${manilaDate}T00:00:00.000Z`);
  const subjectScope = { teacherId: teacher.id, schoolId: teacher.schoolId };

  const [subjects, upcomingAttendance, upcomingAssessments] = await Promise.all([
    prisma.subject.findMany({
      where: subjectScope,
      select: {
        id: true, code: true, title: true, classId: true, gradeStatus: true, schedule: true,
        enrollments: { select: { studentUserId: true, studentNumber: true, studentName: true } },
        assessments: {
          where: { dueDate: { gte: from, lt: rangeEnd } },
          select: {
            id: true, title: true, dueDate: true,
            category: { select: { name: true } },
            scores: { select: { points: true, remark: true } }
          }
        }
      }
    }),
    prisma.assessment.findMany({
      where: { subject: subjectScope, title: { startsWith: "Attendance ·" }, dueDate: { gte: today } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, title: true, dueDate: true, attendanceType: true, scheduleOverrideReason: true, scores: { select: { remark: true } }, subject: { select: { id: true, code: true, title: true, _count: { select: { enrollments: true } } } } }
    }),
    prisma.assessment.findMany({
      where: { subject: subjectScope, NOT: { title: { startsWith: "Attendance ·" } }, dueDate: { gte: today } },
      orderBy: { dueDate: "asc" }, take: 8,
      select: { id: true, title: true, dueDate: true, attendanceType: true, scheduleOverrideReason: true, subject: { select: { id: true, code: true, title: true } } }
    })
  ]);

  const students = new Set<string>();
  let activities = 0;
  let tests = 0;
  let present = 0;
  let absent = 0;
  let excused = 0;
  for (const subject of subjects) {
    for (const enrollment of subject.enrollments) {
      const key = enrollment.studentNumber?.trim().toLocaleLowerCase() || enrollment.studentUserId || enrollment.studentName.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      if (key) students.add(key);
    }
    for (const assessment of subject.assessments) {
      const isAttendance = assessment.title.toLocaleLowerCase().startsWith("attendance ·");
      if (isAttendance) {
        for (const score of assessment.scores) {
          if (score.remark === "PRESENT") present++;
          else if (score.remark === "ABSENT") absent++;
          else if (score.remark === "EXCUSED") excused++;
        }
        continue;
      }
      activities++;
      if (/\b(test|exam)\b/i.test(`${assessment.title} ${assessment.category.name}`)) tests++;
    }
  }

  const submissions = {
    draft: subjects.filter(subject => subject.gradeStatus === "DRAFT").length,
    provisional: subjects.filter(subject => subject.gradeStatus === "SUBMITTED").length,
    final: subjects.filter(subject => subject.gradeStatus === "VERIFIED").length
  };
  const upcoming = (items: typeof upcomingAttendance, isAttendance = false) => items.map(item => ({
    id: item.id,
    title: isAttendance ? "Attendance day" : item.title,
    date: item.dueDate?.toISOString() ?? null,
    subjectId: item.subject.id,
    code: item.subject.code,
    subjectTitle: item.subject.title,
    attendanceType: item.attendanceType,
    scheduleOverrideReason: item.scheduleOverrideReason,
    markedCount: isAttendance ? item.scores.filter(score => ["PRESENT", "ABSENT", "EXCUSED"].includes(score.remark || "")).length : undefined,
    studentCount: isAttendance ? item.subject._count.enrollments : undefined
  }));
  const todayWeekday = today.getUTCDay();
  const todayClasses = subjects.flatMap(subject => {
    const sessions = scheduleForWeekday(subject.schedule, todayWeekday);
    return sessions.length ? [{
      id: subject.id,
      code: subject.code,
      title: subject.title,
      classId: subject.classId,
      schedule: sessions,
      canRecordAttendance: subject.gradeStatus !== "VERIFIED"
    }] : [];
  });

  return NextResponse.json({
    stats: {
      activeClasses: subjects.length,
      activeStudents: students.size,
      activities,
      tests,
      pendingReviews: submissions.provisional,
      attendanceLogs: present + absent + excused
    },
    attendance: { present, absent, excused },
    submissions,
    enrollment: subjects.map(subject => ({ id: subject.id, label: subject.classId || subject.code, title: subject.title, code: subject.code, count: subject.enrollments.length })),
    today: manilaDate,
    todayClasses,
    upcoming: { attendance: upcoming(upcomingAttendance, true), assessments: upcoming(upcomingAssessments) }
  });
}
