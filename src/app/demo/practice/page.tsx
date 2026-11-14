import type { Metadata } from "next";
import DemoWorkspace from "@/components/DemoWorkspace";

export const metadata: Metadata = {
  title: "Practice Simulator | SAGA Portal",
  description: "A separate, fictional scorebook and attendance simulator. This page is not the real portal."
};

export default function DemoPracticePage() {
  return <DemoWorkspace />;
}
