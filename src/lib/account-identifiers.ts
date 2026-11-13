/**
 * Account identifiers are tenant-scoped. A student number can exist at
 * multiple schools, and faculty IDs belong only to teacher accounts.
 */
export function normalizeStudentLoginId(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeFacultyId(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  // School-issued faculty IDs may contain hyphens, periods, underscores or slashes.
  if (!/^[A-Z0-9][A-Z0-9._/-]{2,39}$/.test(normalized)) return null;
  return normalized;
}

export function resolveLoginIdentifier(
  type: "EMAIL" | "STUDENT_ID",
  identifier: string
): { type: "EMAIL" | "STUDENT_ID"; value: string } | null {
  const value = identifier.trim();
  if (type === "STUDENT_ID") {
    if (value.length < 1 || value.length > 40) return null;
    return { type, value: normalizeStudentLoginId(value) };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 200) return null;
  return { type, value: value.toLowerCase() };
}
