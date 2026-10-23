import { describe, expect, it } from 'vitest';
import { AVATAR_OPTIONS, MONTHLY_AVATAR_COUNT, findAvatarOption, monthlyAvatarOptions } from './avatar';

const keys = (d: Date) => monthlyAvatarOptions(d).map(o => o.key);

describe('monthlyAvatarOptions', () => {
  it('offers 6 distinct pool icons', () => {
    const picked = keys(new Date(2026, 9, 23));
    expect(MONTHLY_AVATAR_COUNT).toBe(6);
    expect(picked).toHaveLength(6);
    expect(new Set(picked).size).toBe(6);
    picked.forEach(k => expect(findAvatarOption(k)).not.toBeNull());
  });

  it('is stable all month and changes on the 1st', () => {
    expect(keys(new Date(2026, 9, 1))).toEqual(keys(new Date(2026, 9, 31, 23, 59)));
    expect(keys(new Date(2026, 10, 1))).not.toEqual(keys(new Date(2026, 9, 31)));
  });

  it('rotates through the pool over the years', () => {
    const seen = new Set<string>();
    for (let m = 0; m < 48; m++) keys(new Date(2026, m, 1)).forEach(k => seen.add(k));
    expect(seen.size).toBeGreaterThan(AVATAR_OPTIONS.length / 2);
  });
});

describe('findAvatarOption', () => {
  it('still finds the original five avatars', () => {
    for (const k of ['disc-3', 'sticker', 'ice-cream-cone', 'tractor', 'origami']) {
      expect(findAvatarOption(k)?.key).toBe(k);
    }
    expect(findAvatarOption('nope')).toBeNull();
    expect(findAvatarOption(null)).toBeNull();
  });

  it('has unique keys', () => {
    expect(new Set(AVATAR_OPTIONS.map(o => o.key)).size).toBe(AVATAR_OPTIONS.length);
  });
});
