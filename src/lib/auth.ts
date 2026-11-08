import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const COOKIE = "fcu_portal_session";
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must contain at least 32 characters.");
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; role: string; schoolId: string }) {
  const token = await new SignJWT({ role: user.role, schoolId: user.schoolId }).setProtectedHeader({ alg: "HS256" })
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
    if (!payload.sub) return null;
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, role: true, schoolId: true, fullName: true, email: true, studentNumber: true, courseProgram: true, yearLevel: true, profileImagePath: true, passwordChangedAt: true, school: { select: { id: true, slug: true, name: true, shortName: true, portalTitle: true, logoText: true, logoPath: true, primaryColor: true, privacyController: true, privacyContactEmail: true, privacyPolicyUrl: true, isActive: true, subscriptionStatus: true, subscriptionExpiresAt: true } } } });
    if (user?.passwordChangedAt && (!payload.iat || user.passwordChangedAt.getTime() >= payload.iat * 1000)) return null;
    if (!user || !user.school.isActive || user.school.subscriptionStatus !== "ACTIVE" || (user.school.subscriptionExpiresAt && user.school.subscriptionExpiresAt <= new Date())) return null;
    const { passwordChangedAt: _passwordChangedAt, ...sessionUser } = user;
    return { ...sessionUser, isTenantManager: isTenantManagerEmail(user.email) };
  } catch { return null; }
}

export async function requireRole(role: "TEACHER" | "STUDENT") {
  const user = await getSession();
  if (!user || user.role !== role) return null;
  return user;
}

export function isTenantManagerEmail(email: string | null | undefined) {
  const configured = String(process.env.SAGA_TENANT_MANAGER_EMAIL || process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  return Boolean(configured && email && configured === email.trim().toLowerCase());
}

export async function requireTenantManager() {
  const user = await getSession();
  if (!user || user.role !== "TEACHER" || !isTenantManagerEmail(user.email)) return null;
  return user;
}
