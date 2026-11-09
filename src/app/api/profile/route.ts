import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ fullName: z.string().trim().min(2).max(120) });
export async function PATCH(request: Request) {
  const user = await getSession(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Enter a name between 2 and 120 characters." }, { status: 400 });
  try {
    const updated = await prisma.user.updateMany({ where: { id: user.id, schoolId: user.schoolId }, data: { fullName: parsed.data.fullName } });
    if (!updated.count) return NextResponse.json({ error: "Profile not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Unable to update your profile. Please try again." }, { status: 500 }); }
}
