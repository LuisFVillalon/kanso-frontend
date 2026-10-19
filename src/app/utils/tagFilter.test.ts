import { describe, expect, it } from 'vitest';
import { collectItemTags, filterByAnyTag } from './tagFilter';

const work = { id: 1, name: 'Work', color: '#f00' };
const home = { id: 2, name: 'Home', color: '#0f0' };
const old = { id: 3, name: 'Archived tag', color: '#00f', archived_at: '2026-01-01T00:00:00Z' };

const items = [
  { id: 10, tags: [work, old] },
  { id: 11, tags: [home] },
  { id: 12, tags: [] },
  { id: 13, tags: [work, home] },
];

describe('collectItemTags', () => {
  it('returns each distinct tag once, sorted by name', () => {
    expect(collectItemTags(items).map(t => t.id)).toEqual([3, 2, 1]);
  });

  it('keeps archived tags', () => {
    expect(collectItemTags(items)).toContainEqual(old);
  });

  it('returns nothing for untagged items', () => {
    expect(collectItemTags([{ tags: [] }])).toEqual([]);
  });
});

describe('filterByAnyTag', () => {
  it('keeps every item when nothing is selected', () => {
    expect(filterByAnyTag(items, new Set())).toBe(items);
  });

  it('keeps items carrying any selected tag', () => {
    expect(filterByAnyTag(items, new Set([1])).map(i => i.id)).toEqual([10, 13]);
    expect(filterByAnyTag(items, new Set([2, 3])).map(i => i.id)).toEqual([10, 11, 13]);
  });

  it('returns nothing when no item carries a selected tag', () => {
    expect(filterByAnyTag(items, new Set([99]))).toEqual([]);
  });
});
