"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SchoolSelect from "@/components/SchoolSelect";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStudentNumber(params.get("studentNumber") || "");
    setSchoolId(params.get("schoolId") || "");
    setSchoolName(params.get("schoolName") || "");
    setEmail(params.get("email") || "");
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId: role === "STUDENT" ? schoolId : undefined,
          schoolName: role === "TEACHER" ? schoolName : undefined,
          fullName: form.get("fullName") || undefined,
          email: form.get("email"),
          password: form.get("password"),
          studentNumber: form.get("studentNumber") || undefined,
          inviteCode: form.get("inviteCode") || undefined,
          role,
          acknowledgedPrivacyNotice: form.get("privacyNotice") === "on",
          acknowledgedTerms: form.get("termsOfService") === "on",
          termsVersion: "2026-11-12"
        })
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to create account."); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach SAGA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && (role === "STUDENT" ? !!schoolId : schoolName.trim().length >= 2);
  const privacyHref = role === "STUDENT" && schoolId ? `/privacy?schoolId=${encodeURIComponent(schoolId)}` : "/privacy";
  const termsHref = role === "STUDENT" && schoolId ? `/terms?schoolId=${encodeURIComponent(schoolId)}` : "/terms";

  return <main className="auth-shell">
    <section className="auth-art"><div className="brand-mark">S</div><p className="eyebrow">SAGA · SCHOOL GRADE PORTAL</p><h1>Learn with<br/>confidence.</h1><p className="auth-caption">One workspace for class records, assessments, attendance, and student grade access.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">School workspaces are kept separate</div></section>
    <section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">S</span><span>SAGA Portal</span></div><p className="eyebrow text-primary">GET STARTED</p><h2>Create your account</h2><p className="muted mb-4">Students join a school after a teacher has registered it. Teachers enter their school name to create or join that school workspace.</p>
      <form onSubmit={submit}>
        <label className="form-label">I am a</label>
        <div className="role-switch mb-3"><button type="button" className={role === "STUDENT" ? "active" : ""} onClick={() => setRole("STUDENT")}>Student</button><button type="button" className={role === "TEACHER" ? "active" : ""} onClick={() => setRole("TEACHER")}>Teacher</button></div>
        {role === "STUDENT" ? <><label className="form-label" htmlFor="schoolId">School</label><SchoolSelect id="schoolId" value={schoolId} onChange={setSchoolId}/><div className="form-text mb-3">Only schools with a registered teacher appear here.</div><label className="form-label" htmlFor="studentNumber">Student ID</label><input className="form-control mb-3" id="studentNumber" name="studentNumber" value={studentNumber} onChange={event=>setStudentNumber(event.target.value)} required maxLength={40}/></> : <><label className="form-label" htmlFor="schoolName">School name</label><input className="form-control mb-2" id="schoolName" name="schoolName" placeholder="Enter your school’s name" value={schoolName} onChange={event=>setSchoolName(event.target.value)} required maxLength={160}/><div className="form-text mb-3">The first teacher creates the school workspace. Additional teacher accounts need a paid plan; enter the exact same name to join.</div><label className="form-label" htmlFor="fullName">Full name</label><input className="form-control mb-3" id="fullName" name="fullName" required maxLength={120}/><label className="form-label" htmlFor="inviteCode">Teacher invitation code</label><input className="form-control mb-3" id="inviteCode" name="inviteCode" required/></>}
        <label className="form-label" htmlFor="regEmail">Email address</label><input className="form-control mb-3" id="regEmail" name="email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={event=>setEmail(event.target.value)} required maxLength={200}/>
        <label className="form-label" htmlFor="regPassword">Password</label><input className="form-control" id="regPassword" name="password" type="password" minLength={12} required autoComplete="new-password"/><div className="form-text mb-3">Use at least 12 characters.</div>
        <div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="termsOfService" name="termsOfService" required/><label className="form-check-label small" htmlFor="termsOfService">I agree to the <Link href={termsHref} target="_blank" rel="noreferrer">Terms of Service</Link>.</label></div>
        <div className="form-check mb-3"><input className="form-check-input" type="checkbox" id="privacyNotice" name="privacyNotice" required/><label className="form-check-label small" htmlFor="privacyNotice">I have read the <Link href={privacyHref} target="_blank" rel="noreferrer">Privacy Notice</Link>.</label></div>
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <button className="btn btn-primary w-100 mt-2" disabled={!canSubmit}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p className="auth-bottom">Already registered? <Link href={`/login?schoolId=${encodeURIComponent(schoolId)}`}>Sign in</Link></p><p className="privacy-note">Student registration requires an existing class directory entry with a matching Student ID and email address.</p>
    </div></section>
  </main>;
}
