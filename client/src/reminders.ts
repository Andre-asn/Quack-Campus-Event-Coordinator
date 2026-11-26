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

function leadMinutesOf(value: unknown): LeadMinutes | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return parsed === 15 || parsed === 60 ? parsed : null;
}

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
      await scheduleReminder(eventId, title, startsAt, leadMinutes, fireAt, token);
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

// The server row is gone after a cancel or a leave, but the notification already sits on the device.
// Launch, returning to the foreground, and staying in the foreground compare the saved start and lead.
// A closed app cannot run this, so that notification stays until the app is opened again.
export async function syncReminders(sessionId: string): Promise<void> {
  let scheduled: Notifications.NotificationRequest[];
  try {
    scheduled = await Notifications.getAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  await Promise.all(scheduled.map((request) => syncOne(sessionId, request)));
}

async function syncOne(sessionId: string, request: Notifications.NotificationRequest): Promise<void> {
  if (!request.identifier.startsWith('quack-reminder-')) {
    return;
  }
  const data = request.content.data ?? {};
  const eventId = typeof data.eventId === 'string'
    ? data.eventId
    : request.identifier.slice('quack-reminder-'.length);
  const token = typeof data.token === 'string' ? data.token : null;
  const savedStart = typeof data.startsAt === 'string' ? data.startsAt : null;
  const savedLead = leadMinutesOf(data.leadMinutes);
  const event = await fetchEvent(sessionId, eventId, token);
  if (event === 'unavailable') {
    await cancelLocalReminder(eventId);
    return;
  }
  if (event === 'unknown') {
    return;
  }
  const lead = await fetchLead(sessionId, eventId, token);
  if (lead === 'unknown') {
    return;
  }
  if (event.status === 'cancelled' || !event.joined || lead === null) {
    await cancelLocalReminder(eventId);
    return;
  }
  if (savedStart === event.startsAt && savedLead === lead) {
    return;
  }
  const fireAt = new Date(new Date(event.startsAt).getTime() - lead * 60_000);
  if (fireAt.getTime() <= Date.now()) {
    await cancelLocalReminder(eventId);
    return;
  }
  try {
    await scheduleReminder(eventId, event.title, event.startsAt, lead, fireAt, token);
  } catch {
    // Keep the notification that is already scheduled.
  }
}

async function scheduleReminder(
  eventId: string,
  title: string,
  startsAt: string,
  leadMinutes: LeadMinutes,
  fireAt: Date,
  token?: string | null,
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    identifier: reminderId(eventId),
    content: {
      title,
      body: leadMinutes === 15 ? 'Starts in 15 minutes' : 'Starts in 1 hour',
      data: {
        eventId,
        startsAt,
        leadMinutes,
        ...(token ? { token } : {}),
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

type SyncedEvent = {
  title: string;
  startsAt: string;
  status: string;
  joined: boolean;
};

async function fetchEvent(
  sessionId: string,
  eventId: string,
  token: string | null,
): Promise<SyncedEvent | 'unavailable' | 'unknown'> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}${query}`,
      {
        credentials: 'omit',
        headers: { Accept: 'application/json', Cookie: `${sessionCookieName}=${sessionId}` },
      },
    );
    if (response.status === 404) {
      return 'unavailable';
    }
    if (!response.ok) {
      return 'unknown';
    }
    const body = (await response.json()) as Partial<SyncedEvent>;
    if (!body.startsAt || !body.title || !body.status || typeof body.joined !== 'boolean') {
      return 'unknown';
    }
    return { title: body.title, startsAt: body.startsAt, status: body.status, joined: body.joined };
  } catch {
    return 'unknown';
  }
}

async function fetchLead(
  sessionId: string,
  eventId: string,
  token: string | null,
): Promise<LeadMinutes | null | 'unknown'> {
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
      return 'unknown';
    }
    const body = (await response.json()) as { leadMinutes?: number | null };
    return body.leadMinutes === 15 || body.leadMinutes === 60 ? body.leadMinutes : null;
  } catch {
    return 'unknown';
  }
}
