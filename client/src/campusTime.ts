const CAMPUS = 'America/New_York';

export function campusDayKey(now: Date): string {
  const day = campusDate(now);
  return `${day.year}-${day.month}-${day.day}`;
}

export function isCampusDayBefore(dayKey: string, now: Date): boolean {
  const day = parseCalendarDay(dayKey);
  const today = campusDate(now);
  return Date.UTC(day.year, day.month - 1, day.day)
    < Date.UTC(today.year, today.month - 1, today.day);
}

export function campusDayRange(now: Date): { from: string; to: string } {
  const today = campusDate(now);
  return campusDayRangeForCalendarDay(today);
}

// The date stepper owns the selected-day value. Keeping the map query contract as a
// campus calendar-day key avoids converting a selected local day through the device zone.
// A clock time on a campus calendar day, as UTC. Used for the free-window filter.
export function campusDateTime(dayKey: string, hours: number, minutes: number): string {
  const day = parseCalendarDay(dayKey);
  const wall = new Date(Date.UTC(day.year, day.month - 1, day.day, hours, minutes, 0));
  const offset = timeZoneOffsetMs(wall, CAMPUS);
  return new Date(wall.getTime() - offset).toISOString();
}

export function campusDayRangeForKey(dayKey: string): { from: string; to: string } {
  const day = parseCalendarDay(dayKey);
  return campusDayRangeForCalendarDay(day);
}

function parseCalendarDay(dayKey: string): CalendarDay {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(dayKey);
  if (!match) {
    throw new Error('Invalid campus day key');
  }
  const day = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const normalized = new Date(Date.UTC(day.year, day.month - 1, day.day));
  if (normalized.getUTCFullYear() !== day.year
      || normalized.getUTCMonth() + 1 !== day.month
      || normalized.getUTCDate() !== day.day) {
    throw new Error('Invalid campus day key');
  }
  return day;
}

function campusDayRangeForCalendarDay(today: CalendarDay): { from: string; to: string } {
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
  const utcMidnight = new Date(Date.UTC(day.year, day.month - 1, day.day, 0, 0, 0));
  const offset = timeZoneOffsetMs(utcMidnight, CAMPUS);
  return new Date(utcMidnight.getTime() - offset);
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
