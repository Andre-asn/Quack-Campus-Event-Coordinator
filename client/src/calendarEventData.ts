import { CAMPUS_TIME_ZONE } from './campusTime';

export type CalendarEventSource = {
  title: string;
  startsAt: string;
  endsAt: string | null;
  locationLabel: string;
};

export type CalendarEventData = {
  title: string;
  startDate: Date;
  endDate: Date;
  location?: string;
  timeZone: string;
};

export function calendarEventData(event: CalendarEventSource): CalendarEventData | null {
  const startDate = new Date(event.startsAt);
  const endDate = event.endsAt ? new Date(event.endsAt) : null;
  if (!Number.isFinite(startDate.getTime()) || !endDate || !Number.isFinite(endDate.getTime()) || endDate <= startDate) {
    return null;
  }
  return {
    title: event.title,
    startDate,
    endDate,
    location: event.locationLabel || undefined,
    timeZone: CAMPUS_TIME_ZONE,
  };
}
