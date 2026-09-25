'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { toggleColorScheme } from '@/app/lib/colorScheme';

interface ThemeToggleProps {
  /** `sidebar`: a main-menu row (icon + label, icon-only when collapsed). `icon`: a bare header button. */
  variant?: 'sidebar' | 'icon';
  collapsed?: boolean;
}

/**
 * Flips between light and dark, overriding the OS setting (same as
 * kanso-landing's header toggle). Both icons and labels render and the dark:
 * variant picks one, so the server markup never depends on the theme.
 */
const ThemeToggle: React.FC<ThemeToggleProps> = ({ variant = 'icon', collapsed = false }) => {
  if (variant === 'icon') {
    return (
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
  }

  return (
    <button
      type="button"
      onClick={toggleColorScheme}
      className={`sidebar-item ${collapsed ? 'justify-center' : ''}`}
      title={collapsed ? 'Toggle dark mode' : undefined}
      aria-label="Toggle dark mode"
    >
      <span className="icon-dot">
        <Moon aria-hidden className="w-4 h-4 dark:hidden" />
        <Sun aria-hidden className="hidden w-4 h-4 dark:block" />
      </span>
      {!collapsed && (
        <span className="flex-1 text-left truncate">
          <span className="dark:hidden">Dark mode</span>
          <span className="hidden dark:inline">Light mode</span>
        </span>
      )}
    </button>
  );
};

export default ThemeToggle;
