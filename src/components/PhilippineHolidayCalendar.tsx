"use client";

import { useEffect, useMemo, useState } from "react";

type Holiday = { date: string; name: string; localName?: string; types?: string[] };

export function PhilippineHolidayCalendar({ selectedDate, onSelect }: { selectedDate: string; onSelect: (date: string) => void }) {
  const initial = selectedDate ? new Date(`${selectedDate}T00:00:00`) : new Date();
  const [month, setMonth] = useState({ year: initial.getFullYear(), month: initial.getMonth() });
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!selectedDate) return;
    const date = new Date(`${selectedDate}T00:00:00`);
    if (date.getFullYear() !== month.year || date.getMonth() !== month.month) setMonth({ year: date.getFullYear(), month: date.getMonth() });
  }, [selectedDate, month.year, month.month]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(false);
    fetch(`/api/calendar/holidays?year=${month.year}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Holiday data unavailable");
        const data = await response.json();
        setHolidays(Array.isArray(data.holidays) ? data.holidays : []);
      })
      .catch(error => { if (error.name !== "AbortError") { setHolidays([]); setLoadError(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [month.year]);

  const firstWeekday = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric" }).format(new Date(month.year, month.month, 1));
  const holidayByDate = useMemo(() => new Map(holidays.map(holiday => [holiday.date, holiday])), [holidays]);
  const selectedHoliday = holidayByDate.get(selectedDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const moveMonth = (amount: number) => {
    const date = new Date(month.year, month.month + amount, 1);
    setMonth({ year: date.getFullYear(), month: date.getMonth() });
  };
  const dateValue = (day: number) => `${month.year}-${String(month.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return <section className="ph-holiday-calendar" aria-label="Philippine holiday calendar">
    <div className="ph-calendar-toolbar">
      <button type="button" className="ph-calendar-nav" aria-label="Previous month" onClick={() => moveMonth(-1)}>‹</button>
      <strong>{monthLabel}</strong>
      <button type="button" className="ph-calendar-nav" aria-label="Next month" onClick={() => moveMonth(1)}>›</button>
    </div>
    <div className="ph-calendar-grid" role="grid" aria-label={monthLabel}>
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => <span key={day} className="ph-calendar-weekday" role="columnheader">{day}</span>)}
      {Array.from({ length: firstWeekday }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const value = dateValue(day);
        const holiday = holidayByDate.get(value);
        const isSelected = value === selectedDate;
        return <button key={value} type="button" role="gridcell" aria-pressed={isSelected} aria-label={holiday ? `${monthNames[month.month]} ${day}, ${month.year}, ${holiday.localName || holiday.name} public holiday` : `${monthNames[month.month]} ${day}, ${month.year}`} title={holiday ? holiday.localName || holiday.name : undefined} className={`ph-calendar-day${isSelected ? " is-selected" : ""}${holiday ? " is-holiday" : ""}`} onClick={() => onSelect(value)}>
          {day}{holiday && <span className="ph-holiday-dot" aria-hidden="true" />}
        </button>;
      })}
    </div>
    <div className="ph-calendar-legend"><span className="ph-holiday-dot" aria-hidden="true" /> Philippine public holiday</div>
    <div className="ph-calendar-holiday-note" aria-live="polite">
      {loading ? "Loading Philippine holidays…" : loadError ? "Holiday dates are temporarily unavailable." : selectedHoliday ? <><b>{selectedHoliday.localName || selectedHoliday.name}</b><span>{selectedHoliday.types?.join(", ") || "Philippine public holiday"}</span></> : "Select a date to see whether it is a public holiday."}
    </div>
  </section>;
}
