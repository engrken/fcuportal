"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SchoolSelect, { NEW_SCHOOL_OPTION } from "@/components/SchoolSelect";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<"STUDENT" | "TEACHER">("STUDENT");
  const [schoolId, setSchoolId] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [teacherSchoolChoice, setTeacherSchoolChoice] = useState("");
  const [studentNumber, setStudentNumber] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStudentNumber(params.get("studentNumber") || "");
    setSchoolId(params.get("schoolId") || "");
    const requestedName = params.get("schoolName") || "";
    const requestedSchoolId = params.get("schoolId") || "";
    setSchoolName(requestedName);
    setTeacherSchoolChoice(requestedName ? NEW_SCHOOL_OPTION : requestedSchoolId);
    setEmail(params.get("email") || "");
  }, []);

  const teacherCreatingSchool = teacherSchoolChoice === NEW_SCHOOL_OPTION;
  function chooseRole(nextRole: "STUDENT" | "TEACHER") {
    if (role === nextRole) return;
    setRole(nextRole);
    setChallengeId("");
    setError("");
  }
  function chooseTeacherSchool(nextChoice: string) {
    setTeacherSchoolChoice(nextChoice);
    setChallengeId("");
    setError("");
  }

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
          schoolId: role === "STUDENT" ? schoolId : role === "TEACHER" && !teacherCreatingSchool ? teacherSchoolChoice : undefined,
          schoolName: role === "TEACHER" && teacherCreatingSchool ? schoolName : undefined,
          fullName: form.get("fullName") || undefined,
          email: form.get("email"),
          password: form.get("password"),
          studentNumber: form.get("studentNumber") || undefined,
          inviteCode: form.get("inviteCode") || undefined,
          role,
          challengeId: challengeId || undefined,
          code: challengeId ? form.get("code") : undefined,
          acknowledgedPrivacyNotice: form.get("privacyNotice") === "on",
          acknowledgedTerms: form.get("termsOfService") === "on",
          termsVersion: "2026-11-12"
        })
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to create account."); return; }
      if (response.status === 202) { setChallengeId(data.challengeId); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach SAGA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && (role === "STUDENT"
    ? !!schoolId
    : teacherCreatingSchool ? schoolName.trim().length >= 2 : !!teacherSchoolChoice);
  const selectedSchoolId = role === "STUDENT" ? schoolId : teacherCreatingSchool ? "" : teacherSchoolChoice;
  const privacyHref = selectedSchoolId ? `/privacy?schoolId=${encodeURIComponent(selectedSchoolId)}` : "/privacy";
  const termsHref = selectedSchoolId ? `/terms?schoolId=${encodeURIComponent(selectedSchoolId)}` : "/terms";

  return <main className="auth-shell">
    <section className="auth-art"><div className="brand-mark">S</div><p className="eyebrow">SAGA · SCHOOL GRADE PORTAL</p><h1>Learn with<br/>confidence.</h1><p className="auth-caption">One workspace for class records, assessments, attendance, and student grade access.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">School workspaces are kept separate</div></section>
    <section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">S</span><span>SAGA Portal</span></div><p className="eyebrow text-primary">GET STARTED</p><h2>Create your account</h2><p className="muted mb-4">Students join registered schools. Teachers can select an existing school or register a new school if it is not listed.</p>
      <form onSubmit={submit}>
        <label className="form-label">I am a</label>
        <div className="role-switch mb-3"><button type="button" className={role === "STUDENT" ? "active" : ""} onClick={() => chooseRole("STUDENT")}>Student</button><button type="button" className={role === "TEACHER" ? "active" : ""} onClick={() => chooseRole("TEACHER")}>Teacher</button></div>
        {role === "STUDENT" ? <><label className="form-label" htmlFor="schoolId">School</label><SchoolSelect id="schoolId" value={schoolId} onChange={value => { setSchoolId(value); setChallengeId(""); setError(""); }}/><div className="form-text mb-3">Only schools with a registered teacher appear here.</div><label className="form-label" htmlFor="studentNumber">Student ID</label><input className="form-control mb-3" id="studentNumber" name="studentNumber" value={studentNumber} onChange={event=>setStudentNumber(event.target.value)} required maxLength={40}/></> : <>
          <label className="form-label" htmlFor="teacherSchoolId">School</label>
          <SchoolSelect id="teacherSchoolId" value={teacherSchoolChoice} onChange={chooseTeacherSchool} audience="teacher" allowNotListed/>
          {teacherCreatingSchool ? <>
            <div className="form-text mb-2">Your school is not in the list. Enter its official name to create a new school workspace.</div>
            <label className="form-label" htmlFor="schoolName">New school name</label>
            <input className="form-control mb-2" id="schoolName" name="schoolName" placeholder="Enter the complete official school name"
              value={schoolName} onChange={event => { setSchoolName(event.target.value); setChallengeId(""); setError(""); }}
              autoComplete="organization" required maxLength={160} minLength={2}/>
            <div className="form-text mb-3">A new school is created only after your email verification succeeds. Use the official name to avoid duplicate schools.</div>
          </> : <div className="form-text mb-3">Select your existing school to join its workspace. Additional teacher accounts depend on the school's plan. If your school is missing, select “Not listed” above.</div>}
          <label className="form-label" htmlFor="fullName">Full name</label><input className="form-control mb-3" id="fullName" name="fullName" required maxLength={120}/><label className="form-label" htmlFor="inviteCode">Teacher invitation code</label><input className="form-control mb-3" id="inviteCode" name="inviteCode" required/></>}
        <label className="form-label" htmlFor="regEmail">Email address</label><input className="form-control mb-3" id="regEmail" name="email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={event=>{setEmail(event.target.value);setChallengeId("");setError("");}} required maxLength={200}/>
        <label className="form-label" htmlFor="regPassword">Password</label><input className="form-control" id="regPassword" name="password" type="password" minLength={12} required autoComplete="new-password"/><div className="form-text mb-3">Use at least 12 characters.</div>
        <div className="form-check mb-2"><input className="form-check-input" type="checkbox" id="termsOfService" name="termsOfService" required/><label className="form-check-label small" htmlFor="termsOfService">I agree to the <Link href={termsHref} target="_blank" rel="noreferrer">Terms of Service</Link>.</label></div>
        <div className="form-check mb-3"><input className="form-check-input" type="checkbox" id="privacyNotice" name="privacyNotice" required/><label className="form-check-label small" htmlFor="privacyNotice">I have read the <Link href={privacyHref} target="_blank" rel="noreferrer">Privacy Notice</Link>.</label></div>
        {challengeId && <div className="mt-3"><label className="form-label" htmlFor="verificationCode">Email verification code</label><input className="form-control" id="verificationCode" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><p className="form-text">Enter the six-digit code sent to your email. It expires in 10 minutes.</p><button type="button" className="btn btn-link px-0" onClick={() => { setChallengeId(""); setError(""); }}>Request another code</button></div>}
        {error && <div className="alert alert-danger py-2">{error}</div>}
        <button className="btn btn-primary w-100 mt-2" disabled={!canSubmit}>{busy ? "Please wait…" : challengeId ? "Verify and create account" : "Send verification code"}</button>
      </form>
      <p className="auth-bottom">Already registered? <Link href={`/login?schoolId=${encodeURIComponent(schoolId)}`}>Sign in</Link></p><p className="privacy-note">Student registration requires an existing class directory entry with a matching Student ID and email address.</p>
    </div></section>
  </main>;
}
