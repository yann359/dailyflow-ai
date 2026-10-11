export function localDate(
  date = new Date(),
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  return ['year', 'month', 'day']
    .map((key) => parts.find((p) => p.type === key)!.value)
    .join('-');
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayOfWeek(date: string) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}
export function weekStart(date: string) {
  return addDays(date, -((dayOfWeek(date) + 6) % 7));
}
export function dateDistance(a: string, b: string) {
  return Math.round(
    (new Date(`${a}T12:00:00Z`).getTime() -
      new Date(`${b}T12:00:00Z`).getTime()) /
      86400000,
  );
}
export function recentDates(date: string, count: number) {
  return Array.from({ length: count }, (_, i) => addDays(date, i - count + 1));
}
export function displayDate(
  date: string,
  options: Intl.DateTimeFormatOptions = {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  },
) {
  return new Intl.DateTimeFormat('zh-CN', {
    ...options,
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
}
