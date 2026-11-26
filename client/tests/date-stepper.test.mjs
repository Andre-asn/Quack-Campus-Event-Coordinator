import assert from 'node:assert/strict';
import test from 'node:test';

import {
  campusDayKey,
  campusDayLabelForAnchor,
  campusDayRange,
  eventCountLabel,
  reanchorCampusDay,
  shiftCampusDay,
} from '../src/campusTime.ts';
import { loadMapEvents } from '../src/mapEvents.ts';
import { mapQueryFailed, mapQueryStarted } from '../src/mapLoadingState.ts';

const anchor = '2026-11-4';
const yesterday = '2026-11-3';
const tomorrow = '2026-11-5';
const RealDate = globalThis.Date;

function freezeTime(iso) {
  const fixedMillis = RealDate.parse(iso);
  class FixedDate extends RealDate {
    constructor(...args) {
      super(...(args.length === 0 ? [fixedMillis] : args));
    }

    static now() {
      return fixedMillis;
    }
  }
  globalThis.Date = FixedDate;
  return () => { globalThis.Date = RealDate; };
}

function jsonResponse(body, etag) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ETag: etag },
  });
}

function event(id) {
  return {
    id,
    title: id,
    category: 'other',
    latitude: 40.744,
    longitude: -74.025,
    startsAt: '2026-11-05T12:00:00Z',
    locationLabel: 'Campus',
    attendeeCount: 0,
    visibility: 'public',
    host: { displayName: 'Host', avatarUrl: null },
  };
}

test('date controls label the selected campus day and clamp both arrow boundaries', () => {
  assert.equal(campusDayLabelForAnchor(yesterday, anchor), 'Yesterday');
  assert.equal(campusDayLabelForAnchor(anchor, anchor), 'Today');
  assert.equal(campusDayLabelForAnchor(tomorrow, anchor), 'Tomorrow');
  assert.deepEqual({
    label: campusDayLabelForAnchor(yesterday, anchor),
    canGoBack: yesterday !== shiftCampusDay(anchor, -1),
    canGoForward: yesterday !== shiftCampusDay(anchor, 1),
  }, {
    label: 'Yesterday', canGoBack: false, canGoForward: true,
  });
  assert.deepEqual({
    label: campusDayLabelForAnchor(tomorrow, anchor),
    canGoBack: tomorrow !== shiftCampusDay(anchor, -1),
    canGoForward: tomorrow !== shiftCampusDay(anchor, 1),
  }, {
    label: 'Tomorrow', canGoBack: true, canGoForward: false,
  });
});

test('reanchor updates controls at campus midnight even when the selected date stays valid', () => {
  const beforeMidnight = new Date('2026-11-05T04:59:59Z');
  const afterMidnight = new Date('2026-11-05T05:00:01Z');
  assert.equal(campusDayKey(beforeMidnight), '2026-11-4');
  assert.deepEqual(reanchorCampusDay('2026-11-6', afterMidnight), {
    anchorDay: '2026-11-5', selectedDay: '2026-11-6',
  });
});

test('campus midnight remains New York based across the DST transition', () => {
  const range = campusDayRange(new Date('2026-03-08T12:00:00Z'));
  assert.equal(range.from, '2026-03-08T05:00:00.000Z');
  assert.equal(range.to, '2026-03-09T04:00:00.000Z');
});

test('loading and failed queries do not expose a zero-event count', () => {
  assert.deepEqual(mapQueryStarted({ loaded: true, loadError: false }, true), {
    loaded: false, loadError: false,
  });
  assert.deepEqual(mapQueryFailed(), { loaded: false, loadError: true });
});

test('event counts use the selected campus-day label and preserve grammar', () => {
  assert.equal(eventCountLabel(1, 'Yesterday'), '1 event yesterday');
  assert.equal(eventCountLabel(2, 'Tomorrow'), '2 events tomorrow');
});

