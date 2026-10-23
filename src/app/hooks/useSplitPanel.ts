import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useResizableSplit } from '@/app/hooks/useResizableSplit';

export const MIN_PANEL_HEIGHT = 220;
const MAX_PANEL_HEIGHT = 2400;
// Space left between the drag handle and the bottom of the screen, and
// above the panels' tabs once they're scrolled to the top of it.
const BOTTOM_GAP_PX = 12;
const TOP_GAP_PX = 8;
// Panels that would come out shorter than this ending at the bottom of the
// screen from where they sit (pushed down by the brief and widgets) instead
// fill the screen once scrolled to.
const MIN_FIT_HEIGHT = 360;
// The narrowest two panels get by dragging the divider, in % of the split.
const MIN_HALF_PCT = 5;
// The narrowest a column gets with three panels, so its toolbar and titles
// still fit (Tasks switches to its compact layout). A split too narrow to
// give each column more than this keeps them even, without dividers.
const MIN_COLUMN_PX = 240;

export const PANEL_HEIGHT_KEY_PREFIX = 'tm-home-panel-height';

/** Marks the part of a home panel whose height the split sets (its scrolling list). */
export const PANEL_BODY_ATTR = 'data-panel-body';

const readSavedHeight = (key: string): number | null => {
  try {
    const saved = Number(JSON.parse(window.localStorage.getItem(key) ?? 'null'));
    return Number.isFinite(saved) && saved >= MIN_PANEL_HEIGHT ? Math.min(MAX_PANEL_HEIGHT, saved) : null;
  } catch {
    return null;
  }
};

const writeSavedHeight = (key: string, height: number) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(Math.round(height)));
  } catch {
    // e.g. private browsing storage quota — the height just won't be remembered
  }
};

/** The visible panel bodies' top edge, in px below the split's top (0 when no panel has a body). */
const bodyOffset = (split: HTMLElement): number => {
  const splitTop = split.getBoundingClientRect().top;
  let offset = 0;
  split.querySelectorAll<HTMLElement>(`[${PANEL_BODY_ATTR}]`).forEach(body => {
    if (body.offsetParent === null) return;
    offset = Math.max(offset, body.getBoundingClientRect().top - splitTop);
  });
  return offset;
};

/**
 * The home page's panel split: the panels' width shares (two side by side,
 * or three in columns, each dragged with the dividers between them), and
 * their height. The panels always reach at least the bottom of the screen: from
 * where they sit, or once scrolled to when the brief and widgets above push
 * them too far down (recomputed as the window or the content above them
 * changes). Dragging the bottom handle can only make them longer, and a
 * dragged height is remembered on this device per account.
 *
 * `enabled` is whether the split is on screen, so it can be measured.
 */
