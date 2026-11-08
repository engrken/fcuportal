import { redirect } from "next/navigation";
import { getSession, isTenantManagerEmail } from "@/lib/auth";
import TenantManagement from "@/components/TenantManagement";

export default async function TenantManagementPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!isTenantManagerEmail(user.email)) redirect("/dashboard");
  return <TenantManagement managerName={user.fullName} managerEmail={user.email} />;
}
