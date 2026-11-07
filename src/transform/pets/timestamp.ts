const TS = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}))?/;

/*
Coarsen a timestamp string to the requested granularity.
*/
export function coarsenTimestamp(value: string, level?: string): string {
  const m = value.match(TS);
  if (!m) return value;
  const [, y, mo, d, h] = m;
  switch (level) {
    case "time_of_day":
      return h ? `${h}:00` : "";
    case "iso_week":
      return isoWeek(Number(y), Number(mo), Number(d));
    case "date":
      return `${y}-${mo}-${d}`;
    default:
      return h ? `${y}-${mo}-${d} ${h}:00` : `${y}-${mo}-${d}`;
  }
}

/*
Format a calendar date as an ISO week string.
*/
function isoWeek(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const weekYear = date.getUTCFullYear();
  const jan1 = Date.UTC(weekYear, 0, 1);
  const week = Math.ceil(((date.getTime() - jan1) / 86_400_000 + 1) / 7);
  return `${weekYear}-W${String(week).padStart(2, "0")}`;
}
