import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const schools = await prisma.school.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, shortName: true, portalTitle: true, logoText: true, primaryColor: true }
  });
  return NextResponse.json({ schools });
}
