import { NextResponse } from "next/server";
import { requireTenantManager } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Protect spreadsheet users from formula injection in payment references or notes.
function csvCell(value: string | number | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}

export async function GET(request: Request) {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is required." }, { status: 403 });
  const schoolId = new URL(request.url).searchParams.get("schoolId")?.trim() ?? "";
  if (schoolId.length > 160) return NextResponse.json({ error: "Invalid school filter." }, { status: 400 });
  if (schoolId) {
    const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } });
    if (!school) return NextResponse.json({ error: "School workspace not found." }, { status: 404 });
  }

  const rows = await prisma.tenantPayment.findMany({
    where: schoolId ? { schoolId } : undefined,
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    take: 10001,
    select: {
      amount: true, currency: true, method: true, reference: true, paidAt: true,
      coverageFrom: true, coverageTo: true, note: true, recordedBy: true,
      school: { select: { name: true, slug: true } }
    }
  });
  if (rows.length > 10000) {
    return NextResponse.json({
      error: "This report exceeds 10,000 payments. Choose an individual school to export a smaller report."
    }, { status: 413 });
  }
  const header = ["School", "School slug", "Paid date", "Currency", "Amount", "Method", "Reference", "Coverage from", "Coverage through", "Note", "Recorded by"];
  const contents = [
    header.map(csvCell).join(","),
    ...rows.map(row => [
      row.school.name, row.school.slug, row.paidAt, row.currency, row.amount,
      row.method, row.reference, row.coverageFrom, row.coverageTo,
      row.note, row.recordedBy
    ].map(csvCell).join(","))
  ].join("\r\n");
  return new Response("\uFEFF" + contents, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="saga-payments-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
