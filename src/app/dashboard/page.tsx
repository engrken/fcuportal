import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Portal from "@/components/Portal";
import RegistrarPortal from "@/components/RegistrarPortal";
export default async function DashboardPage() {
  const user = await getSession(); if (!user) redirect("/login");
  if (user.role === "REGISTRAR") return <RegistrarPortal user={user} />;
  return <Portal user={user} />;
}
