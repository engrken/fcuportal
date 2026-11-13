import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ schoolId: string }> };
const listSchema = z.object({ page: z.coerce.number().int().min(1).max(1000).default(1) });
const pageSize = 20;

/**
 * Tenant-scoped operations history. Read only, and retrieved when the manager
 * explicitly opens it; no heavy audit queries during dashboard startup.
 */
export async function GET(request: Request, { params }: Context) {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is required." }, { status: 403 });
  const { schoolId } = await params;
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid activity page." }, { status: 400 });

  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
  if (!school) return NextResponse.json({ error: "School workspace not found." }, { status: 404 });

  const rows = await prisma.auditEvent.findMany({
    where: {
      OR: [
        { actor: { schoolId }, entity: { not: "score" } },
        { entity: "school", entityId: schoolId }
      ]
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (parsed.data.page - 1) * pageSize,
    take: pageSize + 1,
    select: {
      id: true, action: true, entity: true, createdAt: true,
      actor: { select: { fullName: true, role: true } }
    }
  });
  return NextResponse.json({
    events: rows.slice(0, pageSize),
    hasMore: rows.length > pageSize,
    page: parsed.data.page
  }, { headers: { "Cache-Control": "private, no-store" } });
}
