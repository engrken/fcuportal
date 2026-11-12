"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ChangeEmailForm({ schoolId, emailDeliveryEnabled }: { schoolId: string; emailDeliveryEnabled?: boolean }) {
  const router = useRouter();
  const [challengeId, setChallengeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");

  async function checkEmailConnection() {
    setBusy(true);
    setConnectionStatus("");
    try {
      const response = await fetch("/api/profile/email-status", { method: "POST" });
      const data = await response.json();
      setConnectionStatus(response.ok ? data.message : data.error || "Unable to check email delivery.");
    } catch {
      setConnectionStatus("Unable to check email delivery. Try again later.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const details = { currentPassword: form.get("currentPassword"), newEmail: form.get("newEmail") };
    const payload = challengeId
      ? { ...details, action: "confirm", challengeId, currentCode: form.get("currentCode"), newCode: form.get("newCode") }
      : { ...details, action: "send" };

    setBusy(true);
    setError("");
    setConnectionStatus("");
    try {
      const response = await fetch("/api/profile/email-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Unable to change your sign-in email.");
        return;
      }
      if (response.status === 202) {
        setChallengeId(data.challengeId);
        return;
      }
      router.replace(`/login?schoolId=${encodeURIComponent(schoolId)}&emailChanged=1`);
      router.refresh();
    } catch {
      setError("Unable to reach SAGA. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-security-section">
      <h3>Change sign-in email</h3>
      <p className="muted">Enter your current password and verify a code from each email address. After confirmation, sign in with your new email and current password.</p>
      <button type="button" className="btn btn-sm btn-outline-secondary mb-3" disabled={busy} onClick={checkEmailConnection}>Check email connection</button>
      {connectionStatus && <p className="small" role="status">{connectionStatus}</p>}
      {emailDeliveryEnabled ? (
        <form className="profile-form" onSubmit={submit}>
          <fieldset disabled={busy}>
            <label className="form-label" htmlFor="change-email-address">New email address</label>
            <input className="form-control" id="change-email-address" name="newEmail" type="email" autoComplete="email" required maxLength={200} readOnly={Boolean(challengeId)} />

            <label className="form-label mt-3" htmlFor="change-email-password">Current password</label>
            <input className="form-control" id="change-email-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={100} readOnly={Boolean(challengeId)} />

            {challengeId && (
              <>
                <p className="form-text mt-3" role="status">Codes were sent to both addresses. They expire in 10 minutes.</p>
                <label className="form-label" htmlFor="change-email-current-code">Code from your current email</label>
                <input className="form-control" id="change-email-current-code" name="currentCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />

                <label className="form-label mt-3" htmlFor="change-email-new-code">Code from your new email</label>
                <input className="form-control" id="change-email-new-code" name="newCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required />
              </>
            )}

            {error && <div className="alert alert-danger mt-3 mb-0" role="alert">{error}</div>}
            <button type="submit" className="btn btn-outline-primary mt-3">
              {busy ? "Please wait…" : challengeId ? "Verify codes and change email" : "Send verification codes"}
            </button>
            {challengeId && <button type="button" className="btn btn-link mt-3" onClick={() => { setChallengeId(""); setError(""); }}>Start over</button>}
          </fieldset>
        </form>
      ) : (
        <div className="alert alert-warning small">Email delivery is temporarily unavailable. Contact your portal administrator for help changing your email.</div>
      )}
    </div>
  );
}
