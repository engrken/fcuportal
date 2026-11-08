import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SAGA Portal | School Assessment, Grading & Analytics",
  description: "A practical grade portal for teachers to manage class records, assessment, attendance, and student grade access."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
