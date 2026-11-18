import { apiBaseUrl, sessionCookieName } from './config';

export type Announcement = {
  id: string;
  body: string;
  createdAt: string;
};

export async function loadAnnouncements(
  sessionId: string,
  eventId: string,
  token?: string | null,
): Promise<{ ok: true; announcements: Announcement[] } | { ok: false; message: string }> {
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  try {
    const response = await fetch(
      `${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}/announcements${query}`,
      {
        credentials: 'omit',
        headers: { Accept: 'application/json', Cookie: `${sessionCookieName}=${sessionId}` },
      },
    );
    if (!response.ok) {
      return { ok: false, message: 'Couldn’t load announcements.' };
    }
    const page = (await response.json()) as { announcements?: Announcement[] };
    return { ok: true, announcements: page.announcements ?? [] };
  } catch {
    return { ok: false, message: 'Couldn’t load announcements.' };
  }
}

export async function postAnnouncement(
  sessionId: string,
  eventId: string,
  body: string,
): Promise<{ ok: true; announcement: Announcement } | { ok: false; message: string }> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/events/${encodeURIComponent(eventId)}/announcements`, {
      credentials: 'omit',
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Cookie: `${sessionCookieName}=${sessionId}`,
      },
      body: JSON.stringify({ body }),
    });
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { detail?: string } | null;
      return { ok: false, message: problem?.detail ?? 'Couldn’t post the announcement.' };
    }
    return { ok: true, announcement: (await response.json()) as Announcement };
  } catch {
    return { ok: false, message: 'Couldn’t post the announcement.' };
  }
}
