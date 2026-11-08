import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Portal from "@/components/Portal";
export default async function DashboardPage() {
  const user = await getSession(); if (!user) redirect("/login");
  return <Portal user={user} />;
}
