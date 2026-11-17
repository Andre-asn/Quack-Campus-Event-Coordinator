import * as Calendar from 'expo-calendar/legacy';

import { calendarEventData } from './calendarEventData';
import type { EventDetail } from './eventDetail';

export type CalendarResult =
  | { ok: true }
  | { ok: false; reason: 'invalid-time' | 'unavailable' };

export async function openCalendarEditor(event: Pick<EventDetail, 'title' | 'startsAt' | 'endsAt' | 'locationLabel'>): Promise<CalendarResult> {
  const data = calendarEventData(event);
  if (!data) {
    return { ok: false, reason: 'invalid-time' };
  }
  try {
    await Calendar.createEventInCalendarAsync(data, {});
    return { ok: true };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}
