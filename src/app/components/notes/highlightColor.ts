import { useSyncExternalStore } from 'react';

export const HIGHLIGHT_COLORS = [
  { color: '#fef08a', label: 'Yellow' },
  { color: '#bbf7d0', label: 'Green' },
  { color: '#bae6fd', label: 'Blue' },
  { color: '#fbcfe8', label: 'Pink' },
  { color: '#fed7aa', label: 'Orange' },
] as const;

export const DEFAULT_HIGHLIGHT_COLOR: string = HIGHLIGHT_COLORS[0].color;

/**
 * The highlighter's color: the last one picked, shared by every note opened
 * in this app session. It lives in memory only, so a reload starts on yellow.
 */
let highlightColor = DEFAULT_HIGHLIGHT_COLOR;
const listeners = new Set<() => void>();

export const getHighlightColor = () => highlightColor;

export const setHighlightColor = (color: string) => {
  if (color === highlightColor) return;
  highlightColor = color;
  listeners.forEach(listener => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const useHighlightColor = () =>
  useSyncExternalStore(subscribe, getHighlightColor, () => DEFAULT_HIGHLIGHT_COLOR);
