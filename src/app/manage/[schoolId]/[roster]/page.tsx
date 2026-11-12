import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import TenantRoster from "@/components/TenantRoster";

export default async function TenantRosterPage({ params }: { params: Promise<{ schoolId: string; roster: string }> }) {
  const manager = await getSession();
  if (!manager) redirect("/login");
  if (!manager.isTenantManager) redirect("/dashboard");

  const { schoolId, roster } = await params;
  if (roster !== "students" && roster !== "teachers") notFound();
  const schools = await prisma.school.findMany({ select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
  const school = schools.find(entry => entry.id === schoolId);
  if (!school) notFound();

  return <TenantRoster key={`${school.id}/${roster}`} school={school} schools={schools} roster={roster} />;
}
