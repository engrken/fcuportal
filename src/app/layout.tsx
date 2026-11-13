import "bootstrap/dist/css/bootstrap.min.css";
import "./globals.css";
import type { Metadata } from "next";
import SiteFooter from "@/components/SiteFooter";
import ThemeSync from "@/components/ThemeSync";

export const metadata: Metadata = {
  title: "SAGA Portal | School Assessment, Grading & Analytics",
  description: "A practical grade portal for teachers to manage class records, assessment, attendance, and student grade access.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="saga-app-body"><ThemeSync /><div className="saga-app-content">{children}</div><SiteFooter /></body></html>;
}
