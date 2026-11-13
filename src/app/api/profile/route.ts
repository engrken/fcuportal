import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normalizeFacultyId } from "@/lib/account-identifiers";

const schema = z.object({
  fullName: z.string().trim().min(2).max(120),
  facultyId: z.string().trim().max(40).optional()
});

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid full name and Faculty ID." }, { status: 400 });

  if (parsed.data.facultyId !== undefined && user.role !== "TEACHER") {
    return NextResponse.json({ error: "Only faculty accounts can edit a Faculty ID." }, { status: 403 });
  }
  const facultyId = parsed.data.facultyId === undefined
    ? undefined : normalizeFacultyId(parsed.data.facultyId);
  if (parsed.data.facultyId !== undefined && !facultyId) {
    return NextResponse.json({
      error: "Faculty ID must contain 3–40 letters, numbers, hyphens, periods, underscores, or slashes."
    }, { status: 400 });
  }
  const changedFacultyId = facultyId !== undefined && facultyId !== user.facultyId;

  try {
    const updated = await prisma.$transaction(async tx => {
      const result = await tx.user.updateMany({
        where: { id: user.id, schoolId: user.schoolId },
        data: {
          fullName: parsed.data.fullName,
          ...(facultyId !== undefined ? { facultyId } : {})
        }
      });
      if (result.count && changedFacultyId) await tx.auditEvent.create({
        data: {
          actorId: user.id,
          action: "updated Faculty ID",
          entity: "user",
          entityId: user.id
        }
      });
      return result;
    });
    if (!updated.count) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    return NextResponse.json({ ok: true, facultyId: facultyId ?? user.facultyId });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({
        error: "This Faculty ID is already in use by another teacher at your school."
      }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update your profile. Please try again." }, { status: 500 });
  }
}
