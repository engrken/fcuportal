/** Permanent, human-readable SAGA class links scoped to the logged-in teacher. */
export const CLASS_SECTIONS = ["setup", "roster", "items", "record", "attendance", "analytics", "final"] as const;
export type ClassSection = (typeof CLASS_SECTIONS)[number];

export function isClassSection(value: unknown): value is ClassSection {
  return typeof value === "string" && (CLASS_SECTIONS as readonly string[]).includes(value);
}

export type ClassListItem = {
  id: string;
  code: string;
  academicYear: string;
  term: string;
};

export function courseCodeSlug(code: string) {
  return code.normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "class";
}

/**
 * A plain course code is used when unique in this teacher's courses.
 * Repeated course codes are disambiguated using their stable database ID,
 * because a teacher may teach the same code in multiple terms or sections.
 */
export function classRouteKey(item: Pick<ClassListItem, "id" | "code">, catalog: Pick<ClassListItem, "id" | "code">[]) {
  const code = courseCodeSlug(item.code);
  const isDuplicate = catalog.some(other => other.id !== item.id && courseCodeSlug(other.code) === code);
  return isDuplicate ? `${code}--${item.id}` : code;
}

export function resolveClassRoute(slug: string, catalog: ClassListItem[]) {
  const direct = catalog.find(item => classRouteKey(item, catalog) === slug);
  if (direct) return direct;
  // An edited code can still be recovered by its stable ID suffix.
  const suffixIndex = slug.lastIndexOf("--");
  if (suffixIndex >= 0) return catalog.find(item => item.id === slug.slice(suffixIndex + 2)) ?? null;
  return null;
}

export function classWorkspaceHref(
  schoolSlug: string,
  selectedId?: string | null,
  section: ClassSection = "setup",
  options?: { student?: string; attendanceToday?: boolean },
  catalog: ClassListItem[] = []
) {
  const base = `/${encodeURIComponent(schoolSlug)}/classes`;
  const subject = selectedId ? catalog.find(item => item.id === selectedId) : null;
  const path = subject ? `${base}/${encodeURIComponent(classRouteKey(subject, catalog))}` : base;
  const params = new URLSearchParams();
  // When classes have not loaded yet, preserve selection using the legacy query
  // instead of losing the requested class during a route transition.
  if (selectedId && !subject) params.set("class", selectedId);
  if (selectedId && section !== "setup") params.set("section", section);
  if (selectedId && options?.student) params.set("student", options.student);
  if (selectedId && options?.attendanceToday) params.set("attendanceToday", "1");
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

/** Keep the active class if still visible; otherwise automatically open the first matching class. */
export function resolveClassSelection(
  classes: ClassListItem[],
  selectedId: string,
  year: string,
  term: string
) {
  const filtered = classes.filter(item =>
    (year === "All School Years" || item.academicYear === year) &&
    (term === "All Terms" || item.term === term)
  );
  return filtered.some(item => item.id === selectedId) ? selectedId : filtered[0]?.id ?? "";
}

export function parseClassWorkspaceQuery(query: {
  class?: string | string[];
  section?: string | string[];
  student?: string | string[];
  attendanceToday?: string | string[];
}) {
  const one = (value: string | string[] | undefined) => typeof value === "string" ? value : "";
  const classId = one(query.class).slice(0, 160);
  const section = one(query.section);
  return {
    classId,
    section: isClassSection(section) ? section : "setup" as ClassSection,
    student: one(query.student).slice(0, 120),
    attendanceToday: one(query.attendanceToday) === "1"
  };
}
