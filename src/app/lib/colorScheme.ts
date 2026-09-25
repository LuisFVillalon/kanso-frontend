// Light/dark mode — same mechanism as kanso-landing's lib/theme.ts. With
// nothing saved, the OS setting applies (the prefers-color-scheme block in
// globals.css). The toggle (components/common/ThemeToggle.tsx) pins a theme
// by stamping data-theme on <html> and remembering it in localStorage.
// Local-only: not synced to the backend profile.

export type ColorScheme = 'light' | 'dark';

/** localStorage key for the pinned theme. */
export const COLOR_SCHEME_KEY = 'tm_theme';

/** Browser chrome color per theme; matches --tm-bg in globals.css. */
export const COLOR_SCHEME_BG: Record<ColorScheme, string> = { light: '#F6F5F4', dark: '#191817' };

/**
 * Anti-flash script: applies the saved theme to <html> before first paint.
 * With nothing saved, data-theme stays unset and the OS setting applies.
 */
export const COLOR_SCHEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(COLOR_SCHEME_KEY)});if(t!=="light"&&t!=="dark")return;document.documentElement.dataset.theme=t;var c=${JSON.stringify(COLOR_SCHEME_BG)}[t];document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",c)})}catch(e){}})()`;

/** The theme currently showing: the pinned one, else the OS setting. */
export function currentColorScheme(): ColorScheme {
  const pinned = document.documentElement.dataset.theme;
  if (pinned === 'light' || pinned === 'dark') return pinned;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Flips between light and dark, overriding the OS setting, and remembers the choice. */
export function toggleColorScheme(): void {
  const next: ColorScheme = currentColorScheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', COLOR_SCHEME_BG[next]));
  try {
    localStorage.setItem(COLOR_SCHEME_KEY, next);
  } catch {
    // Storage blocked (private mode): the choice lasts until reload.
  }
}
