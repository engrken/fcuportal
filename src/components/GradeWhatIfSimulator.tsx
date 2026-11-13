"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  invalidScenarioCount,
  isAttendanceAssessment,
  scenarioPendingScores,
  simulateStudentGrade,
  validScenarioEntry,
  type ScoreScenario,
  type StudentSimulationGrade
} from "@/lib/grade-simulation";

type Props = { grade: StudentSimulationGrade; onClose: () => void };
const displayPercent = (value: number | null) => value === null ? "—" : `${value.toFixed(2)}%`;

export default function GradeWhatIfSimulator({ grade, onClose }: Props) {
  const [scenario, setScenario] = useState<ScoreScenario>({});
  const [target, setTarget] = useState("75");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const baseline = useMemo(() => simulateStudentGrade(grade), [grade]);
  const projected = useMemo(() => simulateStudentGrade(grade, scenario), [grade, scenario]);
  const errors = useMemo(() => invalidScenarioCount(grade, scenario), [grade, scenario]);
  const changed = Object.values(scenario).filter(value => value !== "").length;
  const pending = grade.categories.flatMap(category => category.assessments)
    .filter(item => item.points === null && item.remark === null && !isAttendanceAssessment(item)).length;
  const targetPercent = Number(target);
  const validTarget = target.trim() !== "" && Number.isFinite(targetPercent) && targetPercent >= 0 && targetPercent <= 100;
  const delta = baseline.totalPercent === null || projected.totalPercent === null
    ? null : Math.round((projected.totalPercent - baseline.totalPercent) * 100) / 100;
  const projectedById = new Map(projected.items.map(item => [item.categoryId, item]));
  const baselineById = new Map(baseline.items.map(item => [item.categoryId, item]));

  useEffect(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "Tab" && dialogRef.current) {
        const controls = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled)"));
        if (controls.length) {
          const first = controls[0], last = controls[controls.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = overflow;
      previousFocusRef.current?.focus();
    };
    // The modal is mounted once when opened. onClose does not need to retrigger focus management.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setScore(id: string, value: string) {
    setScenario(previous => ({ ...previous, [id]: value }));
  }

  return <div className="modal-backdrop-custom grade-simulator-backdrop" onMouseDown={event => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <div className="modal-card grade-simulator-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="grade-simulator-heading" aria-describedby="grade-simulator-description">
      <header className="grade-simulator-heading">
        <div><small className="eyebrow">STUDENT TOOLS · PRIVATE PRACTICE</small>
          <h2 id="grade-simulator-heading">What-If Grade Simulator</h2>
          <p id="grade-simulator-description">{grade.code} — {grade.title}</p>
        </div>
        <button ref={closeRef} type="button" className="grade-simulator-close" onClick={onClose} aria-label="Close grade simulator">×</button>
      </header>
      <div className="grade-simulator-body">
        <div className="grade-simulator-notice"><strong>Simulation only.</strong> Try hypothetical scores to explore possible outcomes. Nothing entered here is saved or sent to your teacher. Actual grades, verification, and official school records remain unchanged.</div>
        <div className="grade-simulator-metrics">
          <div><small>Current course contribution</small><strong>{displayPercent(grade.percent ?? baseline.totalPercent)}</strong><span>Teacher-entered results</span></div>
          <div className="grade-simulator-metric-projected"><small>What-if contribution</small><strong>{errors ? "Check inputs" : displayPercent(projected.totalPercent)}</strong>
            <span>{!errors && delta !== null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)} percentage points` : "Based on hypothetical entries"}</span></div>
          <div><small>Hypothetical equivalent</small><strong>{errors ? "—" : projected.equivalent.finalGrade ?? "—"}</strong><span>{errors ? "Correct out-of-range scores" : projected.equivalent.remarks}</span></div>
        </div>
        <div className="grade-simulator-controls">
          <div className="grade-simulator-target">
            <label htmlFor="simulated-grade-target">Target course percentage</label>
            <div className="input-group input-group-sm"><input id="simulated-grade-target" className="form-control" type="number" min="0" max="100" step="0.01" value={target} onChange={event => setTarget(event.target.value)}/><span className="input-group-text">%</span></div>
          </div>
          <div className="grade-simulator-target-result" aria-live="polite">
            {errors ? "Fix invalid hypothetical scores to compare results." :
              !validTarget ? "Enter a target from 0% to 100%." :
              projected.totalPercent === null ? "No assessment results available for comparison." :
              projected.totalPercent >= targetPercent ? "The simulated contribution meets your selected target." :
              `${(targetPercent - projected.totalPercent).toFixed(2)} percentage points below your selected target.`}
          </div>
          <div className="grade-simulator-presets">
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={!pending} onClick={() => setScenario(current => scenarioPendingScores(grade, .7, current))}>Try 70% on pending</button>
            <button type="button" className="btn btn-outline-primary btn-sm" disabled={!pending} onClick={() => setScenario(current => scenarioPendingScores(grade, 1, current))}>Try full marks on pending</button>
            <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!changed} onClick={() => setScenario({})}>Reset scenario</button>
          </div>
        </div>

        <div className="grade-simulator-section-intro">
          <strong>Assessment score scenarios</strong>
          <span>{changed} hypothetical change{changed === 1 ? "" : "s"} · {pending} pending assessment{pending === 1 ? "" : "s"}</span>
        </div>
        {grade.categories.length ? <div className="grade-simulator-categories">{grade.categories.map(category => {
          const before = baselineById.get(category.id);
          const after = projectedById.get(category.id);
          return <section className="grade-simulator-category" key={category.id}>
            <div className="grade-simulator-category-heading"><div><h3>{category.name}</h3><small>{category.weight.toFixed(2)}% of total course</small></div>
              <div className="grade-simulator-category-points"><span>{displayPercent(before?.earnedCourse ?? null)} → {errors ? "—" : displayPercent(after?.earnedCourse ?? null)}</span><small>earned course contribution</small></div>
            </div>
            {category.assessments.length ? <div className="grade-simulator-assessments">{category.assessments.map(item => {
              const attendance = isAttendanceAssessment(item);
              const value = scenario[item.id] || "";
              const valid = validScenarioEntry(item, value);
              const actual = item.remark === "PRESENT" ? "Present" : item.remark === "ABSENT" ? "Absent" :
                item.remark === "EXCUSED" ? "Excused" : item.remark === "DID_NOT_SUBMIT" ? "Did not submit" :
                item.points === null ? "Pending / not recorded" : `${item.points} / ${item.maxScore}`;
              return <div className="grade-simulator-assessment" key={item.id}>
                <div className="grade-simulator-assessment-info"><strong>{item.title}</strong><small>Teacher record: {actual}</small></div>
                <label className="grade-simulator-entry">
                  <span>Try {attendance ? "attendance" : `score (max ${item.maxScore})`}</span>
                  {attendance ? <select className="form-select form-select-sm" value={value} onChange={event => setScore(item.id, event.target.value)}>
                    <option value="">Keep recorded</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option><option value="EXCUSED">Excused</option>
                  </select> : <input className={`form-control form-control-sm ${valid ? "" : "is-invalid"}`} type="number" inputMode="decimal"
                    min="0" max={item.maxScore} step=".01" value={value} placeholder="Unchanged"
                    aria-invalid={!valid} onChange={event => setScore(item.id, event.target.value)}/>}
                  {!valid && <small className="grade-simulator-invalid">Enter 0–{item.maxScore}, up to 2 decimal places.</small>}
                </label>
                {value !== "" && <button type="button" className="grade-simulator-reset-item" onClick={() => setScore(item.id, "")} aria-label={`Reset hypothetical score for ${item.title}`}>Reset</button>}
              </div>;
            })}</div> : <p className="grade-simulator-empty">No teacher-created assessment items in this category yet.</p>}
          </section>;
        })}</div> : <div className="grade-simulator-empty">Your teacher has not configured assessment categories yet.</div>}
        <p className="grade-simulator-disclaimer">This is a weighted calculation using only teacher-created assessments visible in SAGA. Blank, not-yet-recorded assessments are excluded until a hypothetical score is entered, so early results may not predict the final course grade. Custom grade changes and future uncreated assessments are not modeled. Official grades are published only through the school's official student portal.</p>
      </div>
      <footer className="grade-simulator-footer"><span>Only you can see this temporary scenario.</span><button type="button" className="btn btn-primary" onClick={onClose}>Close simulator</button></footer>
    </div>
  </div>;
}
