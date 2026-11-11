import { apiBaseUrl, sessionCookieName } from './config';
import { campusDayRange } from './campusTime';

export type MapEvent = {
  id: string;
  title: string;
  category: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  locationLabel: string;
  attendeeCount: number;
  visibility: 'public' | 'link_only';
  shareToken?: string | null;
  host: {
    displayName: string;
    avatarUrl: string | null;
  };
};

export type MapEventPage = {
  events: MapEvent[];
  nextCursor?: string;
};

export type Spot = {
  latitude: number;
  longitude: number;
  events: MapEvent[];
};

let cached: { sessionId: string; url: string; etag: string; events: MapEvent[] } | null = null;
let loadGeneration = 0;

// The first page is included. Four more pages is 500 events, then the map stops.
const maxExtraPages = 4;

export function groupBySpot(events: MapEvent[]): Spot[] {
  const groups = new Map<string, MapEvent[]>();
  for (const event of events) {
    const key = `${event.latitude.toFixed(5)},${event.longitude.toFixed(5)}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }
  return [...groups.values()].map((eventsAtSpot) => ({
    latitude: eventsAtSpot[0].latitude,
    longitude: eventsAtSpot[0].longitude,
    events: eventsAtSpot,
  }));
}

export async function loadMapEvents(
  sessionId: string,
  bbox: string,
  signal?: AbortSignal,
): Promise<{ events: MapEvent[]; unchanged: boolean }> {
  const generation = ++loadGeneration;
  if (cached && cached.sessionId !== sessionId) {
    cached = null;
  }
  const { from, to } = campusDayRange(new Date());
  const url = `${apiBaseUrl}/api/v1/events?bbox=${encodeURIComponent(bbox)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Cookie: `${sessionCookieName}=${sessionId}`,
  };
  const entry = cached?.sessionId === sessionId && cached.url === url ? cached : null;
  if (entry) {
    headers['If-None-Match'] = entry.etag;
  }
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), 15_000);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    // The session goes in our own Cookie header; see the note in auth.ts.
    const response = await fetch(url, { credentials: 'omit', headers, signal: timeout.signal });
    if (response.status === 304 && entry) {
      return { events: entry.events, unchanged: false };
    }
    if (!response.ok) {
      throw new Error(`Map query failed (${response.status})`);
    }
    const nextEtag = response.headers.get('ETag');
    const page = (await response.json()) as MapEventPage;
    const events = [...(page.events ?? [])];
    let cursor = page.nextCursor;
    let extraPages = 0;
    while (cursor && extraPages < maxExtraPages) {
      extraPages += 1;
      const next = await fetch(`${url}&cursor=${encodeURIComponent(cursor)}`, {
        credentials: 'omit',
        headers: { Accept: 'application/json', Cookie: headers.Cookie },
        signal: timeout.signal,
      });
      if (!next.ok) {
        throw new Error(`Map query failed (${next.status})`);
      }
      const nextPage = (await next.json()) as MapEventPage;
      events.push(...(nextPage.events ?? []));
      cursor = nextPage.nextCursor;
    }
    if (generation === loadGeneration) {
      cached = nextEtag && !page.nextCursor ? { sessionId, url, etag: nextEtag, events } : null;
    }
    return { events, unchanged: false };
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    if (timeout.signal.aborted) {
      throw new Error('Map query timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}
