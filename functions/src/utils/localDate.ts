/**
 * Today's date (YYYY-MM-DD) in the client's local timezone.
 *
 * Offset convention matches getWeekBounds: the offset is added to UTC to get
 * local time (e.g. PST = -480).
 */
export function getTodayDateString(utcOffsetMinutes: number): string {
  const clientLocal = new Date(Date.now() + utcOffsetMinutes * 60_000);
  return clientLocal.toISOString().substring(0, 10);
}
