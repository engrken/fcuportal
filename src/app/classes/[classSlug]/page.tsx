import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { classWorkspaceHref, parseClassWorkspaceQuery, resolveClassRoute } from "@/lib/class-navigation";

type RouteProps = {
  params: Promise<{ classSlug: string }>;
  searchParams: Promise<{ section?: string | string[]; student?: string | string[]; attendanceToday?: string | string[] }>;
};

/** Short link /classes/ece-18 redirects to its tenant-isolated class workspace. */
export default async function ShortClassLink({ params, searchParams }: RouteProps) {
  const { classSlug } = await params;
  const user = await getSession();
  if (!user) redirect("/login");
  if (user.role !== "TEACHER") redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  const classes = await prisma.subject.findMany({
    where: { teacherId: user.id, schoolId: user.schoolId },
    select: { id: true, code: true, academicYear: true, term: true }
  });
  const selected = resolveClassRoute(classSlug, classes);
  if (!selected) notFound();
  const options = parseClassWorkspaceQuery(await searchParams);
  redirect(classWorkspaceHref(user.school.slug, selected.id, options.section, {
    student: options.student, attendanceToday: options.attendanceToday
  }, classes));
}
