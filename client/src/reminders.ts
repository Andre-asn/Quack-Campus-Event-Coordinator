import * as Notifications from 'expo-notifications';

import { apiBaseUrl, sessionCookieName } from './config';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type LeadMinutes = 15 | 60;

function reminderId(eventId: string): string {
  return `quack-reminder-${eventId}`;
}

export async function cancelLocalReminder(eventId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(reminderId(eventId)).catch(() => undefined);
}

export async function loadReminder(
  sessionId: string,
  eventId: string,
  token?: string | null,
): Promise<LeadMinutes | null> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}/reminder${query}`,
      {
        credentials: 'omit',
        headers: { Accept: 'application/json', Cookie: `${sessionCookieName}=${sessionId}` },
      },
    );
    if (!response.ok) {
      return null;
    }
    const body = (await response.json()) as { leadMinutes?: number | null };
    return body.leadMinutes === 15 || body.leadMinutes === 60 ? body.leadMinutes : null;
  } catch {
    return null;
  }
}

export async function chooseReminder(
  sessionId: string,
  eventId: string,
  title: string,
  startsAt: string,
  leadMinutes: LeadMinutes,
  token?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    const granted = permission.granted
      || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) {
      return { ok: false, message: 'Allow notifications to get a reminder.' };
    }
    const query = token ? `?token=${encodeURIComponent(token)}` : '';
    const response = await fetch(
      `${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}/reminder${query}`,
      {
        credentials: 'omit',
        method: 'PUT',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cookie: `${sessionCookieName}=${sessionId}`,
        },
        body: JSON.stringify({ leadMinutes }),
      },
    );
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
      return { ok: false, message: problem?.detail ?? 'Couldn’t save the reminder.' };
    }
    const fireAt = new Date(new Date(startsAt).getTime() - leadMinutes * 60_000);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: reminderId(eventId),
        content: {
          title,
          body: leadMinutes === 15 ? 'Starts in 15 minutes' : 'Starts in 1 hour',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireAt,
        },
      });
    } catch {
      await clearReminder(sessionId, eventId, token);
      return { ok: false, message: 'Couldn’t schedule the reminder.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Couldn’t save the reminder.' };
  }
}

export async function clearReminder(
  sessionId: string,
  eventId: string,
  token?: string | null,
): Promise<boolean> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}/reminder${query}`, {
      credentials: 'omit',
      method: 'DELETE',
      headers: { Cookie: `${sessionCookieName}=${sessionId}` },
    });
    if (!response.ok && response.status !== 404) {
      return false;
    }
  } catch {
    return false;
  }
  await cancelLocalReminder(eventId);
  return true;
}