test('loadMapEvents uses fixed campus-timezone ranges for yesterday, today, and tomorrow', async () => {
  const restoreDate = freezeTime('2026-11-05T17:00:00Z');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return jsonResponse({ events: [] }, 'etag-' + calls.length);
  };
  try {
    for (const [selectedDay, expectedFrom, expectedTo] of [
      ['2026-11-4', '2026-11-04T05:00:00.000Z', '2026-11-05T05:00:00.000Z'],
      ['2026-11-5', '2026-11-05T05:00:00.000Z', '2026-11-06T05:00:00.000Z'],
      ['2026-11-6', '2026-11-06T05:00:00.000Z', '2026-11-07T05:00:00.000Z'],
    ]) {
      await loadMapEvents('fixed-date-session', '-74.03,40.74,-74.02,40.75', selectedDay);
      const request = calls.at(-1).url;
      assert.equal(request.searchParams.get('from'), expectedFrom);
      assert.equal(request.searchParams.get('to'), expectedTo);
    }
  } finally {
    globalThis.fetch = originalFetch;
    restoreDate();
  }
});

test('loadMapEvents changes only bbox when the selected day is unchanged', async () => {
  const restoreDate = freezeTime('2026-11-05T17:00:00Z');
  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: new URL(url), init });
    return jsonResponse({ events: [] }, 'etag-viewport-' + calls.length);
  };
  try {
    await loadMapEvents('viewport-session', '-74.03,40.74,-74.02,40.75', '2026-11-5');
    await loadMapEvents('viewport-session', '-74.04,40.73,-74.01,40.76', '2026-11-5');
    const first = calls[0].url;
    const second = calls[1].url;
    assert.notEqual(second.searchParams.get('bbox'), first.searchParams.get('bbox'));
    assert.equal(second.searchParams.get('from'), first.searchParams.get('from'));
    assert.equal(second.searchParams.get('to'), first.searchParams.get('to'));
  } finally {
    globalThis.fetch = originalFetch;
    restoreDate();
  }
});

test('newer different-day responses protect cache and supply their ETag to a 304 request', async () => {
  const restoreDate = freezeTime('2026-11-05T17:00:00Z');
  const originalFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = (url, init) => new Promise((resolve) => {
    pending.push({ url: new URL(url), init, resolve });
  });
  try {
    const older = loadMapEvents('different-day-session', '-74.03,40.74,-74.02,40.75', '2026-11-4');
    const newer = loadMapEvents('different-day-session', '-74.03,40.74,-74.02,40.75', '2026-11-6');
    assert.equal(pending.length, 2);
    pending[1].resolve(jsonResponse({ events: [event('new-day')] }, 'etag-new-day'));
    assert.deepEqual((await newer).events.map(({ id }) => id), ['new-day']);
    pending[0].resolve(jsonResponse({ events: [event('old-day')] }, 'etag-old-day'));
    await older;

    let request;
    globalThis.fetch = async (url, init) => {
      request = { url: new URL(url), init };
      return new Response(null, { status: 304 });
    };
    const cached = await loadMapEvents('different-day-session', '-74.03,40.74,-74.02,40.75', '2026-11-6');
    assert.equal(request.init.headers['If-None-Match'], 'etag-new-day');
    assert.deepEqual(cached.events.map(({ id }) => id), ['new-day']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDate();
  }
});

test('overlapping requests for the same query retain the newer cache entry', async () => {
  const restoreDate = freezeTime('2026-11-05T17:00:00Z');
  const originalFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = (url, init) => new Promise((resolve) => {
    pending.push({ url: new URL(url), init, resolve });
  });
  try {
    const older = loadMapEvents('same-query-session', '-74.03,40.74,-74.02,40.75', '2026-11-5');
    const newer = loadMapEvents('same-query-session', '-74.03,40.74,-74.02,40.75', '2026-11-5');
    assert.equal(pending.length, 2);
    pending[1].resolve(jsonResponse({ events: [event('new-query')] }, 'etag-new-query'));
    assert.deepEqual((await newer).events.map(({ id }) => id), ['new-query']);
    pending[0].resolve(jsonResponse({ events: [event('old-query')] }, 'etag-old-query'));
    await older;

    let request;
    globalThis.fetch = async (url, init) => {
      request = { url: new URL(url), init };
      return new Response(null, { status: 304 });
    };
    const cached = await loadMapEvents('same-query-session', '-74.03,40.74,-74.02,40.75', '2026-11-5');
    assert.equal(request.init.headers['If-None-Match'], 'etag-new-query');
    assert.deepEqual(cached.events.map(({ id }) => id), ['new-query']);
  } finally {
    globalThis.fetch = originalFetch;
    restoreDate();
  }
});
