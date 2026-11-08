import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
const schema = z.object({ fullName: z.string().trim().min(2).max(120) });
export async function PATCH(request: Request) {
  const user = await getSession(); if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Check your name and email." }, { status: 400 });
  try {
    await prisma.user.update({ where: { id: user.id }, data: { fullName: parsed.data.fullName } });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "That email address is already in use." }, { status: 409 }); }
}
