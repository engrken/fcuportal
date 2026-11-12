type NagerHoliday = {
  date: string;
  localName?: string;
  name?: string;
  types?: string[];
};

export const revalidate = 86400;

export async function GET(request: Request) {
  const yearParam = new URL(request.url).searchParams.get("year");
  const year = Number(yearParam);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return Response.json({ error: "Provide a valid year between 2000 and 2100." }, { status: 400 });
  }

  try {
    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/PH`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 86400 },
    });
    if (!response.ok) throw new Error(`Holiday provider returned ${response.status}`);
    const data = await response.json() as NagerHoliday[];
    const holidays = data
      .filter(item => /^\\d{4}-\\d{2}-\\d{2}$/.test(item.date))
      .map(item => ({ date: item.date, name: item.name || item.localName || "Public holiday", localName: item.localName, types: item.types || [] }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return Response.json({ holidays, source: "Nager.Date", countryCode: "PH", year }, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch {
    return Response.json({ error: "Philippine holiday dates are temporarily unavailable." }, { status: 502 });
  }
}
