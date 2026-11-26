import assert from 'node:assert/strict';
import test from 'node:test';

import {
  campusDayKey,
  campusDayLabelForAnchor,
  campusDayRange,
  campusDayRangeForKey,
  eventCountLabel,
  reanchorCampusDay,
  shiftCampusDay,
} from '../src/campusTime.ts';
import { isLatestMapLoad, mapEventQueryUrl } from '../src/mapQuery.ts';
import { mapQueryFailed, mapQueryStarted } from '../src/mapLoadingState.ts';

const anchor = '2026-11-4';
const yesterday = '2026-11-3';
const tomorrow = '2026-11-5';

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

test('map requests preserve the selected day while the viewport changes', () => {
  const range = campusDayRangeForKey('2026-11-5');
  const first = new URL(mapEventQueryUrl(
    'https://api.example.test/',
    '-74.03,40.74,-74.02,40.75',
    range.from,
    range.to,
  ));
  const second = new URL(mapEventQueryUrl(
    'https://api.example.test/',
    '-74.04,40.73,-74.01,40.76',
    range.from,
    range.to,
  ));

  assert.equal(first.searchParams.get('from'), '2026-11-05T05:00:00.000Z');
  assert.equal(first.searchParams.get('to'), '2026-11-06T05:00:00.000Z');
  assert.equal(second.searchParams.get('from'), first.searchParams.get('from'));
  assert.equal(second.searchParams.get('to'), first.searchParams.get('to'));
  assert.notEqual(second.searchParams.get('bbox'), first.searchParams.get('bbox'));
});

test('stale map generations cannot update the current cache', () => {
  assert.equal(isLatestMapLoad(1, 2), false);
  assert.equal(isLatestMapLoad(2, 2), true);
});
