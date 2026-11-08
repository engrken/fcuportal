const DAY_INDEX: Record<string, number> = {
  sunday: 0, sun: 0, saturday: 6, saturdayabbr: 6, sat: 6, sa: 6,
  monday: 1, mon: 1, m: 1, tuesday: 2, tues: 2, tue: 2, tu: 2, t: 2,
  wednesday: 3, wed: 3, w: 3, thursday: 4, thurs: 4, thursdayabbr: 4, thu: 4, th: 4,
  friday: 5, fri: 5, f: 5
};
const DAY_TOKENS = Object.keys(DAY_INDEX).filter(token => !token.endsWith("abbr")).sort((a, b) => b.length - a.length);

export function scheduleWeekdays(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [];
  try {
    const rows: Array<{ day?: string }> = JSON.parse(raw);
    if (Array.isArray(rows)) return [...new Set(rows.map(row => DAY_INDEX[(row.day || "").toLowerCase()]).filter((day): day is number => day !== undefined))];
  } catch { /* Legacy schedules are parsed below. */ }
  let dayText = raw.split(/[0-9]/, 1)[0].split(":").at(-1) || raw;
  dayText = dayText.replace(/laboratory|lecture|lec|lab|class|schedule/gi, "").replace(/[^a-z]/gi, "").toLowerCase();
  if (!dayText) return [];
  const days: number[] = [];
  let offset = 0;
  while (offset < dayText.length) {
    const token = DAY_TOKENS.find(candidate => dayText.startsWith(candidate, offset));
    if (!token) return [];
    days.push(DAY_INDEX[token]); offset += token.length;
  }
  return [...new Set(days)];
}

export function weekdayFromDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getUTCDay();
}
