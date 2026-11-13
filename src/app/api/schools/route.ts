import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const forTeacherRegistration = new URL(request.url).searchParams.get("audience") === "teacher";
  const schools = await prisma.school.findMany({
    where: forTeacherRegistration
      ? { isActive: true }
      : { isActive: true, users: { some: { role: "TEACHER" } } },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, shortName: true, portalTitle: true, logoText: true, primaryColor: true }
  });
  return NextResponse.json({ schools }, { headers: { "Cache-Control": "no-store" } });
}
