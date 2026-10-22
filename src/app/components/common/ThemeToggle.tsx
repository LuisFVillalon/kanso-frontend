'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { toggleColorScheme } from '@/app/lib/colorScheme';

/**
 * Flips between light and dark, overriding the OS setting (same as
 * kanso-landing's header toggle). Both icons render and the dark: variant
 * picks one, so the server markup never depends on the theme. Signed-in
 * pages set the theme from the account menu's Appearance control instead.
 */
const ThemeToggle: React.FC = () => (
  <button
    type="button"
    onClick={toggleColorScheme}
    aria-label="Toggle dark mode"
    title="Toggle dark mode"
    className="btn btn-outline border-transparent px-3"
  >
    <Moon aria-hidden className="size-4 dark:hidden" />
    <Sun aria-hidden className="hidden size-4 dark:block" />
  </button>
);

export default ThemeToggle;