export const useSplitPanel = (enabled = true) => {
  const { user } = useAuth();
  const storageKey = `${PANEL_HEIGHT_KEY_PREFIX}:${user?.id ?? 'anon'}`;
  // Where the dividers sit, in % of the split from its left edge, for two and for three panels.
  const [twoDivider, setTwoDivider] = useState(50);
  const [threeDividers, setThreeDividers] = useState<[number, number]>([100 / 3, 200 / 3]);
  const dragging = useRef<{ count: number; index: number } | null>(null);
  const [fillHeightPx, setFillHeightPx] = useState<number | null>(null);
  const [savedHeightPx, setSavedHeightPx] = useState<number | null>(null);
  const [splitWidthPx, setSplitWidthPx] = useState<number | null>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  // Wraps the panels' tabs, the split and the height handle.
  const panelAreaRef = useRef<HTMLDivElement>(null);
  const draggedHeight = useRef<number | null>(null);
  const fillHeight = useRef<number | null>(null);

  // Restored before the first paint, so the panels don't jump. (Read in an
  // effect, not during render: the server has no localStorage.)
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSavedHeightPx(readSavedHeight(storageKey));
  }, [storageKey]);

  // The height that takes the handle to the bottom of the screen.
  useLayoutEffect(() => {
    const split = splitContainerRef.current;
    const area = panelAreaRef.current;
    if (!enabled || !split || !area) return;
    const measure = () => {
      setSplitWidthPx(split.getBoundingClientRect().width);
      const bodies = [...split.querySelectorAll<HTMLElement>(`[${PANEL_BODY_ATTR}]`)].filter(b => b.offsetParent !== null);
      const areaRect = area.getBoundingClientRect();
      const bodyTop = split.getBoundingClientRect().top + bodyOffset(split);
      const bodyBottom = bodies.length > 0 ? Math.max(...bodies.map(b => b.getBoundingClientRect().bottom)) : bodyTop;
      // Around the bodies: the tabs and toolbars above, the padding and handle below.
      const above = Math.max(0, bodyTop - areaRect.top);
      const below = Math.max(0, areaRect.bottom - bodyBottom);
      // A phone's tab bar covers the bottom of the screen.
      const tabBar = document.querySelector<HTMLElement>('.app-tabbar');
      const screenBottom = tabBar && getComputedStyle(tabBar).display !== 'none' ? tabBar.getBoundingClientRect().top : window.innerHeight;
      const fromHere = screenBottom - (bodyTop + window.scrollY) - below - BOTTOM_GAP_PX;
      // Scrolled as far as the page goes, the space after the panels (the
      // page's padding, room for the tab bar) is all that's left below them.
      const after = document.documentElement.scrollHeight - (areaRect.bottom + window.scrollY);
      const scrolledTo = window.innerHeight - TOP_GAP_PX - above - below - Math.max(BOTTOM_GAP_PX, after);
      const fill = Math.round(fromHere >= MIN_FIT_HEIGHT ? fromHere : scrolledTo);
      fillHeight.current = Math.max(MIN_PANEL_HEIGHT, fill);
      setFillHeightPx(fillHeight.current);
    };
    measure();
    window.addEventListener('resize', measure);
    // Content above the panels (the header, the brief, the widgets) changing
    // height moves them: watch everything laid out before them, and the
    // panel area itself.
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    for (let el: Element | null = area; el && el !== document.body; el = el.parentElement) {
      observer?.observe(el);
      for (let prev = el.previousElementSibling; prev; prev = prev.previousElementSibling) observer?.observe(prev);
    }
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
    };
  }, [enabled]);

  const onDividerResize = useCallback((px: number) => {
    const split = splitContainerRef.current;
    const divider = dragging.current;
    if (!split || !divider) return;
    const { width } = split.getBoundingClientRect();
    const pct = (px / width) * 100;
    const min = divider.count === 3 ? Math.min(100 / 3, (MIN_COLUMN_PX / width) * 100) : MIN_HALF_PCT;
    const clamp = (lo: number, hi: number) => Math.min(hi, Math.max(lo, pct));
    if (divider.count === 2) setTwoDivider(clamp(min, 100 - min));
    else if (divider.count === 3) {
      setThreeDividers(([left, right]) =>
        divider.index === 0 ? [clamp(min, right - min), right] : [left, clamp(left + min, 100 - min)]);
    }
  }, []);
  const startDividerDrag = useResizableSplit(
    splitContainerRef as React.RefObject<HTMLElement>,
    { anchor: 'left', onResize: onDividerResize },
  );
  const handleDividerPointerDown = useCallback((count: number, index: number, e: React.PointerEvent) => {
    dragging.current = { count, index };
    startDividerDrag(e);
  }, [startDividerDrag]);

  /** Whether the dividers between `count` panels side by side can be dragged. */
  const dividersMovable = useCallback((count: number): boolean =>
    count !== 3 || splitWidthPx === null || splitWidthPx > 3 * MIN_COLUMN_PX, [splitWidthPx]);

  /** Each panel's share of the split, in %, for `count` panels side by side. */
  const panelWidths = useCallback((count: number): number[] => {
    if (count === 2) return [twoDivider, 100 - twoDivider];
    if (count === 3) {
      if (!dividersMovable(3)) return [100 / 3, 100 / 3, 100 / 3];
      return [threeDividers[0], threeDividers[1] - threeDividers[0], 100 - threeDividers[1]];
    }
    return [100];
  }, [twoDivider, threeDividers, dividersMovable]);

  const onHeightResize = useCallback((px: number) => {
    const split = splitContainerRef.current;
    const height = Math.min(MAX_PANEL_HEIGHT, Math.max(fillHeight.current ?? MIN_PANEL_HEIGHT, px - (split ? bodyOffset(split) : 0)));
    draggedHeight.current = height;
    setSavedHeightPx(height);
  }, []);
  const onHeightResizingChange = useCallback((resizing: boolean) => {
    if (resizing || draggedHeight.current === null) return;
    writeSavedHeight(storageKey, draggedHeight.current);
    draggedHeight.current = null;
  }, [storageKey]);
  const handleHeightSplitterPointerDown = useResizableSplit(
    splitContainerRef as React.RefObject<HTMLElement>,
    { anchor: 'top', onResize: onHeightResize, onResizingChange: onHeightResizingChange },
  );

  return {
    panelWidths,
    dividersMovable,
    panelHeightPx: savedHeightPx === null ? fillHeightPx : Math.max(savedHeightPx, fillHeightPx ?? 0),
    splitContainerRef,
    panelAreaRef,
    handleDividerPointerDown,
    handleHeightSplitterPointerDown,
  };
};
