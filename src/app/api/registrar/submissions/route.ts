import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const registrar = await requireRole("REGISTRAR");
  if (!registrar) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subjects = await prisma.subject.findMany({
    where: { gradeStatus: { in: ["SUBMITTED", "VERIFIED"] } },
    include: { teacher: { select: { fullName: true, email: true } }, _count: { select: { enrollments: true, assessments: true } } },
    orderBy: [{ gradeStatus: "asc" }, { submittedAt: "asc" }]
  });
  return NextResponse.json({ submissions: subjects });
}
