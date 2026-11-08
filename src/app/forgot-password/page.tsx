"use client";
import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to request a reset link.");
      setMessage(data.message || "If an account exists for that email, a password reset link has been sent.");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to request a reset link."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-art"><div className="brand-mark">F</div><p className="eyebrow">ACCOUNT RESTORATION</p><h1>Get back<br/>to your portal.</h1><p className="auth-caption">We’ll send a time-limited password reset link to your registered email.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">NOT AN OFFICIAL FCU SERVICE</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">F</span><span>Faculty Grade Portal</span></div><p className="eyebrow text-primary">FORGOT PASSWORD</p><h2>Restore your account</h2><p className="muted mb-4">Enter the email address linked to your portal account. If it matches, we’ll email a reset link that expires in 30 minutes.</p><form onSubmit={submit}><label className="form-label" htmlFor="email">Email address</label><input className="form-control form-control-lg" id="email" type="email" autoComplete="email" placeholder="name@example.com" value={email} onChange={e=>setEmail(e.target.value)} maxLength={200} required/>{error && <div className="alert alert-danger mt-3 py-2">{error}</div>}{message && <div className="alert alert-success mt-3 py-2">{message}</div>}<button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button></form><p className="auth-bottom"><Link href="/login">Back to sign in</Link></p><p className="privacy-note">If the email does not arrive, check your spam folder or contact the portal administrator.</p></div></section></main>;
}
