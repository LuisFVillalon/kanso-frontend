// Lets the user pick the notebook page ruling shown behind the whole app
// (see the `[data-page-style]` selectors in globals.css). Mirrors the accent
// color picker in theme.ts: stored in localStorage, applied via a
// document-level attribute so plain CSS handles the actual pattern.

const PAGE_STYLE_STORAGE_KEY = 'tm_page_style';

// The 5mm graph ruling defined by default in globals.css — offered as the "reset" option.
export const DEFAULT_PAGE_STYLE = 'graph';

interface PageStyleOption {
  key: string;
  label: string;
  description: string;
}

export const PAGE_STYLES: PageStyleOption[] = [
  { key: 'graph',     label: 'Graph',         description: '5mm grid ruling — the notebook default.' },
  { key: 'dot',       label: 'Dot grid',      description: 'Bullet-journal dot matrix.' },
  { key: 'college',   label: 'College rule',  description: 'Narrow-spaced horizontal lines.' },
  { key: 'wide',      label: 'Wide rule',     description: 'Wider-spaced horizontal lines.' },
  { key: 'isometric', label: 'Isometric dot', description: 'Staggered dots for sketching in 3D.' },
  { key: 'blank',     label: 'Blank page',    description: 'No ruling — plain cream paper.' },
];

export function applyPageStyle(key: string): void {
  document.documentElement.setAttribute('data-page-style', key);
}

export function getStoredPageStyle(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(PAGE_STYLE_STORAGE_KEY);
}

export function setStoredPageStyle(key: string): void {
  localStorage.setItem(PAGE_STYLE_STORAGE_KEY, key);
  applyPageStyle(key);
}

// Reverts to the notebook's default graph ruling and forgets the override.
export function resetPageStyle(): void {
  localStorage.removeItem(PAGE_STYLE_STORAGE_KEY);
  applyPageStyle(DEFAULT_PAGE_STYLE);
}
