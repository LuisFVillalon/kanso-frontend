// Lets the user pick an icon-based profile avatar shown in the sidebar and
// header. Mirrors theme.ts / pageStyle.ts: cached in localStorage, synced to
// the backend's `avatar` profile column via useProfile.ts.

import type { LucideIcon } from 'lucide-react';
import { Disc3, Sticker, IceCreamCone, Tractor, Origami } from 'lucide-react';

const PROFILE_AVATAR_STORAGE_KEY = 'tm_profile_avatar';

interface AvatarOption {
  key: string;
  label: string;
  icon: LucideIcon;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { key: 'disc-3', label: 'Disc', icon: Disc3 },
  { key: 'sticker', label: 'Sticker', icon: Sticker },
  { key: 'ice-cream-cone', label: 'Ice cream cone', icon: IceCreamCone },
  { key: 'tractor', label: 'Tractor', icon: Tractor },
  { key: 'origami', label: 'Origami', icon: Origami },
];

export function getStoredProfileAvatar(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PROFILE_AVATAR_STORAGE_KEY);
}

export function setStoredProfileAvatar(key: string | null): void {
  if (key) localStorage.setItem(PROFILE_AVATAR_STORAGE_KEY, key);
  else localStorage.removeItem(PROFILE_AVATAR_STORAGE_KEY);
}
