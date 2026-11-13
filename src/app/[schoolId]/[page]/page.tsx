import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Portal from "@/components/Portal";
import { classWorkspaceHref, parseClassWorkspaceQuery } from "@/lib/class-navigation";

type PageName = "overview" | "classes" | "profile" | "simulator";
type RouteProps = { params: Promise<{ schoolId: string; page: string }>; searchParams: Promise<{ class?: string | string[]; section?: string | string[]; student?: string | string[]; attendanceToday?: string | string[] }> };

export default async function SchoolPage({ params, searchParams }: RouteProps) {
  const { schoolId, page } = await params;
  const school = await prisma.school.findFirst({ where: { OR: [{ slug: schoolId }, { slugAliases: { has: schoolId } }] }, select: { id: true, slug: true } });
  if (!school) notFound();
  const user = await getSession();
  if (!user) redirect(`/login?schoolId=${encodeURIComponent(school.id)}`);
  if (user.schoolId !== school.id) redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  if (schoolId !== user.school.slug) redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  if (page !== "overview" && page !== "classes" && page !== "profile" && page !== "simulator") notFound();
  if (page === "classes" && user.role !== "TEACHER") redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  if (page === "simulator" && user.role !== "STUDENT") redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  const classWorkspace = page === "classes" ? parseClassWorkspaceQuery(await searchParams) : null;
  // Old URLs with ?class=<id> remain valid and redirect to the readable
  // /school/classes/course-code path, after checking teacher ownership.
  if (classWorkspace?.classId) {
    const catalog = await prisma.subject.findMany({
      where: { teacherId: user.id, schoolId: school.id },
      select: { id: true, code: true, academicYear: true, term: true }
    });
    if (catalog.some(item => item.id === classWorkspace.classId)) {
      redirect(classWorkspaceHref(user.school.slug, classWorkspace.classId, classWorkspace.section, {
        student: classWorkspace.student, attendanceToday: classWorkspace.attendanceToday
      }, catalog));
    }
  }
  return <Portal user={user} initialPage={page as PageName} initialClassId={classWorkspace?.classId || ""} initialClassSection={classWorkspace?.section || "setup"} initialClassStudent={classWorkspace?.student || ""} initialAttendanceToday={classWorkspace?.attendanceToday || false} />;
}
