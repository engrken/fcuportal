/** Deterministic synthetic identities. These are never real accounts or credentials. */
export const DEMO_SCHOOL_SLUG = "saga-demo";
export const DEMO_SCHOOL_ID = "saga-demo-school-2026";
export const DEMO_USER_IDS = {
  TEACHER: "saga-demo-teacher-2026",
  STUDENT: "saga-demo-student-2026"
} as const;

export type DemoAccountRole = keyof typeof DEMO_USER_IDS;
export function isDemoIdentity(user: { id: string; schoolId: string; role: string }) {
  return user.schoolId === DEMO_SCHOOL_ID &&
    ((user.role === "TEACHER" && user.id === DEMO_USER_IDS.TEACHER) ||
     (user.role === "STUDENT" && user.id === DEMO_USER_IDS.STUDENT));
}
