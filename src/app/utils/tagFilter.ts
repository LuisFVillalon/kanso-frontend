import { Tag } from '@/app/types/task';

interface Tagged {
  tags: Tag[];
}

/** Every distinct tag carried by `items` (first occurrence wins), sorted by name. */
export function collectItemTags(items: Tagged[]): Tag[] {
  const byId = new Map<number, Tag>();
  for (const item of items) {
    for (const tag of item.tags ?? []) {
      if (!byId.has(tag.id)) byId.set(tag.id, tag);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Keeps the items carrying any of the selected tags — the same "any tag
 * matches" semantics as the dashboard task and note filters. An empty
 * selection keeps everything.
 */
export function filterByAnyTag<T extends Tagged>(items: T[], selectedIds: ReadonlySet<number>): T[] {
  if (selectedIds.size === 0) return items;
  return items.filter(item => (item.tags ?? []).some(tag => selectedIds.has(tag.id)));
}
