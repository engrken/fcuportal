/** Shared, dependency-free tenant helpers for administration and exports. */
export type TenantHealthSource = {
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionExpiresAt: string | null;
  teacherCount: number;
  verifiedTeacherCount: number;
  classCount: number;
};

export function todayManila(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find(value => value.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Calendar days from a PH-local date, avoiding daylight/UTC conversion drift. */
export function daysUntil(date: string | null, today = todayManila()): number | null {
  if (!date) return null;
  const expiry = Date.parse(date.slice(0, 10) + "T00:00:00Z");
  const localToday = Date.parse(today + "T00:00:00Z");
  return Number.isFinite(expiry) && Number.isFinite(localToday)
    ? Math.round((expiry - localToday) / 86400000)
    : null;
}

export function tenantHealth(tenant: TenantHealthSource, today = todayManila()) {
  if (!tenant.isActive || tenant.subscriptionStatus !== "ACTIVE") {
    return {
      level: "danger" as const,
      label: tenant.subscriptionStatus === "PAST_DUE" ? "Past due · Inactive"
        : tenant.subscriptionStatus === "ACTIVE" ? "Inactive"
        : tenant.subscriptionStatus === "SUSPENDED" ? "Suspended" : "Cancelled"
    };
  }
  const remaining = daysUntil(tenant.subscriptionExpiresAt, today);
  if (remaining !== null && remaining < 0) return { level: "danger" as const, label: "Expiry date passed" };
  if (remaining !== null && remaining <= 30) return {
    level: "warning" as const,
    label: remaining === 0 ? "Expires today" : `Expires in ${remaining}d`
  };
  if (tenant.teacherCount === 0) return { level: "warning" as const, label: "Needs first teacher" };
  if (tenant.verifiedTeacherCount === 0) return { level: "warning" as const, label: "Verify teacher accounts" };
  if (tenant.classCount === 0) return { level: "warning" as const, label: "No classes created" };
  return { level: "good" as const, label: "Operational" };
}

/** Escape spreadsheets safely, including cells entered by administrators. */
export function csvCell(value: string | number | Date | null | undefined): string {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "");
  const safe = /^[\s]*[=+\-@\t\r]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
