"use client";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    if (password !== confirm) { setError("The passwords do not match."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to reset password.");
      setDone(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to reset password."); }
    finally { setBusy(false); }
  }
  return <main className="auth-shell"><section className="auth-art"><div className="brand-mark">S</div><p className="eyebrow">ACCOUNT RESTORATION</p><h1>Secure your<br/>account.</h1><p className="auth-caption">Choose a new password to regain access to your portal.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">Independent school service</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">S</span><span>SAGA Portal</span></div><p className="eyebrow text-primary">NEW PASSWORD</p><h2>{done ? "Password updated" : "Choose a new password"}</h2>{done ? <><p className="muted">Your password has been changed. You can now sign in with the new password.</p><Link className="btn btn-primary btn-lg w-100 mt-3" href="/login">Go to sign in</Link></> : !token ? <><div className="alert alert-warning">This reset link is missing or invalid. Request a new one to continue.</div><Link href="/forgot-password">Request a new reset link</Link></> : <><p className="muted mb-4">Use at least 12 characters. This link expires after 30 minutes and can only be used once.</p><form onSubmit={submit}><label className="form-label" htmlFor="password">New password</label><input className="form-control form-control-lg mb-3" id="password" type="password" autoComplete="new-password" placeholder="At least 12 characters" minLength={12} maxLength={100} value={password} onChange={e=>setPassword(e.target.value)} required/><label className="form-label" htmlFor="confirmPassword">Confirm new password</label><input className="form-control form-control-lg" id="confirmPassword" type="password" autoComplete="new-password" placeholder="Re-enter your new password" minLength={12} maxLength={100} value={confirm} onChange={e=>setConfirm(e.target.value)} required/>{error && <div className="alert alert-danger mt-3 py-2">{error}</div>}<button className="btn btn-primary btn-lg w-100 mt-4" disabled={busy}>{busy ? "Updating…" : "Reset password"}</button></form></>}<p className="auth-bottom"><Link href="/login">Back to sign in</Link></p></div></section></main>;
}
