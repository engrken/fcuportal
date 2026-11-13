"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type VisibilityClass = {
  id: string; classId: string | null; code: string; title: string;
  term: string; academicYear: string; courseYear: string | null;
  isPublished: boolean; gradeStatus: "DRAFT" | "SUBMITTED" | "VERIFIED";
  _count?: { enrollments: number };
};

type VisibilityFeedback = { kind: "success" | "error"; message: string };
type Props = {
  subjects: VisibilityClass[];
  initialQuery?: string;
  onClose: () => void;
  onChanged: (subjectIds: string[], visible: boolean) => void;
};

export default function GradeVisibilityManager({ subjects, initialQuery = "", onClose, onChanged }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [year, setYear] = useState("All School Years");
  const [term, setTerm] = useState("All Terms");
  const [filter, setFilter] = useState<"all" | "visible" | "hidden">("all");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ ids: string[]; visible: boolean } | null>(null);
  const [feedback, setFeedback] = useState<VisibilityFeedback | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const savingRef = useRef(false);

  const years = useMemo(() => [...new Set(subjects.map(subject => subject.academicYear))].sort((a, b) => b.localeCompare(a)), [subjects]);
  const terms = useMemo(() => [...new Set(subjects.map(subject => subject.term))].sort(), [subjects]);
  const shown = subjects.filter(subject => subject.isPublished).length;
  const filtered = useMemo(() => subjects.filter(subject =>
    (year === "All School Years" || subject.academicYear === year) &&
    (term === "All Terms" || subject.term === term) &&
    (filter === "all" || subject.isPublished === (filter === "visible")) &&
    (!query.trim() || `${subject.code} ${subject.title} ${subject.classId || ""} ${subject.courseYear || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  ), [subjects, year, term, filter, query]);
  const countToShow = filtered.filter(subject => !subject.isPublished).length;
  const countToHide = filtered.filter(subject => subject.isPublished).length;

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => searchRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!savingRef.current) onClose();
      } else if (event.key === "Tab" && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)")];
        if (!focusable.length) return;
        if (event.shiftKey && document.activeElement === focusable[0]) {
          event.preventDefault();
          focusable[focusable.length - 1].focus();
        } else if (!event.shiftKey && document.activeElement === focusable[focusable.length - 1]) {
          event.preventDefault();
          focusable[0].focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
    // Modal mounts once per opening; closing and focus restoration use the opening callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeFilter(next: () => void) {
    next();
    setPending(null);
    setFeedback(null);
  }

  function clearFilters() {
    setQuery(""); setYear("All School Years"); setTerm("All Terms"); setFilter("all");
    setPending(null); setFeedback(null);
  }

  async function saveVisibility(ids: string[], visible: boolean) {
    if (!ids.length || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setPending(null);
    setFeedback(null);
    let saved = 0;
    try {
      for (let index = 0; index < ids.length; index += 200) {
        const batch = ids.slice(index, index + 200);
        const response = await fetch("/api/teacher/subjects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subjectIds: batch, isPublished: visible })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Unable to update class visibility.");
        onChanged(batch, visible);
        saved += batch.length;
      }
      setFeedback({ kind: "success", message: `${saved} class${saved === 1 ? "" : "es"} ${visible ? "shown to" : "hidden from"} students. Changes saved.` });
    } catch (error) {
      setFeedback({ kind: "error", message: `${saved ? `${saved} class(es) updated. ` : ""}${error instanceof Error ? error.message : "Unable to save changes."}` });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function requestBulk(visible: boolean) {
    const ids = filtered.filter(subject => subject.isPublished !== visible).map(subject => subject.id);
    if (!ids.length) return;
    setPending({ ids, visible });
    setFeedback(null);
  }

  return <div className="modal-backdrop-custom grade-visibility-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !savingRef.current) onClose(); }}>
    <div className="modal-card grade-visibility-modal" role="dialog" aria-modal="true" aria-labelledby="grade-visibility-modal-title" aria-describedby="grade-visibility-modal-description" ref={dialogRef}>
      <header className="grade-visibility-modal-header">
        <div><span className="eyebrow">STUDENT ACCESS</span><h2 id="grade-visibility-modal-title">Manage grade visibility</h2><p id="grade-visibility-modal-description">Choose which classes students may view, independently of grade submission or verification.</p></div>
        <button type="button" className="grade-visibility-close" aria-label="Close visibility manager" disabled={saving} onClick={onClose}>×</button>
      </header>

      <div className="grade-visibility-modal-body">
        <div className="grade-visibility-metrics" aria-label="Grade visibility summary">
          <div><span>Total classes</span><strong>{subjects.length}</strong></div>
          <div className="visibility-metric-shown"><span>Visible</span><strong>{shown}</strong></div>
          <div><span>Hidden</span><strong>{subjects.length - shown}</strong></div>
        </div>
        <div className="grade-visibility-filters">
          <label className="visibility-search-field"><span>Find a class</span><input ref={searchRef} className="form-control" type="search" value={query} placeholder="Course, class ID, or description" onChange={event => changeFilter(() => setQuery(event.target.value))}/></label>
          <label><span>School year</span><select className="form-select" value={year} onChange={event => changeFilter(() => setYear(event.target.value))}><option>All School Years</option>{years.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>Term</span><select className="form-select" value={term} onChange={event => changeFilter(() => setTerm(event.target.value))}><option>All Terms</option>{terms.map(item => <option key={item}>{item}</option>)}</select></label>
          <label><span>Visibility</span><select className="form-select" value={filter} onChange={event => changeFilter(() => setFilter(event.target.value as "all" | "visible" | "hidden"))}><option value="all">All classes</option><option value="visible">Visible only</option><option value="hidden">Hidden only</option></select></label>
        </div>

        <div className="grade-visibility-bulk">
          <span className="grade-visibility-results">{filtered.length} of {subjects.length} classes match</span>
          <div className="grade-visibility-bulk-actions">
            <button type="button" className="btn btn-outline-success btn-sm" disabled={saving || !countToShow} onClick={() => requestBulk(true)}>Show matching ({countToShow})</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={saving || !countToHide} onClick={() => requestBulk(false)}>Hide matching ({countToHide})</button>
          </div>
        </div>

        {pending && <div className="grade-visibility-confirm" role="alert">
          <div><strong>{pending.visible ? "Show" : "Hide"} grades for {pending.ids.length} class{pending.ids.length === 1 ? "" : "es"}?</strong><p>{pending.visible ? "Students can see these records, including draft grades that may be incomplete or change. They are not official grades." : "Students will no longer be able to see these class grades in SAGA."}</p></div>
          <div className="grade-visibility-confirm-actions"><button className="btn btn-outline-secondary btn-sm" type="button" disabled={saving} onClick={() => setPending(null)}>Cancel</button><button className="btn btn-primary btn-sm" type="button" disabled={saving} onClick={() => void saveVisibility(pending.ids, pending.visible)}>Confirm {pending.visible ? "show" : "hide"}</button></div>
        </div>}
        {feedback && <div className={`grade-visibility-feedback ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"}>{feedback.message}</div>}

        <div className="grade-visibility-scroll" aria-label="Class grade visibility list">
          {filtered.length ? filtered.map(subject => <label className="grade-visibility-row" key={subject.id}>
            <input className="form-check-input" type="checkbox" checked={subject.isPublished} disabled={saving} onChange={event => void saveVisibility([subject.id], event.target.checked)} aria-label={`Show grades for ${subject.code} ${subject.title}`}/>
            <span className="grade-visibility-class"><strong>{subject.code} — {subject.title}</strong><small>{subject.classId || "No Class ID"} · {subject.term} {subject.academicYear} · {subject._count?.enrollments ?? 0} students</small></span>
            <span className="grade-visibility-right"><span className={`grade-visibility-stage ${subject.gradeStatus.toLowerCase()}`}>{subject.gradeStatus === "DRAFT" ? "Not submitted" : subject.gradeStatus === "SUBMITTED" ? "Submitted" : "Teacher-verified"}</span><span className={`grade-visibility-state ${subject.isPublished ? "shown" : ""}`}>{subject.isPublished ? "Visible" : "Hidden"}</span></span>
          </label>) : <div className="grade-visibility-empty"><strong>No matching classes</strong><p>Change the search or filters to find another class.</p><button type="button" className="btn btn-outline-secondary btn-sm" onClick={clearFilters}>Clear filters</button></div>}
        </div>
      </div>

      <footer className="grade-visibility-modal-footer"><p>Grades shown before submission or verification are unofficial and may change. Final and official grades are published by the school's official student portal.</p><button type="button" className="btn btn-primary" disabled={saving} onClick={onClose}>{saving ? "Saving…" : "Done"}</button></footer>
    </div>
  </div>;
}
