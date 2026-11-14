import type { Metadata } from "next";
import ActualDemoEntry from "@/components/ActualDemoEntry";

export const metadata: Metadata = {
  title: "Test the Software | SAGA Portal",
  description: "Open the actual SAGA Teacher or Student portal with fictional college records in a protected read-only guest session.",
  robots: { index: true, follow: true }
};

export default function DemoPage() {
  return <ActualDemoEntry />;
}
