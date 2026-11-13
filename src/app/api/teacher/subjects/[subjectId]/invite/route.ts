import { generateClassJoinCode, hashClassJoinCode, formatClassJoinCode } from "@/lib/class-invite-code";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { checkAuthThrottle } from "@/lib/rate-limit";

type Context = { params: Promise<{ subjectId: string }> };
async function owned(subjectId: string, teacherId: string, schoolId: string) {
  return prisma.subject.findFirst({ where: { id: subjectId, teacherId, schoolId },
    select: { id: true, gradeStatus: true, joinCodeHash: true, joinCodeExpiresAt: true } });
}

export async function GET(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await owned(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  return NextResponse.json({ active: Boolean(subject.joinCodeHash && subject.joinCodeExpiresAt && subject.joinCodeExpiresAt > new Date() && subject.gradeStatus === "DRAFT"), expiresAt: subject.joinCodeExpiresAt },
    { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await owned(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  if (subject.gradeStatus !== "DRAFT") return NextResponse.json({ error: "Recall the class to draft before enabling invitations." }, { status: 409 });
  const throttle = await checkAuthThrottle(request, "class-invite-rotation:" + teacher.id, 15, 60 * 60_000, "identity");
  if (!throttle.allowed) return NextResponse.json({ error: "Too many invitation resets. Try again later." }, { status: 429 });
  const code = generateClassJoinCode();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
  await prisma.$transaction([
    prisma.subject.update({ where: { id: subject.id }, data: { joinCodeHash: hashClassJoinCode(code), joinCodeExpiresAt: expiresAt } }),
    prisma.auditEvent.create({ data: { actorId: teacher.id, action: "issued or rotated class enrollment code", entity: "subject", entityId: subject.id } })
  ]);
  const formatted = formatClassJoinCode(code);
  return NextResponse.json({ code: formatted, expiresAt }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(_request: Request, context: Context) {
  const teacher = await requireRole("TEACHER");
  if (!teacher) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subjectId } = await context.params;
  const subject = await owned(subjectId, teacher.id, teacher.schoolId);
  if (!subject) return NextResponse.json({ error: "Class not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.subject.update({ where: { id: subject.id }, data: { joinCodeHash: null, joinCodeExpiresAt: null } }),
    prisma.auditEvent.create({ data: { actorId: teacher.id, action: "revoked class enrollment code", entity: "subject", entityId: subject.id } })
  ]);
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
