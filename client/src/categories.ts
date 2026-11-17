// The one client copy of the category list. Matches the server (EventService.CATEGORIES) and the
// events_category_check constraint; the final list is still open in CLAUDE.md, so change it here only.
export const categories = ['study', 'food', 'sports', 'games', 'movie', 'music', 'other'] as const;
export type Category = (typeof categories)[number];

export function categoryLabel(category: string): string {
  return category[0].toUpperCase() + category.slice(1);
}
