import { apiBaseUrl, sessionCookieName } from './config';

// GET /api/v1/events/{id}. Attendee names are never in this payload.
export type EventDetail = {
  id: string;
  title: string;
  description: string;
  category: string;
  locationLabel: string;
  startsAt: string;
  endsAt: string;
  status: 'active' | 'cancelled';
  visibility: 'public' | 'link_only';
  shareToken?: string | null;
  joined: boolean;
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
  token?: string | null,
): Promise<DetailResult> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 15_000);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events/${encodeURIComponent(id)}${query}`, {
      // The session goes in our own Cookie header; see the note in auth.ts.
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
        Cookie: `${sessionCookieName}=${sessionId}`,
      },
      signal: timeout.signal,
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
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return { ok: false, message: 'Couldn’t reach Quack!. Check your connection.', retry: true };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

export async function setAttendance(
  sessionId: string,
  id: string,
  join: boolean,
  token?: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events/${encodeURIComponent(id)}/attendance`, {
      credentials: 'omit',
      method: join ? 'PUT' : 'DELETE',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: `${sessionCookieName}=${sessionId}`,
      },
      body: JSON.stringify(token ? { token } : {}),
      signal: controller.signal,
    });
    if (response.ok) {
      return { ok: true };
    }
    if (response.status === 401) {
      return { ok: false, message: 'Your session has expired. Sign out and sign in again.' };
    }
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
    return {
      ok: false,
      message: problem?.detail ?? (join ? 'Could not join. Try again.' : 'Could not leave. Try again.'),
    };
  } catch {
    return { ok: false, message: 'Couldn’t reach Quack!. Check your connection.' };
  } finally {
    clearTimeout(timer);
  }
}
