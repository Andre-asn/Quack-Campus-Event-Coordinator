const CAMPUS = 'America/New_York';

export function campusDayKey(now: Date): string {
  const day = campusDate(now);
  return `${day.year}-${day.month}-${day.day}`;
}

export function campusDayRange(now: Date): { from: string; to: string } {
  const today = campusDate(now);
  const tomorrow = addDays(today, 1);
  return {
    from: campusMidnight(today).toISOString(),
    to: campusMidnight(tomorrow).toISOString(),
  };
}

function campusDate(now: Date): CalendarDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: CAMPUS,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

function addDays(day: CalendarDay, days: number): CalendarDay {
  const shifted = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function campusMidnight(day: CalendarDay): Date {
  const guess = new Date(Date.UTC(day.year, day.month - 1, day.day, 12, 0, 0));
  const offset = timeZoneOffsetMs(guess, CAMPUS);
  return new Date(Date.UTC(day.year, day.month - 1, day.day, 0, 0, 0) - offset);
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(num('year'), num('month') - 1, num('day'), num('hour'), num('minute'), num('second'));
  return asUtc - date.getTime();
}

type CalendarDay = {
  year: number;
  month: number;
  day: number;
};
