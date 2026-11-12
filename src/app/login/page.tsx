"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import SchoolSelect from "@/components/SchoolSelect";

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [challengeId, setChallengeId] = useState(""); const [busy, setBusy] = useState(false); const [email, setEmail] = useState(""); const [schoolId, setSchoolId] = useState("");
  const [emailChanged, setEmailChanged] = useState(false);
  useEffect(() => { const params = new URLSearchParams(window.location.search); setEmail(params.get("email") || ""); setSchoolId(params.get("schoolId") || ""); setEmailChanged(params.get("emailChanged") === "1"); }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schoolId, email: form.get("email"), password: form.get("password"), challengeId: challengeId || undefined, code: challengeId ? form.get("code") : undefined }) });
      const data = await res.json();
      if (!res.ok) return setError(data.error || "Unable to sign in.");
      if (res.status === 202) { setChallengeId(data.challengeId); return; }
      router.replace("/dashboard"); router.refresh();
    } catch {
      setError("Unable to reach SAGA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth-shell"><section className="auth-art"><div className="brand-mark">G</div><p className="eyebrow">SCHOOL GRADE PORTAL</p><h1>Your progress,<br/>in one place.</h1><p className="auth-caption">A secure space to follow your classes and academic progress.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">Independent school service</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">G</span><span>Student Grade Portal</span></div><p className="eyebrow text-primary">WELCOME BACK</p><h2>Sign in to your account</h2><p className="muted mb-4">Use the email address associated with your portal account.</p><form onSubmit={submit}>{emailChanged && <div className="alert alert-success" role="status">Your email was updated. Sign in with your new email address.</div>}<label className="form-label" htmlFor="schoolId">School</label><SchoolSelect id="schoolId" value={schoolId} onChange={setSchoolId}/><label className="form-label" htmlFor="email">Email address</label><input className="form-control form-control-lg mb-3" id="email" name="email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/><label className="form-label" htmlFor="password">Password</label><input className="form-control form-control-lg" id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" required/><div className="text-end mt-2"><Link href={`/forgot-password?schoolId=${encodeURIComponent(schoolId)}${email ? `&email=${encodeURIComponent(email)}` : ""}`} className="small">Forgot password?</Link></div>{challengeId && <div className="mt-3"><label className="form-label" htmlFor="verificationCode">Email verification code</label><input className="form-control" id="verificationCode" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required/><p className="form-text">Enter the six-digit code sent to your email. It expires in 10 minutes.</p><button type="button" className="btn btn-link px-0" onClick={() => { setChallengeId(""); setError(""); }}>Request another code</button></div>}{error && <div className="alert alert-danger mt-3 py-2">{error}</div>}<button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy || !schoolId}>{busy ? "Signing in…" : challengeId ? "Verify and sign in" : "Sign in"}</button></form><p className="auth-bottom">New to the portal? <Link href={`/register?schoolId=${encodeURIComponent(schoolId)}`}>Create an account</Link></p><p className="auth-bottom mt-2">Just checking a grade? <Link href={`/quick-check?schoolId=${encodeURIComponent(schoolId)}`}>Use Quick Check</Link></p><p className="privacy-note">Your academic record is visible only to you and authorized course teachers.</p></div></section></main>;
}
