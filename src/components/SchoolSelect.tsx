"use client";
import { useEffect, useState } from "react";

type SchoolOption = { id: string; name: string; shortName: string };
export default function SchoolSelect({ value, onChange, required = true, id = "schoolId" }: { value: string; onChange: (id: string) => void; required?: boolean; id?: string }) {
  const [schools, setSchools] = useState<SchoolOption[]>([]);
  useEffect(() => {
    fetch("/api/schools").then(response => response.json()).then(data => {
      const options = (data.schools || []) as SchoolOption[];
      setSchools(options);
      if (!value && options.length === 1) onChange(options[0].id);
    }).catch(() => setSchools([]));
  }, []);
  return <select id={id} className="form-select form-select-lg mb-3" aria-label="School" name="schoolId" value={value} onChange={event => onChange(event.target.value)} required={required}>
    <option value="">Select your school</option>
    {schools.map(school => <option value={school.id} key={school.id}>{school.name} ({school.shortName})</option>)}
  </select>;
}
