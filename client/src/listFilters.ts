import type { MapEvent } from './mapEvents';

// Matches the server's category list (EventService.CATEGORIES).
export const categories = ['study', 'food', 'sports', 'games', 'movie', 'music', 'other'] as const;
export type Category = (typeof categories)[number];

// The map query only loads today, so every window is within today. Other days are the date stepper (F8).
export const timeWindows = ['all', 'started', 'soon', 'later'] as const;
export type TimeWindow = (typeof timeWindows)[number];

// Short enough that all four fit in one segmented control on a 360pt phone.
export const timeWindowLabels: Record<TimeWindow, string> = {
  all: 'Any time',
  started: 'Started',
  soon: 'Next hour',
  later: 'Later',
};

// What screen readers say: the full wording from #77.
export const timeWindowAccessibilityLabels: Record<TimeWindow, string> = {
  all: 'Any time today',
  started: 'Already started',
  soon: 'Starting within an hour',
  later: 'Later today',
};

export type EventFilter = {
  // Empty means every category.
  categories: Category[];
  time: TimeWindow;
};

export const noFilter: EventFilter = { categories: [], time: 'all' };

const HOUR_MS = 60 * 60 * 1000;

export function isFiltering(filter: EventFilter): boolean {
  return filter.categories.length > 0 || filter.time !== 'all';
}

export function categoryLabel(category: string): string {
  return category[0].toUpperCase() + category.slice(1);
}

function inWindow(startsAt: number, window: TimeWindow, now: number): boolean {
  switch (window) {
    case 'all':
      return true;
    case 'started':
      return startsAt <= now;
    case 'soon':
      return startsAt > now && startsAt <= now + HOUR_MS;
    case 'later':
      return startsAt > now + HOUR_MS;
  }
}

// Filters the events already loaded for the viewport; no request is made.
export function applyFilter(events: MapEvent[], filter: EventFilter, now: Date): MapEvent[] {
  const time = now.getTime();
  return events.filter((event) =>
    (filter.categories.length === 0 || filter.categories.includes(event.category as Category))
    && inWindow(new Date(event.startsAt).getTime(), filter.time, time));
}
