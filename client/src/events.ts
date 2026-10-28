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

// Server field name to its message, from the 422 INVALID_EVENT `errors` list.
export type FieldErrors = Partial<Record<string, string>>;

export async function createEvent(
  sessionId: string,
  event: NewEvent,
): Promise<{ ok: true } | { ok: false; message: string; fieldErrors: FieldErrors }> {
  // Android's default client has no read timeout, so a stalled request would leave Post stuck.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events`, {
      signal: controller.signal,
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
      return { ok: false, message: 'Your session has expired. Sign out and sign in again.', fieldErrors: {} };
    }
    const problem = (await response.json().catch(() => null)) as {
      detail?: string;
      errors?: { field?: string; detail?: string }[];
    } | null;
    const fieldErrors: FieldErrors = {};
    for (const { field, detail } of problem?.errors ?? []) {
      if (field && detail && !fieldErrors[field]) {
        fieldErrors[field] = detail;
      }
    }
    return { ok: false, message: problem?.detail ?? 'Could not post the event. Try again.', fieldErrors };
  } catch {
    return { ok: false, message: 'Could not reach Quack!. Check your connection and try again.', fieldErrors: {} };
  } finally {
    clearTimeout(timer);
  }
}
