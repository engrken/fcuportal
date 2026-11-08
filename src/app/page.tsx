import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LandingPage from "@/components/LandingPage";
export default async function Home() {
  const user = await getSession();
  if (user) redirect("/dashboard");
  return <LandingPage />;
}
