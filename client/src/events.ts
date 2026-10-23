import { apiBaseUrl, sessionCookieName } from './config';

export type NewEvent = {
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  startsAt: string;
};

export async function createEvent(
  sessionId: string,
  event: NewEvent,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: `${sessionCookieName}=${sessionId}`,
      },
      body: JSON.stringify(event),
    });
    if (response.ok) {
      return { ok: true };
    }
    if (response.status === 401) {
      return { ok: false, message: 'Your session has expired. Sign out and sign in again.' };
    }
    // shortcut: one message above the button; show errors against each field once #36 settles the `errors` shape.
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    return { ok: false, message: problem?.detail ?? 'Could not post the event. Try again.' };
  } catch {
    return { ok: false, message: 'Could not reach Quack!. Check your connection and try again.' };
  }
}
