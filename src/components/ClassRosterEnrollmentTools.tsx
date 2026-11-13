"use client";

import { FormEvent, useEffect, useState } from "react";

type Candidate = { id: string; fullName: string; studentNumber: string | null };
type InviteStatus = { active: boolean; expiresAt: string | null };

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) }, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

export default function ClassRosterEnrollmentTools({
  subjectId, status, onRosterChanged
}: {
  subjectId: string;
  status: "DRAFT" | "SUBMITTED" | "VERIFIED";
  onRosterChanged: () => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [workingInvite, setWorkingInvite] = useState(false);
  const [invite, setInvite] = useState<InviteStatus>({ active: false, expiresAt: null });
  const [newCode, setNewCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const base = "/api/teacher/subjects/" + encodeURIComponent(subjectId);
  const isDraft = status === "DRAFT";

  useEffect(() => {
    const controller = new AbortController();
    setLoadingInvite(true);
    jsonRequest(base + "/invite", { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setInvite({ active: data.active, expiresAt: data.expiresAt }); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Could not load invitation status."); })
      .finally(() => { if (!controller.signal.aborted) setLoadingInvite(false); });
    return () => controller.abort();
  }, [base]);

  useEffect(() => {
    if (query.trim().length < 2 || !isDraft) { setResults([]); setSearching(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearching(true);
      jsonRequest(base + "/roster-candidates?q=" + encodeURIComponent(query.trim()), { signal: controller.signal })
        .then(data => { if (!controller.signal.aborted) setResults(data.students || []); })
        .catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Student search failed."); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [base, query, isDraft]);

  async function addStudent(student: Candidate) {
    setAdding(student.id); setError(""); setSuccess("");
    try {
      const result = await jsonRequest(base + "/roster-candidates", { method: "POST", body: JSON.stringify({ studentUserId: student.id }) });
      await onRosterChanged();
      setResults(list => list.filter(item => item.id !== student.id));
      setSuccess(result.linked ? "Existing roster entry linked to " + student.fullName + " without losing scores." : result.created ? student.fullName + " added to this class." : student.fullName + " is already enrolled.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add student."); }
    finally { setAdding(null); }
  }

  async function generateCode() {
    if (invite.active && !window.confirm("Replace the current code? The old invitation will stop working.")) return;
    setWorkingInvite(true); setError(""); setSuccess(""); setNewCode("");
    try {
      const result = await jsonRequest(base + "/invite", { method: "POST" });
      setNewCode(result.code);
      setInvite({ active: true, expiresAt: result.expiresAt });
      setSuccess("Invitation generated. Copy the code now; it will not be displayed again after leaving this page.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not generate an invitation."); }
    finally { setWorkingInvite(false); }
  }

  async function revokeCode() {
    if (!window.confirm("Revoke this invitation code? Students who already joined will remain enrolled.")) return;
    setWorkingInvite(true); setError(""); setSuccess("");
    try {
      await jsonRequest(base + "/invite", { method: "DELETE" });
      setInvite({ active: false, expiresAt: null }); setNewCode("");
      setSuccess("Invitation disabled. Existing roster records are unchanged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not revoke the code."); }
    finally { setWorkingInvite(false); }
  }

  return <div className="row g-3 mb-3" aria-label="Class enrollment options">
    <div className="col-12 col-xl-7">
      <div className="border rounded-3 p-3 h-100">
        <div className="d-flex justify-content-between align-items-start gap-2 flex-wrap mb-2">
          <div><h3 className="h6 mb-1">Add a verified student</h3><p className="muted small mb-0">Find a registered student from your school by name, ID, or email.</p></div>
          <span className="badge text-bg-light border">Same school only</span>
        </div>
        <label htmlFor="verified-roster-search" className="form-label small">Student name, Student ID, or email</label>
        <input id="verified-roster-search" className="form-control" type="search" autoComplete="off" placeholder="Search at least 2 characters" value={query} disabled={!isDraft} onChange={event => { setError(""); setQuery(event.target.value); }} />
        {!isDraft ? <p className="muted small mt-2 mb-0">Recall the class grades to draft before adding students.</p> :
          searching ? <p className="muted small mt-2 mb-0" role="status">Searching verified accounts…</p> :
          query.trim().length >= 2 ? results.length ?
            <div className="list-group mt-2" aria-live="polite">{results.map(student =>
              <div key={student.id} className="list-group-item d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <div><strong>{student.fullName}</strong><small className="d-block text-secondary">{student.studentNumber}</small></div>
                <button type="button" className="btn btn-outline-primary btn-sm" disabled={adding !== null} onClick={() => void addStudent(student)}>{adding === student.id ? "Adding…" : "Add to class"}</button>
              </div>)}</div> : <p className="muted small mt-2 mb-0">No matching verified students outside this class.</p> : null}
      </div>
    </div>
    <div className="col-12 col-xl-5">
      <div className="border rounded-3 p-3 h-100">
        <h3 className="h6 mb-1">Student invitation code</h3>
        <p className="muted small">Let registered and verified students join this class themselves. Codes expire after 7 days and can be revoked at any time.</p>
        <div className="small mb-2">{loadingInvite ? "Checking invitation…" : invite.active && isDraft ? <span className="text-success">● Active until {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString("en-PH") : "expiration"}</span> : "No active invitation"}</div>
        {newCode && <div className="mb-3">
          <label className="form-label small">Copy and share this code (shown once)</label>
          <div className="input-group"><input className="form-control fw-bold" readOnly aria-label="New class invitation code" value={newCode}/><button className="btn btn-outline-primary" type="button" onClick={() => void navigator.clipboard.writeText(newCode).then(() => setSuccess("Invitation code copied."), () => setError("Copy the code manually."))}>Copy</button></div>
        </div>}
        <div className="d-flex flex-wrap gap-2"><button type="button" className="btn btn-outline-primary btn-sm" disabled={!isDraft || loadingInvite || workingInvite} onClick={() => void generateCode()}>{workingInvite ? "Saving…" : invite.active ? "Rotate code" : "Generate code"}</button>
          <button type="button" className="btn btn-outline-danger btn-sm" disabled={!invite.active || loadingInvite || workingInvite} onClick={() => void revokeCode()}>Disable code</button></div>
      </div>
    </div>
    {(error || success) && <div className="col-12 pt-0">{error && <div className="alert alert-danger py-2 mb-0" role="alert">{error}</div>}{success && <div className="alert alert-success py-2 mb-0" role="status">{success}</div>}</div>}
  </div>;
}
