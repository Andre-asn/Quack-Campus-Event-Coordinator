import { apiBaseUrl, sessionCookieName } from './config';

// GET /api/v1/events/{id}. Attendee names are never in this payload.
export type EventDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  locationLabel: string;
  startsAt: string;
  status: 'active' | 'cancelled';
  host: {
    displayName: string;
    avatarUrl: string | null;
  };
  attendeeCount: number;
};

export type DetailResult =
  | { ok: true; event: EventDetail }
  | { ok: false; message: string; retry: boolean };

export async function loadEventDetail(
  sessionId: string,
  id: string,
  signal?: AbortSignal,
): Promise<DetailResult> {
  const response = await fetch(`${apiBaseUrl}/api/v1/events/${encodeURIComponent(id)}`, {
    headers: {
      Accept: 'application/json',
      Cookie: `${sessionCookieName}=${sessionId}`,
    },
    signal,
  });
  if (response.ok) {
    return { ok: true, event: (await response.json()) as EventDetail };
  }
  if (response.status === 401) {
    return { ok: false, message: 'Your session has expired. Sign out and sign in again.', retry: false };
  }
  if (response.status === 404) {
    return { ok: false, message: 'This event isn’t available anymore.', retry: false };
  }
  return { ok: false, message: 'Couldn’t load this event. Try again.', retry: true };
}
