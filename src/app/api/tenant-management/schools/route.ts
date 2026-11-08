import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantManager } from "@/lib/auth";

export async function GET() {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is not enabled for this account." }, { status: 403 });
  const schools = await prisma.school.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      users: { where: { role: "TEACHER" }, select: { id: true, fullName: true, email: true, createdAt: true } },
      subjects: { select: { id: true, _count: { select: { enrollments: true } } } },
      tenantPayments: { orderBy: { paidAt: "desc" }, take: 5 }
    }
  });
  return NextResponse.json({ schools: schools.map(school => ({ ...school, studentSeats: school.subjects.reduce((sum, subject) => sum + subject._count.enrollments, 0), subjects: undefined })) });
}

const updateSchema = z.object({
  schoolId: z.string().min(1),
  plan: z.enum(["FREE", "PREMIUM", "ENTERPRISE"]),
  subscriptionStatus: z.enum(["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]),
  subscriptionExpiresAt: z.string().nullable().optional(),
  payment: z.object({
    amount: z.number().positive().max(10000000).optional(),
    method: z.string().trim().min(2).max(40).optional(),
    reference: z.string().trim().max(120).optional(),
    paidAt: z.string().optional(),
    coverageFrom: z.string().optional(),
    coverageTo: z.string().optional(),
    note: z.string().trim().max(500).optional()
  }).optional()
});

export async function PATCH(request: Request) {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is not enabled for this account." }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Check the selected plan, activation status, expiry date, and payment details." }, { status: 400 });
  const { schoolId, plan, subscriptionStatus, subscriptionExpiresAt, payment } = parsed.data;
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true, name: true, plan: true, isActive: true, subscriptionStatus: true, subscriptionExpiresAt: true } });
  if (!school) return NextResponse.json({ error: "School workspace not found." }, { status: 404 });
  if (school.id === manager.schoolId && subscriptionStatus !== "ACTIVE") return NextResponse.json({ error: "The tenant manager’s own school workspace cannot be suspended from this account." }, { status: 409 });
  if (payment && (!payment.amount || !payment.method)) return NextResponse.json({ error: "A payment record needs an amount and payment method." }, { status: 400 });
  const expiry = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
  if (subscriptionExpiresAt && (!expiry || Number.isNaN(expiry.getTime()))) return NextResponse.json({ error: "Choose a valid subscription expiry date." }, { status: 400 });
  const now = new Date();
  await prisma.$transaction(async tx => {
    await tx.school.update({ where: { id: schoolId }, data: { plan, subscriptionStatus, isActive: subscriptionStatus === "ACTIVE", subscriptionExpiresAt: expiry } });
    if (payment?.amount && payment.method) await tx.tenantPayment.create({ data: {
      schoolId, amount: payment.amount, method: payment.method,
      reference: payment.reference || null, paidAt: payment.paidAt ? new Date(payment.paidAt) : now,
      coverageFrom: payment.coverageFrom ? new Date(payment.coverageFrom) : null,
      coverageTo: payment.coverageTo ? new Date(payment.coverageTo) : null,
      note: payment.note || null, recordedBy: manager.email
    } });
    await tx.auditEvent.create({ data: { actorId: manager.id, action: `updated SAGA tenant: plan ${school.plan} → ${plan}; status ${school.subscriptionStatus} → ${subscriptionStatus}${payment?.amount ? `; payment recorded PHP ${payment.amount}` : ""}`, entity: "school", entityId: schoolId } });
  });
  return NextResponse.json({ ok: true });
}
