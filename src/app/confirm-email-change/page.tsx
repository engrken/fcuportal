"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function ConfirmEmailChangePage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => setToken(new URLSearchParams(window.location.search).get("token") || ""), []);

  async function confirm() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/confirm-email-change", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to confirm this email.");
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm this email.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-shell"><section className="auth-art"><div className="brand-mark">S</div><p className="eyebrow">ACCOUNT SETTINGS</p><h1>Confirm your<br/>new email.</h1><p className="auth-caption">Verify you can access the email address before it becomes your sign-in email.</p><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="art-spark">✦</div><div className="auth-art-footer">SAGA Student Portal</div></section><section className="auth-panel"><div className="auth-form-wrap"><div className="mobile-brand"><span className="brand-mark small">S</span><span>SAGA Portal</span></div><p className="eyebrow text-primary">EMAIL VERIFICATION</p><h2>{done ? "Email updated" : "Confirm email change"}</h2>{done ? <><p className="muted">Your new email is now the sign-in address for your account. You can continue using your current session.</p><Link className="btn btn-primary btn-lg w-100 mt-3" href="/dashboard">Return to SAGA</Link></> : !token ? <><div className="alert alert-warning">This verification link is missing or invalid. Request a new email change from your profile.</div><Link href="/login">Go to sign in</Link></> : <><p className="muted mb-4">This link expires in 30 minutes and can only be used once. Your current email stays active until you confirm.</p>{error && <div className="alert alert-danger py-2">{error}</div>}<button className="btn btn-primary btn-lg w-100" onClick={confirm} disabled={busy}>{busy ? "Confirming…" : "Confirm new email"}</button></>}<p className="auth-bottom"><Link href="/login">Back to sign in</Link></p></div></section></main>;
}
