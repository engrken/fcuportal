"use client";

import { FormEvent, useEffect, useState } from "react";

type StudentClass = { id: string; code: string; title: string; term: string; academicYear: string; isPublished: boolean };

export default function StudentClassEnrollment({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [classes, setClasses] = useState<StudentClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadClasses() {
    const response = await fetch("/api/student/classes", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not load enrolled classes.");
    setClasses(data.classes || []);
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/classes", { cache: "no-store" })
      .then(async response => { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Could not load enrolled classes."); return data; })
      .then(data => { if (!cancelled) setClasses(data.classes || []); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load classes."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/student/classes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not join the class.");
      setCode("");
      setMessage(data.linked ? "Your existing class record has been linked to your account. No scores were changed." : data.created ? "Joined " + data.class.code + " successfully." : "You are already enrolled in this class.");
      await loadClasses();
      onJoined();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not join this class."); }
    finally { setSaving(false); }
  }

  return <section className="surface rounded-3 p-3 p-md-4 mb-4" aria-labelledby="student-join-title">
    <div className="row g-3 align-items-start">
      <div className="col-12 col-lg-5">
        <h2 id="student-join-title" className="h5 mb-1">Join a class</h2>
        <p className="muted small">Enter the invitation code shared by your teacher. You must be registered and verified at the same school.</p>
        <form onSubmit={join} className="d-flex flex-wrap gap-2">
          <input className="form-control flex-grow-1" style={{ maxWidth: 250 }} aria-label="Class invitation code" value={code} onChange={event => setCode(event.target.value.toUpperCase().slice(0, 32))} placeholder="XXXX-XXXX-XXXX" autoComplete="off" required minLength={12} maxLength={32}/>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "Joining…" : "Join class"}</button>
        </form>
        {error && <div className="alert alert-danger py-2 mt-2 mb-0" role="alert">{error}</div>}
        {message && <div className="alert alert-success py-2 mt-2 mb-0" role="status">{message}</div>}
      </div>
      <div className="col-12 col-lg-7">
        <div className="d-flex justify-content-between align-items-center mb-2"><h3 className="h6 mb-0">My enrolled classes</h3><small className="muted">{classes.length} linked</small></div>
        {loading ? <p className="muted small mb-0" role="status">Loading your classes…</p> :
          classes.length ? <div className="d-flex flex-column gap-2">{classes.slice(0, 15).map(item => <div key={item.id} className="border rounded-3 p-2 d-flex justify-content-between gap-2 flex-wrap"><div><strong className="d-block">{item.code} — {item.title}</strong><small className="muted">{item.term} · {item.academicYear}</small></div><small className={item.isPublished ? "text-success" : "text-secondary"}>{item.isPublished ? "Grades shared" : "Awaiting teacher grade visibility"}</small></div>)}{classes.length > 15 && <small className="muted">Showing 15 of {classes.length} classes.</small>}</div> :
            <p className="muted small mb-0">No linked classes yet. Join with a teacher-provided code or ask your teacher to add you directly.</p>}
      </div>
    </div>
  </section>;
}
