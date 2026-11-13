import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Portal from "@/components/Portal";
import { classRouteKey, classWorkspaceHref, parseClassWorkspaceQuery, resolveClassRoute } from "@/lib/class-navigation";

type RouteProps = {
  params: Promise<{ schoolId: string; classSlug: string }>;
  searchParams: Promise<{ section?: string | string[]; student?: string | string[]; attendanceToday?: string | string[] }>;
};

/** Deep-link entrypoint: /fcu/classes/ece-18 */
export default async function ClassWorkspacePage({ params, searchParams }: RouteProps) {
  const { schoolId, classSlug } = await params;
  const school = await prisma.school.findFirst({
    where: { OR: [{ slug: schoolId }, { slugAliases: { has: schoolId } }] },
    select: { id: true }
  });
  if (!school) notFound();

  const user = await getSession();
  if (!user) redirect(`/login?schoolId=${encodeURIComponent(school.id)}`);
  if (user.schoolId !== school.id || user.role !== "TEACHER") {
    redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  }

  // This lookup is scoped to the authenticated teacher and tenant; no student
  // or other teacher may discover private grades through class slugs.
  const catalog = await prisma.subject.findMany({
    where: { schoolId: school.id, teacherId: user.id },
    select: { id: true, code: true, academicYear: true, term: true },
    orderBy: [{ academicYear: "desc" }, { code: "asc" }]
  });
  const selected = resolveClassRoute(classSlug, catalog);
  if (!selected) notFound();
  const options = parseClassWorkspaceQuery(await searchParams);
  const canonical = classWorkspaceHref(user.school.slug, selected.id, options.section, {
    student: options.student, attendanceToday: options.attendanceToday
  }, catalog);
  if (schoolId !== user.school.slug || classSlug !== classRouteKey(selected, catalog)) redirect(canonical);

  return <Portal
    user={user}
    initialPage="classes"
    initialClassId={selected.id}
    initialClassSection={options.section}
    initialClassStudent={options.student}
    initialAttendanceToday={options.attendanceToday}
  />;
}
