/** Resolve a teacher's school choice without trusting client-only UI branches. */
export type TeacherSchoolTarget =
  | { kind: "existing"; schoolId: string }
  | { kind: "new"; schoolName: string };

export function normalizeTeacherSchoolName(name: string | null | undefined): string {
  return (name ?? "").trim().replace(/\s+/g, " ");
}

export function resolveTeacherSchoolTarget(
  schoolId: string | null | undefined,
  schoolName: string | null | undefined
): TeacherSchoolTarget | null {
  const existingId = (schoolId ?? "").trim();
  const newName = normalizeTeacherSchoolName(schoolName);
  // Never allow a teacher to join and create a school in the same request.
  if (Boolean(existingId) === Boolean(newName)) return null;
  if (existingId) return { kind: "existing", schoolId: existingId };
  if (newName.length < 2 || newName.length > 160) return null;
  return { kind: "new", schoolName: newName };
}
