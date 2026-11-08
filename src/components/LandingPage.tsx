"use client";
import Link from "next/link";
import { useState } from "react";
import SchoolSelect from "@/components/SchoolSelect";

type SchoolOption = { id: string; name: string };
export default function LandingPage() {
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  async function chooseSchool(id: string) {
    setSchoolId(id);
    const response = await fetch("/api/schools");
    const data = await response.json();
    setSchoolName(((data.schools || []) as SchoolOption[]).find(school => school.id === id)?.name || "");
  }
  return <main className="landing-page">
    <header className="landing-header"><a className="sidebar-brand" href="/"><span className="brand-mark small">G</span><span><strong>GRADE</strong><small>PORTAL</small></span></a><Link href="/quick-check">Quick grade check</Link></header>
    <section className="landing-hero"><span className="eyebrow">SCHOOL GRADE PORTAL</span><h1>Class records,<br/>made clear.</h1><p>A private workspace for teachers to manage class lists, attendance, assessments, and grades, with student access to published results.</p><div className="landing-school"><label className="form-label" htmlFor="landing-school">Choose your school</label><SchoolSelect id="landing-school" value={schoolId} onChange={chooseSchool}/><div className="landing-actions"><Link className="btn btn-primary" href={schoolId ? `/login?schoolId=${encodeURIComponent(schoolId)}` : "/login"}>Sign in</Link><Link className="btn btn-outline-primary" href={schoolId ? `/register?schoolId=${encodeURIComponent(schoolId)}` : "/register"}>Create account</Link></div></div><div className="landing-note">Choose a school to keep its accounts, class records, and student directory in a separate workspace.</div></section>
    <footer className="landing-footer"><span>{schoolName || "Independent school grade portal"}</span><Link href={schoolId ? `/privacy?schoolId=${encodeURIComponent(schoolId)}` : "/privacy"}>Privacy notice</Link><span>School workspaces are access-controlled</span></footer>
  </main>;
}
