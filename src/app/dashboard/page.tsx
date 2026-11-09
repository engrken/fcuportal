import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
export default async function DashboardPage() {
  const user = await getSession(); if (!user) redirect("/login");
  redirect(`/${encodeURIComponent(user.school.slug)}/overview`);
}
