/**
 * Returns the Monday-to-Sunday week bounds that contain "now" in the
 * caller's timezone.
 *
 * @param utcOffsetMinutes  The client's UTC offset in minutes
 *   (positive = east, negative = west, e.g. PST = -480).
 *   When omitted, the server/machine's local offset is used.
 *
 * Returned Dates are real UTC timestamps suitable for Firestore queries.
 */
export function getWeekBounds(utcOffsetMinutes?: number): {
  start: Date;
  end: Date;
} {
  const offset =
    utcOffsetMinutes ?? -(new Date().getTimezoneOffset());
  const offsetMs = offset * 60_000;

  // Shift UTC "now" into the client's local frame so getUTCDay() gives the
  // client's local day-of-week.
  const clientLocal = new Date(Date.now() + offsetMs);

  const day = clientLocal.getUTCDay(); // 0 = Sun … 6 = Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;

  // Monday 00:00 in the client's local frame (still shifted-UTC)
  clientLocal.setUTCDate(clientLocal.getUTCDate() + mondayOffset);
  clientLocal.setUTCHours(0, 0, 0, 0);

  // Convert back to real UTC
  const startMs = clientLocal.getTime() - offsetMs;
  // End = Sunday 23:59:59.999 in client's local time
  const endMs = startMs + 7 * 24 * 3_600_000 - 1;

  return { start: new Date(startMs), end: new Date(endMs) };
}
