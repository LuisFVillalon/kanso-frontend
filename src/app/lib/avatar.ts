// Lets the user pick an icon-based profile avatar shown in the navigation rail and
// header. Mirrors theme.ts / pageStyle.ts: cached in localStorage, synced to
// the backend's `avatar` profile column via useProfile.ts. The picker offers 6
// icons from AVATAR_OPTIONS each month; any key in the pool keeps rendering.

import type { LucideIcon } from 'lucide-react';
import {
  Disc3, Sticker, IceCreamCone, Tractor, Origami, Cat, Dog, Bird, Fish, Rabbit, Turtle,
  Snail, Squirrel, PawPrint, Rocket, Sailboat, Bike, Cherry, Apple, Pizza, Cookie,
  Croissant, Coffee, CakeSlice, Leaf, Flower2, Sprout, TreePine, Sun, Moon, Cloud,
  Rainbow, Snowflake, Star, Sparkles, Music, Palette, Gamepad2, Puzzle, Telescope,
  Umbrella, Shell,
} from 'lucide-react';

const PROFILE_AVATAR_STORAGE_KEY = 'tm_profile_avatar';
export const MONTHLY_AVATAR_COUNT = 6;

interface AvatarOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Every avatar that can be saved or rendered. Never remove a key: saved avatars use it. */
export const AVATAR_OPTIONS: AvatarOption[] = [
  { key: 'disc-3', label: 'Disc', icon: Disc3 },
  { key: 'sticker', label: 'Sticker', icon: Sticker },
  { key: 'ice-cream-cone', label: 'Ice cream cone', icon: IceCreamCone },
  { key: 'tractor', label: 'Tractor', icon: Tractor },
  { key: 'origami', label: 'Origami', icon: Origami },
  { key: 'cat', label: 'Cat', icon: Cat },
  { key: 'dog', label: 'Dog', icon: Dog },
  { key: 'bird', label: 'Bird', icon: Bird },
  { key: 'fish', label: 'Fish', icon: Fish },
  { key: 'rabbit', label: 'Rabbit', icon: Rabbit },
  { key: 'turtle', label: 'Turtle', icon: Turtle },
  { key: 'snail', label: 'Snail', icon: Snail },
  { key: 'squirrel', label: 'Squirrel', icon: Squirrel },
  { key: 'paw-print', label: 'Paw print', icon: PawPrint },
  { key: 'rocket', label: 'Rocket', icon: Rocket },
  { key: 'sailboat', label: 'Sailboat', icon: Sailboat },
  { key: 'bike', label: 'Bike', icon: Bike },
  { key: 'cherry', label: 'Cherry', icon: Cherry },
  { key: 'apple', label: 'Apple', icon: Apple },
  { key: 'pizza', label: 'Pizza', icon: Pizza },
  { key: 'cookie', label: 'Cookie', icon: Cookie },
  { key: 'croissant', label: 'Croissant', icon: Croissant },
  { key: 'coffee', label: 'Coffee', icon: Coffee },
  { key: 'cake-slice', label: 'Cake slice', icon: CakeSlice },
  { key: 'leaf', label: 'Leaf', icon: Leaf },
  { key: 'flower-2', label: 'Flower', icon: Flower2 },
  { key: 'sprout', label: 'Sprout', icon: Sprout },
  { key: 'tree-pine', label: 'Pine tree', icon: TreePine },
  { key: 'sun', label: 'Sun', icon: Sun },
  { key: 'moon', label: 'Moon', icon: Moon },
  { key: 'cloud', label: 'Cloud', icon: Cloud },
  { key: 'rainbow', label: 'Rainbow', icon: Rainbow },
  { key: 'snowflake', label: 'Snowflake', icon: Snowflake },
  { key: 'star', label: 'Star', icon: Star },
  { key: 'sparkles', label: 'Sparkles', icon: Sparkles },
  { key: 'music', label: 'Music', icon: Music },
  { key: 'palette', label: 'Palette', icon: Palette },
  { key: 'gamepad-2', label: 'Game controller', icon: Gamepad2 },
  { key: 'puzzle', label: 'Puzzle piece', icon: Puzzle },
  { key: 'telescope', label: 'Telescope', icon: Telescope },
  { key: 'umbrella', label: 'Umbrella', icon: Umbrella },
  { key: 'shell', label: 'Shell', icon: Shell },
];

export function findAvatarOption(key: string | null | undefined): AvatarOption | null {
  return AVATAR_OPTIONS.find(a => a.key === key) ?? null;
}

// mulberry32: a small seeded PRNG, so the month's pick is the same for everyone.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The 6 avatars offered this local calendar month: random, but stable all month. */
export function monthlyAvatarOptions(date: Date = new Date()): AvatarOption[] {
  const random = seededRandom(date.getFullYear() * 12 + date.getMonth());
  const pool = [...AVATAR_OPTIONS];
  for (let i = 0; i < MONTHLY_AVATAR_COUNT; i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, MONTHLY_AVATAR_COUNT);
}

export function getStoredProfileAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
}

export function setStoredProfileAvatar(key: string | null): void {
  if (key) localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, key);
  else localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
}
