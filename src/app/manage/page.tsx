import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import TenantManagement from "@/components/TenantManagement";

export default async function ManagePage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!user.isTenantManager) redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
  return <TenantManagement managerName={user.fullName} managerEmail={user.email} managerSchoolSlug={user.school.slug} managerProfileImagePath={user.profileImagePath} />;
}
