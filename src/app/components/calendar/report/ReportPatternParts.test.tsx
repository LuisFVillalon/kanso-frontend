// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analysePatterns, type PatternDay } from '@/app/utils/patterns';
import { PatternLine } from './ReportPatternParts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 24 work days with 0, 60, 120 or 165 minutes in events in turn, so the sides read "2h 45m+".
const days: PatternDay[] = Array.from({ length: 24 }, (_, i) => ({
  day: `2026-10-${String(i + 1).padStart(2, '0')}`,
  mood: i % 4 >= 2 ? 2 : 4,
  energy: null,
  stress: null,
  off: false,
  tags: new Set<string>(),
  moments: new Set<string>(),
  activity: { tasks: 0, notes: 0, habits: 0, events: [0, 60, 165, 165][i % 4] },
}));

let host: HTMLDivElement;
let root: Root;
let chartWidth = 300;
const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');

beforeEach(() => {
  // A 375px phone leaves the chart about 300px.
  chartWidth = 300;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => chartWidth });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
});

describe('PatternLine on a phone', () => {
  it('wraps the Events side labels instead of cutting them off', () => {
    const analysis = analysePatterns(days, new Map(), 'x');
    const events = analysis.rows.find(r => r.key === 'activity:events')!;
    expect(events.on).toBe('days with 2h 45m+ in events');
    act(() => root.render(<PatternLine row={events} feeling="mood" days={analysis.days} />));
    const text = host.querySelector('svg')!.textContent!;
    expect(text).not.toContain('…');
    expect(text.replace(/\s+/g, ' ')).toContain('Days with 2h 45m+ in events');
    expect(text.replace(/\s+/g, ' ')).toContain('Days with under 2h 45m');
  });

  it('keeps every line of the Events side labels inside the chart on a 320px phone', () => {
    // A 320px phone leaves the chart 280px; bold 11.5px text runs about 7px a character.
    chartWidth = 280;
    const analysis = analysePatterns(days, new Map(), 'x');
    const events = analysis.rows.find(r => r.key === 'activity:events')!;
    act(() => root.render(<PatternLine row={events} feeling="mood" days={analysis.days} />));
    const svg = host.querySelector('svg')!;
    expect(svg.textContent!.replace(/\s+/g, ' ')).toContain('Days with 2h 45m+ in events');
    expect(svg.textContent).not.toContain('…');
    for (const t of Array.from(svg.querySelectorAll('tspan'))) {
      const half = (t.textContent!.trim().length * 7) / 2;
      const x = Number(t.getAttribute('x'));
      expect(x + half).toBeLessThanOrEqual(chartWidth);
      expect(x - half).toBeGreaterThanOrEqual(0);
    }
  });
});
