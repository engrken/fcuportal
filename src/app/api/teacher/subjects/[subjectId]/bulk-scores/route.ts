import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

type Context = { params: Promise<{ subjectId: string }> };
const batchSchema = z.object({
  scores: z.array(z.object({
    enrollmentId: z.string().min(1),
    assessmentId: z.string().min(1),
    points: z.number().finite().min(0).nullable(),
    remark: z.enum(["EXCUSED", "ABSENT", "DID_NOT_SUBMIT", "PRESENT"]).nullable()
  })).min(1).max(5000),
  source: z.enum(["workbook"]).optional()
});

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await prisma.subject.findFirst({
    where: { id: subjectId, teacherId: teacher.id, schoolId: teacher.schoolId },
    select: { id: true, gradeStatus: true, enrollments: { select: { id: true } }, assessments: { select: { id: true, maxScore: true, title: true } } }
  });
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (subject.gradeStatus === "VERIFIED") return NextResponse.json({ error: "Recall this grade record before changing scores." }, { status: 409 });
  const parsed = batchSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "The score batch is invalid or exceeds the 5,000-cell limit." }, { status: 400 });
  const enrollmentIds = new Set(subject.enrollments.map(item => item.id));
  const assessmentById = new Map(subject.assessments.map(item => [item.id, item]));
  const seen = new Set<string>();
  for (const entry of parsed.data.scores) {
    const key = `${entry.enrollmentId}:${entry.assessmentId}`;
    if (seen.has(key)) return NextResponse.json({ error: "The file contains duplicate student and assessment cells." }, { status: 400 });
    seen.add(key);
    const assessment = assessmentById.get(entry.assessmentId);
    if (!enrollmentIds.has(entry.enrollmentId) || !assessment) return NextResponse.json({ error: "A student or assessment in this batch does not belong to this class. Refresh the file and preview it again." }, { status: 400 });
    if (assessment.title.toLocaleLowerCase().startsWith("attendance ·")) return NextResponse.json({ error: "Bulk score import does not change attendance records. Use the Attendance tab." }, { status: 400 });
    if (entry.points !== null && entry.points > assessment.maxScore) return NextResponse.json({ error: `A score exceeds the maximum of ${assessment.maxScore} for ${assessment.title}.` }, { status: 400 });
    if (entry.remark && entry.points !== null) return NextResponse.json({ error: "Each imported cell must contain either a score or a status, not both." }, { status: 400 });
  }
  try {
    await prisma.$transaction(async tx => {
      // A single SQL upsert per chunk avoids the 5-second interactive transaction
      // timeout caused by issuing one Prisma upsert per imported cell.
      for (let offset = 0; offset < parsed.data.scores.length; offset += 500) {
        const chunk = parsed.data.scores.slice(offset, offset + 500);
        const values = chunk.map(entry => Prisma.sql`(${randomUUID()}, ${entry.enrollmentId}, ${entry.assessmentId}, ${entry.points}, ${entry.remark}, CURRENT_TIMESTAMP)`);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "Score" ("id", "enrollmentId", "assessmentId", "points", "remark", "updatedAt")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("enrollmentId", "assessmentId") DO UPDATE SET
            "points" = EXCLUDED."points",
            "remark" = EXCLUDED."remark",
            "updatedAt" = CURRENT_TIMESTAMP
        `);
      }
      if (parsed.data.source === "workbook") {
        await tx.auditEvent.createMany({
          data: parsed.data.scores.map(score => ({
            actorId: teacher.id, entity: "score", entityId: `${score.enrollmentId}:${score.assessmentId}`,
            action: score.remark ? `updated item status ${score.remark}` : "updated score"
          }))
        });
      } else {
        await tx.auditEvent.create({ data: { actorId: teacher.id, action: `bulk imported ${parsed.data.scores.length} score cell(s)`, entity: "subject", entityId: subjectId } });
      }
    }, { timeout: 20000 });
  } catch (error) {
    console.error("Bulk score import failed", error);
    return NextResponse.json({ error: "The score batch could not be saved. No changes were kept; retry the import, or split a very large file into smaller batches." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: parsed.data.scores.length });
}
