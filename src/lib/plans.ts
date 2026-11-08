import type { SchoolPlan } from "@/generated/prisma/client";

export const SCHOOL_PLAN_LIMITS: Record<SchoolPlan, { teachers: number; classes: number; studentSeats: number }> = {
  FREE: { teachers: 1, classes: 10, studentSeats: 500 },
  PREMIUM: { teachers: 10, classes: 50, studentSeats: 5000 },
  ENTERPRISE: { teachers: 1000, classes: 10000, studentSeats: 100000 }
};

export function planDisplayName(plan: SchoolPlan) {
  return plan === "FREE" ? "Freemium" : plan === "PREMIUM" ? "Premium" : "Pro / Enterprise";
}
