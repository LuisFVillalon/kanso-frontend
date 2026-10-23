// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MoodMetric } from '@/app/utils/calendarReport';
import ReportMoodRelationChart from './ReportMoodRelationChart';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const points = [0, 1, 2, 3, 4].map(v => ({ dateStr: `2026-10-0${v + 1}`, value: v, mood: 3 }));

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const renderScatter = (metric: MoodMetric) =>
  act(() => root.render(<ReportMoodRelationChart metric={metric} view="scatter" points={points} items={[]} byWeek={false} />));

const svgTexts = () => [...host.querySelectorAll('svg text')].map(t => t.textContent);

describe('ReportMoodRelationChart scatter', () => {
  it('titles both axes and marks each labelled value with a tick', () => {
    renderScatter('tasks');
    const texts = svgTexts();
    expect(texts).toContain('Your mood that day');
    expect(texts).toContain('Tasks you finished that day');
    expect(texts).toContain('fewer');
    expect(texts).toContain('more');
    expect(texts.some(t => t?.includes('→'))).toBe(false);
    // One tick per labelled value, plus the axis line itself.
    const tickLabels = ['0', '1', '2', '3', '4'].filter(n => texts.includes(n));
    expect(tickLabels).toHaveLength(5);
    expect(host.querySelectorAll('svg g > line')).toHaveLength(5 + 5);
    expect(host.textContent).toContain('Each dot is one day. The line shows your typical mood on days with fewer vs more tasks finished.');
  });

  it('names the unit for note time and habits', () => {
    renderScatter('notes');
    expect(svgTexts()).toContain('Minutes in notes that day');
    expect(host.textContent).toContain('fewer vs more time in notes.');
    renderScatter('habits');
    expect(svgTexts()).toContain('Habits checked off that day');
    expect(host.textContent).toContain('fewer vs more habits checked off.');
  });
});
