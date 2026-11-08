"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    const data = await res.json(); setBusy(false);
    if (!res.ok) return setError(data.error || "Unable to sign in.");
    router.replace("/dashboard"); router.refresh();
  }
  return <main className="auth-shell"><section className="auth-art"><div className="brand-mark">F</div><p className="eyebrow">FILAMER CHRISTIAN UNIVERSITY</p><h1>Your progress,<br/>in one place.</h1><p className="auth-caption">A secure space to follow your classes and academic progress.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">ROXAS CITY · CAPIZ</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">F</span><span>FCU Student Portal</span></div><p className="eyebrow text-primary">WELCOME BACK</p><h2>Sign in to your account</h2><p className="muted mb-4">Use the email address associated with your portal account.</p><form onSubmit={submit}><label className="form-label" htmlFor="email">Email address</label><input className="form-control form-control-lg mb-3" id="email" name="email" type="email" autoComplete="email" required/><label className="form-label" htmlFor="password">Password</label><input className="form-control form-control-lg" id="password" name="password" type="password" autoComplete="current-password" required/>{error && <div className="alert alert-danger mt-3 py-2">{error}</div>}<button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form><p className="auth-bottom">New to the portal? <Link href="/register">Create an account</Link></p><p className="privacy-note">Your academic record is visible only to you and authorized course teachers.</p></div></section></main>;
}
