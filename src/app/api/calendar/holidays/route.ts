type Holiday = { date: string; name: string; localName: string; types: string[] };

function unescapeIcs(value: string) {
  return value.replace(/\\n/gi, " ").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseHolidayFeed(ics: string, year: number): Holiday[] {
  const unfolded = ics.replace(/\r?\n[ \t]/g, "");
  const events = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || [];
  return events.flatMap(event => {
    const dateMatch = event.match(/^DTSTART(?:;[^:]*)?:(\d{8})/m);
    const summaryMatch = event.match(/^SUMMARY(?:;[^:]*)?:(.+)$/m);
    if (!dateMatch || !summaryMatch) return [];
    const rawDate = dateMatch[1];
    const eventYear = Number(rawDate.slice(0, 4));
    if (eventYear !== year) return [];
    return [{
      date: `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`,
      name: unescapeIcs(summaryMatch[1]),
      localName: unescapeIcs(summaryMatch[1]),
      types: ["Public holiday"],
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export const revalidate = 86400;

export async function GET(request: Request) {
  const yearParam = new URL(request.url).searchParams.get("year");
  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Provide a valid year between 2000 and 2100." }, { status: 400 });
  }

  try {
    const url = "https://calendar.google.com/calendar/ical/en.philippines%23holiday%40group.v.calendar.google.com/public/basic.ics";
    const response = await fetch(url, {
      headers: { Accept: "text/calendar" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Holiday provider returned ${response.status}`);
    const holidays = parseHolidayFeed(await response.text(), year);
    return Response.json({ holidays, source: "Google Calendar public holiday feed", countryCode: "PH", year }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return Response.json({ error: "Philippine holiday dates are temporarily unavailable." }, { status: 502 });
  }
}
