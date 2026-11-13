"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SchoolSelect from "@/components/SchoolSelect";

type LoginType = "EMAIL" | "STUDENT_ID";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginType, setLoginType] = useState<LoginType>("EMAIL");
  const [email, setEmail] = useState("");
  const [studentId, setStudentId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [emailChanged, setEmailChanged] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setEmail(params.get("email") || "");
    setStudentId(params.get("studentNumber") || "");
    setSchoolId(params.get("schoolId") || "");
    setLoginType(params.get("studentNumber") ? "STUDENT_ID" : "EMAIL");
    setEmailChanged(params.get("emailChanged") === "1");
  }, []);

  function changeIdentity(next: LoginType) {
    if (loginType === next) return;
    setLoginType(next);
    setChallengeId("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schoolId,
          loginType,
          identifier: loginType === "STUDENT_ID" ? studentId : email,
          password: form.get("password"),
          challengeId: challengeId || undefined,
          code: challengeId ? form.get("code") : undefined
        })
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Unable to sign in."); return; }
      if (response.status === 202) { setChallengeId(data.challengeId); return; }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("Unable to reach SAGA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const validIdentity = loginType === "STUDENT_ID" ? studentId.trim().length > 0 : email.trim().length > 3;

  return <main className="auth-shell">
    <section className="auth-art">
      <div className="brand-mark">S</div><p className="eyebrow">SAGA · SCHOOL GRADE PORTAL</p>
      <h1>Your progress,<br/>in one place.</h1>
      <p className="auth-caption">A secure space to follow your classes and academic progress.</p>
      <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div>
      <div className="auth-art-footer">Independent school service</div>
    </section>
    <section className="auth-panel">
      <div className="auth-form-wrap">
        <div className="mobile-brand"><span className="brand-mark small">S</span><span>SAGA Portal</span></div>
        <p className="eyebrow text-primary">WELCOME BACK</p>
        <h2>Sign in to your account</h2>
        <p className="muted mb-4">Teachers and students can sign in with email. Students may also use their registered Student ID.</p>
        <form onSubmit={submit}>
          {emailChanged && <div className="alert alert-success" role="status">Your email was updated. Sign in with your new email address.</div>}
          <label className="form-label" htmlFor="schoolId">School</label>
          <SchoolSelect id="schoolId" value={schoolId} onChange={next => { setSchoolId(next); setChallengeId(""); setError(""); }}/>
          <div className="form-label">Sign in using</div>
          <div className="role-switch mb-3" role="group" aria-label="Choose sign-in method">
            <button type="button" className={loginType === "EMAIL" ? "active" : ""} aria-pressed={loginType === "EMAIL"} onClick={() => changeIdentity("EMAIL")}>Email</button>
            <button type="button" className={loginType === "STUDENT_ID" ? "active" : ""} aria-pressed={loginType === "STUDENT_ID"} onClick={() => changeIdentity("STUDENT_ID")}>Student ID</button>
          </div>
          {loginType === "EMAIL" ? <>
            <label className="form-label" htmlFor="email">Email address</label>
            <input className="form-control form-control-lg mb-3" id="email" name="identifier" type="email"
              autoComplete="username" placeholder="name@example.com" value={email} required maxLength={200}
              onChange={event => { setEmail(event.target.value); setChallengeId(""); setError(""); }}/>
          </> : <>
            <label className="form-label" htmlFor="studentLoginId">Student ID</label>
            <input className="form-control form-control-lg mb-2" id="studentLoginId" name="identifier" type="text"
              autoComplete="username" placeholder="Enter your registered Student ID" value={studentId}
              onChange={event => { setStudentId(event.target.value); setChallengeId(""); setError(""); }}
              required maxLength={40}/>
            <p className="form-text mb-3">Only registered student accounts can use Student ID. Choose your school above.</p>
          </>}
          <label className="form-label" htmlFor="password">Password</label>
          <input className="form-control form-control-lg" id="password" name="password" type="password"
            autoComplete="current-password" placeholder="Enter your password" required/>
          <div className="text-end mt-2">
            <Link href={`/forgot-password?schoolId=${encodeURIComponent(schoolId)}${loginType === "EMAIL" && email ? `&email=${encodeURIComponent(email)}` : ""}`} className="small">Forgot password?</Link>
          </div>
          {challengeId && <div className="mt-3">
            <label className="form-label" htmlFor="verificationCode">Email verification code</label>
            <input className="form-control" id="verificationCode" name="code" inputMode="numeric"
              autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/>
            <p className="form-text">Enter the six-digit code sent to the email linked to your account. It expires in 10 minutes.</p>
            <button type="button" className="btn btn-link px-0" onClick={() => { setChallengeId(""); setError(""); }}>Request another code</button>
          </div>}
          {error && <div className="alert alert-danger mt-3 py-2" role="alert">{error}</div>}
          <button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy || !schoolId || !validIdentity}>
            {busy ? "Signing in…" : challengeId ? "Verify and sign in" : "Sign in"}
          </button>
        </form>
        <p className="auth-bottom">New to the portal? <Link href={`/register?schoolId=${encodeURIComponent(schoolId)}`}>Create an account</Link></p>
        <p className="auth-bottom mt-2">Just checking a grade? <Link href={`/quick-check?schoolId=${encodeURIComponent(schoolId)}`}>Use Quick Check</Link></p>
        <p className="privacy-note">Your academic record is visible only to you and authorized course teachers.</p>
      </div>
    </section>
  </main>;
}
