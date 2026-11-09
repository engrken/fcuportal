import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Portal from "@/components/Portal";

type PageName = "overview" | "classes" | "profile";
type RouteProps = { params: Promise<{ schoolId: string; page: string }> };

export default async function SchoolPage({ params }: RouteProps) {
  const { schoolId, page } = await params;
  const school = await prisma.school.findFirst({ where: { OR: [{ slug: schoolId }, { slugAliases: { has: schoolId } }] }, select: { id: true, slug: true } });
  if (!school) notFound();
  const user = await getSession();
  if (!user) redirect(`/login?schoolId=${encodeURIComponent(school.id)}`);
  if (user.schoolId !== school.id) redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  if (schoolId !== user.school.slug) redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  if (page !== "overview" && page !== "classes" && page !== "profile") notFound();
  if (page === "classes" && user.role !== "TEACHER") redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  return <Portal user={user} initialPage={page as PageName} />;
}
