import { after, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { configuredTenantManagerEmail, requireTenantManager, tenantManagerIdentity } from "@/lib/auth";
import { sendPortalEmail } from "@/lib/mailer";
import { prisma } from "@/lib/prisma";
import { checkAuthThrottle, clearAuthThrottle } from "@/lib/rate-limit";

type Context = { params: Promise<{ schoolId: string; roster: string }> };
type RosterEntry = {
  key: string;
  accountId: string | null;
  studentNumber: string | null;
  fullName: string;
  email: string | null;
  status: "VERIFIED" | "UNVERIFIED" | "NO_ACCOUNT" | "CLASS_ONLY";
  updatedAt: Date | null;
};

const pageSize = 25;
const listSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  query: z.string().trim().max(100).default(""),
  status: z.enum(["ALL", "VERIFIED", "UNVERIFIED", "NO_ACCOUNT", "CLASS_ONLY"]).default("ALL")
});

export async function GET(request: Request, { params }: Context) {
  if (!(await requireTenantManager())) return NextResponse.json({ error: "Tenant manager access is required." }, { status: 403 });
  const { schoolId, roster } = await params;
  if (roster !== "students" && roster !== "teachers") return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  const search = new URL(request.url).searchParams;
  const parsed = listSchema.safeParse(Object.fromEntries(search));
  if (!parsed.success) return NextResponse.json({ error: "Check your roster filters." }, { status: 400 });
  const { page, query, status } = parsed.data;
  if (!(await prisma.school.findUnique({ where: { id: schoolId }, select: { id: true } }))) {
    return NextResponse.json({ error: "School workspace not found." }, { status: 404 });
  }

  if (roster === "teachers") {
    if (status === "NO_ACCOUNT" || status === "CLASS_ONLY") {
      return NextResponse.json({ error: "Check your roster filters." }, { status: 400 });
    }

    const accounts = await prisma.user.findMany({
      where: {
        schoolId, role: "TEACHER",
        ...(status === "VERIFIED" ? { emailVerifiedAt: { not: null } } : status === "UNVERIFIED" ? { emailVerifiedAt: null } : {}),
        ...(query ? { OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { email: { contains: query, mode: "insensitive" } }
        ] } : {})
      },
      select: { id: true, fullName: true, email: true, emailVerifiedAt: true, tenantManagerEmail: true, updatedAt: true },
      orderBy: [{ fullName: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1
    });
    const teachers = await Promise.all(accounts.slice(0, pageSize).map(async account => ({
      key: `account:${account.id}`,
      accountId: account.id,
      studentNumber: null,
      fullName: account.fullName,
      email: account.email,
      status: account.emailVerifiedAt ? "VERIFIED" : "UNVERIFIED",
      updatedAt: account.updatedAt,
      protected: (await tenantManagerIdentity({ ...account, role: "TEACHER" })) !== null
    })));
    return NextResponse.json({ teachers, hasMore: accounts.length > pageSize }, { headers: { "Cache-Control": "no-store" } });
  }

  const rows = await prisma.$queryRaw<RosterEntry[]>`
    WITH accounts AS (
      SELECT "id", "studentNumber", "fullName", "email", "emailVerifiedAt", "updatedAt"
      FROM "User" WHERE "schoolId" = ${schoolId} AND "role" = 'STUDENT'
    ), directory AS (
      SELECT "studentNumber", "fullName", "email", "updatedAt"
      FROM "StudentDirectory" WHERE "schoolId" = ${schoolId}
    ), class_students AS (
      SELECT DISTINCT ON (upper(btrim(e."studentNumber")))
        upper(btrim(e."studentNumber")) AS "studentNumber", e."studentName" AS "fullName"
      FROM "Enrollment" e JOIN "Subject" s ON s."id" = e."subjectId"
      WHERE s."schoolId" = ${schoolId} AND btrim(e."studentNumber") <> ''
      ORDER BY upper(btrim(e."studentNumber")), e."createdAt" DESC, e."id"
    ), roster AS (
      SELECT 'account:' || a."id" AS "key", a."id" AS "accountId", a."studentNumber",
        a."fullName", a."email", a."updatedAt",
        CASE WHEN a."emailVerifiedAt" IS NULL THEN 'UNVERIFIED' ELSE 'VERIFIED' END AS "status"
      FROM accounts a
      UNION ALL
      SELECT 'directory:' || d."studentNumber", NULL, d."studentNumber",
        d."fullName", d."email", d."updatedAt", 'NO_ACCOUNT'
      FROM directory d WHERE NOT EXISTS (SELECT 1 FROM accounts a WHERE a."studentNumber" = d."studentNumber")
      UNION ALL
      SELECT 'class:' || c."studentNumber", NULL, c."studentNumber", c."fullName", NULL, NULL, 'CLASS_ONLY'
      FROM class_students c
      WHERE NOT EXISTS (SELECT 1 FROM directory d WHERE upper(btrim(d."studentNumber")) = c."studentNumber")
        AND NOT EXISTS (SELECT 1 FROM accounts a WHERE upper(btrim(a."studentNumber")) = c."studentNumber")
    )
    SELECT * FROM roster
    WHERE (${status} = 'ALL' OR "status" = ${status})
      AND (${query} = '' OR strpos(lower("fullName"), lower(${query})) > 0
        OR strpos(lower("studentNumber"), lower(${query})) > 0)
    ORDER BY lower("fullName"), "key"
    LIMIT ${pageSize + 1} OFFSET ${(page - 1) * pageSize}
  `;
  return NextResponse.json({ students: rows.slice(0, pageSize), hasMore: rows.length > pageSize }, { headers: { "Cache-Control": "no-store" } });
}

const changeDetails = z.object({
  email: z.string().trim().email().max(200),
  updatedAt: z.iso.datetime(),
  currentPassword: z.string().min(1).max(100)
});
const changeSchema = z.discriminatedUnion("kind", [
  changeDetails.extend({ kind: z.literal("ACCOUNT"), accountId: z.string().min(1).max(100), verified: z.boolean() }),
  changeDetails.extend({ kind: z.literal("DIRECTORY"), studentNumber: z.string().min(1).max(40) })
]);

export async function PATCH(request: Request, { params }: Context) {
  const manager = await requireTenantManager();
  if (!manager) return NextResponse.json({ error: "Tenant manager access is required." }, { status: 403 });
  const parsed = changeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the email address, verification status, and your current password." }, { status: 400 });
  const { schoolId, roster } = await params;
  if (roster !== "students" && roster !== "teachers") return NextResponse.json({ error: "Roster not found." }, { status: 404 });
  const input = parsed.data;
  if (roster === "teachers" && input.kind === "DIRECTORY") {
    return NextResponse.json({ error: "Choose a teacher account to edit." }, { status: 400 });
  }
  const role = roster === "teachers" ? "TEACHER" : "STUDENT";
  const accountType = roster === "teachers" ? "teacher" : "student";
  const email = input.email.toLowerCase();
  const updatedAt = new Date(input.updatedAt);

  const throttle = await checkAuthThrottle(request, `tenant-account-edit:${manager.id}`, 5, undefined, "identity");
  if (!throttle.allowed) return NextResponse.json({ error: "Too many password attempts. Try again in 15 minutes." }, { status: 429 });
  const credentials = await prisma.user.findUnique({
    where: { id: manager.id, email: manager.email, role: "TEACHER" },
    select: { passwordHash: true }
  });
  if (!credentials || !(await bcrypt.compare(input.currentPassword, credentials.passwordHash))) {
    return NextResponse.json({ error: "Your current password is incorrect." }, { status: 401 });
  }
  await clearAuthThrottle(throttle.key);

  try {
    const result = await prisma.$transaction(async tx => {
      if (input.kind === "DIRECTORY") {
        const [entry] = await tx.$queryRaw<{ email: string }[]>`
          SELECT "email" FROM "StudentDirectory"
          WHERE "schoolId" = ${schoolId} AND "studentNumber" = ${input.studentNumber}
            AND "updatedAt" = ${updatedAt} FOR UPDATE
        `;
        if (!entry || await tx.user.findFirst({ where: { schoolId, studentNumber: input.studentNumber }, select: { id: true } })) return null;
        if (entry.email === email) return { changed: false };
        if (await tx.user.findFirst({ where: { schoolId, email: { equals: email, mode: "insensitive" } }, select: { id: true } })) throw new Error("EMAIL_IN_USE");
        await tx.studentDirectory.update({
          where: { schoolId_studentNumber: { schoolId, studentNumber: input.studentNumber } },
          data: { email }
        });
        await tx.auditEvent.create({ data: { actorId: manager.id, action: "updated student directory email", entity: "student-directory", entityId: `${schoolId}/${input.studentNumber}` } });
        return { changed: true };
      }

      const account = await tx.user.findUnique({
        where: { id: input.accountId, schoolId, role, updatedAt },
        select: { id: true, email: true, emailVerifiedAt: true, tenantManagerEmail: true }
      });
      if (!account) return null;
      if (role === "TEACHER") {
        if (await tenantManagerIdentity({ ...account, role })) throw new Error("TENANT_MANAGER_PROTECTED");
        if (email === configuredTenantManagerEmail() && email !== account.email) throw new Error("TENANT_MANAGER_EMAIL_RESERVED");
      }
      const emailChanged = account.email !== email;
      const verificationChanged = (account.emailVerifiedAt !== null) !== input.verified;
      if (!emailChanged && !verificationChanged) return { changed: false };
      if (emailChanged && await tx.user.findFirst({
        where: { schoolId, id: { not: account.id }, email: { equals: email, mode: "insensitive" } },
        select: { id: true }
      })) throw new Error("EMAIL_IN_USE");

      const now = new Date();
      const updated = await tx.user.updateMany({
        where: { id: account.id, schoolId, role, updatedAt },
        data: { email, emailVerifiedAt: input.verified ? now : null, emailIdentityChangedAt: now }
      });
      if (updated.count !== 1) return null;
      await tx.passwordResetToken.deleteMany({ where: { userId: account.id } });
      await tx.emailChangeToken.deleteMany({ where: { userId: account.id } });
      const action = emailChanged
        ? `changed ${accountType} sign-in email and set verification to ${input.verified ? "verified" : "unverified"}`
        : `marked ${accountType} email ${input.verified ? "verified" : "unverified"}`;
      await tx.auditEvent.create({ data: { actorId: manager.id, action, entity: "user", entityId: account.id } });
      return { changed: true, previousEmail: emailChanged ? account.email : undefined };
    });

    if (!result) return NextResponse.json({ error: `The ${accountType} record changed or is unavailable. Refresh the roster and try again.` }, { status: 409 });
    if (result.previousEmail) {
      const previousEmail = result.previousEmail;
      after(async () => {
        await sendPortalEmail({
          to: previousEmail,
          subject: "A SAGA administrator changed your sign-in email",
          text: `A SAGA administrator updated the sign-in email on your ${accountType} account. Contact your portal administrator if you did not expect this change.`
        }).catch(() => console.error("SECURITY_EVENT SAGA_ROSTER_EMAIL_NOTICE_FAILED"));
      });
    }
    return NextResponse.json({ ok: true, changed: result.changed });
  } catch (error) {
    if (error instanceof Error && error.message === "TENANT_MANAGER_PROTECTED") {
      return NextResponse.json({ error: "Tenant-manager email changes must be verified through the account’s Profile." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TENANT_MANAGER_EMAIL_RESERVED") {
      return NextResponse.json({ error: "This address is reserved for tenant management." }, { status: 409 });
    }
    if ((error instanceof Error && error.message === "EMAIL_IN_USE") || (error && typeof error === "object" && "code" in error && error.code === "P2002")) {
      return NextResponse.json({ error: "That email is already in use in this school." }, { status: 409 });
    }
    throw error;
  }
}
