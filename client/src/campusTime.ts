export const CAMPUS_TIME_ZONE = 'America/New_York';

export type CalendarDay = {
  year: number;
  month: number;
  day: number;
};

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

export function isCampusDayInWindow(dayKey: string, now: Date): boolean {
  const day = parseCalendarDay(dayKey);
  const today = campusDate(now);
  const value = calendarDayNumber(day);
  const earliest = calendarDayNumber(addDays(today, -1));
  const latest = calendarDayNumber(addDays(today, 1));
  return value >= earliest && value <= latest;
}

export function clampCampusDay(dayKey: string, now: Date): string {
  const today = campusDate(now);
  const day = parseCalendarDay(dayKey);
  const value = calendarDayNumber(day);
  const yesterday = addDays(today, -1);
  const tomorrow = addDays(today, 1);
  if (value < calendarDayNumber(yesterday)) {
    return campusDayKeyFromCalendarDay(yesterday);
  }
  if (value > calendarDayNumber(tomorrow)) {
    return campusDayKeyFromCalendarDay(tomorrow);
  }
  return campusDayKeyFromCalendarDay(day);
}

export function reanchorCampusDay(selectedDay: string, now: Date): { anchorDay: string; selectedDay: string } {
  return {
    anchorDay: campusDayKey(now),
    selectedDay: clampCampusDay(selectedDay, now),
  };
}

export function shiftCampusDay(dayKey: string, days: number): string {
  return campusDayKeyFromCalendarDay(addDays(parseCalendarDay(dayKey), days));
}

export function campusDayLabel(dayKey: string, now: Date): string {
  return campusDayLabelForAnchor(dayKey, campusDayKey(now));
}

export function campusDayLabelForAnchor(dayKey: string, today: string): string {
  if (dayKey === today) {
    return 'Today';
  }
  if (dayKey === shiftCampusDay(today, -1)) {
    return 'Yesterday';
  }
  if (dayKey === shiftCampusDay(today, 1)) {
    return 'Tomorrow';
  }
  const day = parseCalendarDay(dayKey);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(day.year, day.month - 1, day.day)));
}

export function eventCountLabel(count: number, dayLabel: string): string {
  return `${count} ${count === 1 ? 'event' : 'events'} ${dayLabel.toLowerCase()}`;
}

export function campusDayRange(now: Date): { from: string; to: string } {
  const today = campusDate(now);
  return campusDayRangeForCalendarDay(today);
}

// The date stepper owns the selected-day value. Keeping the map query contract as a
// campus calendar-day key avoids converting a selected local day through the device zone.
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
    timeZone: CAMPUS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

function campusDayKeyFromCalendarDay(day: CalendarDay): string {
  return `${day.year}-${day.month}-${day.day}`;
}

function calendarDayNumber(day: CalendarDay): number {
  return Date.UTC(day.year, day.month - 1, day.day);
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
  // Recompute once after applying the first offset. This handles DST transitions where
  // UTC midnight falls on the previous local calendar day.
  const first = new Date(utcMidnight.getTime() - timeZoneOffsetMs(utcMidnight, CAMPUS_TIME_ZONE));
  return new Date(utcMidnight.getTime() - timeZoneOffsetMs(first, CAMPUS_TIME_ZONE));
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
