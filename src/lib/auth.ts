import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { emailDeliveryConfigured } from "@/lib/mailer";

const COOKIE = "fcu_portal_session";
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; role: string; schoolId: string; emailIdentityChangedAt?: Date | null }, managerVerified = false) {
  const token = await new SignJWT({
    role: user.role,
    schoolId: user.schoolId,
    emailVerified: true,
    managerVerified,
    emailIdentityChangedAt: user.emailIdentityChangedAt?.getTime() ?? null
  }).setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id).setIssuedAt().setExpirationTime("7d").sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax",
    path: "/", maxAge: 60 * 60 * 24 * 7
  });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
}

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key());
    if (!payload.sub || payload.emailVerified !== true) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, schoolId: true, fullName: true, email: true, studentNumber: true, facultyId: true, courseProgram: true, yearLevel: true, profileImagePath: true, passwordChangedAt: true, emailVerifiedAt: true, emailIdentityChangedAt: true, tenantManagerEmail: true, school: { select: { id: true, slug: true, name: true, shortName: true, portalTitle: true, logoText: true, logoPath: true, primaryColor: true, privacyController: true, privacyContactEmail: true, privacyPolicyUrl: true, isActive: true, subscriptionStatus: true, subscriptionExpiresAt: true } } } });
    if (user?.passwordChangedAt && (!payload.iat || user.passwordChangedAt.getTime() >= payload.iat * 1000)) return null;
    if (!user?.emailVerifiedAt || !user.school.isActive || user.school.subscriptionStatus !== "ACTIVE" || (user.school.subscriptionExpiresAt && user.school.subscriptionExpiresAt <= new Date())) return null;
    if ((payload.emailIdentityChangedAt ?? null) !== (user.emailIdentityChangedAt?.getTime() ?? null)) return null;
    const { passwordChangedAt: _passwordChangedAt, emailIdentityChangedAt: _emailIdentityChangedAt, tenantManagerEmail: _tenantManagerEmail, ...sessionUser } = user;
    const isTenantManager = payload.managerVerified === true && (await tenantManagerIdentity(user)) !== null;
    return {
      ...sessionUser,
      isTenantManager,
      emailDeliveryEnabled: emailDeliveryConfigured()
    };
  } catch { return null; }
}

export async function requireRole(role: "TEACHER" | "STUDENT") {
  const user = await getSession();
  if (!user || user.role !== role) return null;
  return user;
}

export function configuredTenantManagerEmail() {
  return (process.env.SAGA_TENANT_MANAGER_EMAIL || process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
}

export async function tenantManagerIdentity(user: { role: string; email: string; tenantManagerEmail: string | null }) {
  const configured = configuredTenantManagerEmail();
  if (!configured || user.role !== "TEACHER") return null;
  if (user.tenantManagerEmail === configured) return configured;
  if (user.email.trim().toLowerCase() !== configured) return null;

  // Once a manager changes email, the configured identity belongs to that account.
  const linked = await prisma.user.findUnique({ where: { tenantManagerEmail: configured }, select: { id: true } });
  return linked ? null : configured;
}

export async function requireTenantManager() {
  const user = await getSession();
  if (!user || user.role !== "TEACHER" || !user.isTenantManager) return null;
  return user;
}
