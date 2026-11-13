"use client";
import { useEffect, useState } from "react";

type SchoolOption = { id: string; name: string; shortName: string };
export const NEW_SCHOOL_OPTION = "__saga_new_school__";

export default function SchoolSelect({
  value, onChange, required = true, id = "schoolId", audience = "student", allowNotListed = false
}: {
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  id?: string;
  audience?: "student" | "teacher";
  allowNotListed?: boolean;
}) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    const endpoint = audience === "teacher" ? "/api/schools?audience=teacher" : "/api/schools";
    fetch(endpoint, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to retrieve schools");
        return response.json();
      })
      .then(data => {
        if (!controller.signal.aborted) setSchools((data.schools || []) as SchoolOption[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setSchools([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [audience]);

  return <>
    <select
      id={id}
      className="form-select form-select-lg mb-2"
      aria-label="School"
      aria-describedby={loadError ? `${id}-load-error` : undefined}
      name="schoolId"
      value={value}
      onChange={event => onChange(event.target.value)}
      required={required}
      disabled={loading}
    >
      <option value="">{loading ? "Loading schools…" : "Select your school"}</option>
      {schools.map(school => <option value={school.id} key={school.id}>{school.name} ({school.shortName})</option>)}
      {allowNotListed && <option value={NEW_SCHOOL_OPTION}>Not listed — register a new school</option>}
    </select>
    {loadError && <div id={`${id}-load-error`} className="form-text text-danger mb-2" role="status">
      Could not load the current school list. Please refresh and try again.
    </div>}
  </>;
}
