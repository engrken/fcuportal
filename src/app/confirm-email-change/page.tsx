import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function ConfirmEmailChangePage() {
  const user = await getSession();
  redirect(user ? `/${encodeURIComponent(user.school.slug)}/profile` : "/login");
}
