import type { Metadata } from "next";
import DemoWorkspace from "@/components/DemoWorkspace";

export const metadata: Metadata = {
  title: "Test the Software | SAGA Portal",
  description: "Explore interactive teacher, student, and administrator previews using fictional data. No registration needed.",
  robots: { index: true, follow: true }
};

export default function DemoPage() {
  return <DemoWorkspace />;
}
