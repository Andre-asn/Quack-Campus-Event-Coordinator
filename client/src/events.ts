import { apiBaseUrl, sessionCookieName } from './config';

export type NewEvent = {
  title: string;
  description: string;
  category: string;
  latitude: number;
  longitude: number;
  locationLabel: string;
  startsAt: string;
  endsAt: string;
  visibility: 'public' | 'link_only';
};

export type CreatedEvent = {
  id: string;
  visibility: 'public' | 'link_only';
  shareToken: string | null;
};

// The token stays in the fragment, so loading this page does not send it to the server.
export function eventShareLink(id: string, shareToken: string): string {
  return `${apiBaseUrl}/share/events/${id}#token=${shareToken}`;
}

// quack://events/{id}?token=... and the Android intent URL both carry the id this way.
export function eventFromLink(url: string): { id: string; token: string } | null {
  const match = url.match(/events\/([0-9a-fA-F-]{36})\?token=([0-9a-fA-F-]{36})/);
  if (!match) {
    return null;
  }
  return { id: match[1], token: match[2] };
}

// Server field name to its message, from the 422 INVALID_EVENT `errors` list.
export type FieldErrors = Partial<Record<string, string>>;

export async function createEvent(
  sessionId: string,
  event: NewEvent,
): Promise<{ ok: true; event: CreatedEvent } | { ok: false; message: string; fieldErrors: FieldErrors }> {
  // Android's default client has no read timeout, so a stalled request would leave Post stuck.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events`, {
      // The session goes in our own Cookie header; see the note in auth.ts.
      credentials: 'omit',
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
      const created = (await response.json()) as Partial<CreatedEvent>;
      return {
        ok: true,
        event: {
          id: created.id ?? '',
          visibility: created.visibility === 'link_only' ? 'link_only' : 'public',
          shareToken: created.shareToken ?? null,
        },
      };
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
