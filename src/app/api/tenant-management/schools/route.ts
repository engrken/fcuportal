import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireTenantManager } from "@/lib/auth";

// Keep the dashboard lightweight as schools and class rosters grow. Do not
// download every Subject just to calculate the number of enrollments.
export async function GET() {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is not enabled for this account." }, { status: 403 });

  const [schools, enrollmentCounts, accountCounts, verifiedCounts, classCounts, paymentTotals] = await Promise.all([
    prisma.school.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, name: true, shortName: true, slug: true,
        plan: true, isActive: true, subscriptionStatus: true,
        subscriptionExpiresAt: true, createdAt: true, updatedAt: true,
        _count: { select: { subjects: true, users: true, studentDirectory: true } },
        users: {
          where: { role: "TEACHER" },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, fullName: true, email: true, emailVerifiedAt: true, createdAt: true }
        },
        tenantPayments: { orderBy: { paidAt: "desc" }, take: 5 }
      }
    }),
    prisma.$queryRaw<Array<{ schoolId: string; studentSeats: bigint }>>`
      SELECT s."schoolId" AS "schoolId", COUNT(e."id") AS "studentSeats"
      FROM "Subject" s
      LEFT JOIN "Enrollment" e ON e."subjectId" = s."id"
      GROUP BY s."schoolId"
    `,
    prisma.user.groupBy({ by: ["schoolId", "role"], _count: { _all: true } }),
    prisma.user.groupBy({
      by: ["schoolId", "role"],
      where: { emailVerifiedAt: { not: null } },
      _count: { _all: true }
    }),
    prisma.subject.groupBy({ by: ["schoolId", "isPublished"], _count: { _all: true } }),
    prisma.tenantPayment.groupBy({
      by: ["schoolId"],
      _sum: { amount: true },
      _count: { _all: true }
    })
  ]);

  const seats = new Map(enrollmentCounts.map(entry => [entry.schoolId, Number(entry.studentSeats)]));
  const accounts = new Map(accountCounts.map(entry => [`${entry.schoolId}:${entry.role}`, entry._count._all]));
  const verified = new Map(verifiedCounts.map(entry => [`${entry.schoolId}:${entry.role}`, entry._count._all]));
  const visible = new Map(classCounts.filter(entry => entry.isPublished).map(entry => [entry.schoolId, entry._count._all]));
  const payments = new Map(paymentTotals.map(entry => [entry.schoolId, entry]));

  const data = schools.map(school => {
    const payment = payments.get(school.id);
    return {
      ...school,
      studentSeats: seats.get(school.id) ?? 0,
      classCount: school._count.subjects,
      publishedClasses: visible.get(school.id) ?? 0,
      directoryCount: school._count.studentDirectory,
      teacherCount: accounts.get(`${school.id}:TEACHER`) ?? 0,
      verifiedTeacherCount: verified.get(`${school.id}:TEACHER`) ?? 0,
      studentCount: accounts.get(`${school.id}:STUDENT`) ?? 0,
      verifiedStudentCount: verified.get(`${school.id}:STUDENT`) ?? 0,
      totalPayments: payment?._sum.amount ?? 0,
      paymentCount: payment?._count._all ?? 0,
      _count: undefined
    };
  });
  return NextResponse.json({ schools: data }, { headers: { "Cache-Control": "private, no-store" } });
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
  if (subscriptionExpiresAt && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(subscriptionExpiresAt) || !expiry || Number.isNaN(expiry.getTime()) || expiry.toISOString().slice(0, 10) !== subscriptionExpiresAt)) {
    return NextResponse.json({ error: "Choose a valid subscription expiry date." }, { status: 400 });
  }
  const now = new Date();
  try {
    await prisma.$transaction(async tx => {
    if (payment?.amount && payment.reference) {
      // A submitted bank/reference number should not be recorded twice for
      // the same school after a network retry. Optional reference remains allowed.
      const previous = await tx.tenantPayment.findFirst({
        where: { schoolId, reference: payment.reference },
        select: { id: true }
      });
      if (previous) throw new Error("DUPLICATE_PAYMENT_REFERENCE");
    }
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
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_PAYMENT_REFERENCE") {
      return NextResponse.json({ error: "A payment with this reference is already recorded for this school. Check its payment history before retrying." }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ ok: true });
}
