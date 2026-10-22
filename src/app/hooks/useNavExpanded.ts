'use client';

import { usePersistedPref } from '@/app/hooks/usePersistedPref';

export const NAV_EXPANDED_KEY = 'tm-nav-expanded';
const isBoolean = (c: unknown): c is boolean => typeof c === 'boolean';

/** Whether the nav rail is expanded (224px, with keyboard hints), remembered on this device. */
export const useNavExpanded = () => usePersistedPref<boolean>(NAV_EXPANDED_KEY, false, isBoolean);
