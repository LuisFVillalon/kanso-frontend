// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SplitSides } from '@/app/utils/calendarReport';
import { MoodLine, MoodLinePlaceholder } from './ReportMoodAnswer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const sides: SplitSides = { low: '0–1 habits', high: '2+ habits', lowDays: 12, highDays: 18 };

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

const render = (node: React.ReactNode) => act(() => root.render(node));

/** The answer's line, not the Rough→Great grid behind it. */
const answerLine = () => {
  const lines = [...host.querySelectorAll('svg[role="img"] > line')].filter(l => l.getAttribute('stroke-dasharray') !== '2 4');
  expect(lines).toHaveLength(1);
  return lines[0];
};
const faces = () => host.querySelectorAll('svg[viewBox="0 0 24 24"]:not(.lucide)');
const label = () => host.querySelector('svg[role="img"]')?.getAttribute('aria-label');

describe('MoodLine', () => {
  it('slopes up from face to face for a higher answer', () => {
    render(<MoodLine kind="higher" sides={sides} lowAverage={1.5} highAverage={4} />);
    const line = answerLine();
    expect(Number(line.getAttribute('y2'))).toBeLessThan(Number(line.getAttribute('y1')));
    expect(faces()).toHaveLength(2);
    expect(host.querySelector('.lucide-cloud-sun')).toBeNull();
    expect(label()).toBe('Typical mood: Rough–Low on days with 0–1 habits, Good on days with 2+ habits');
  });

  it('slopes down for a lower answer', () => {
    render(<MoodLine kind="lower" sides={sides} lowAverage={4} highAverage={2} />);
    const line = answerLine();
    expect(Number(line.getAttribute('y2'))).toBeGreaterThan(Number(line.getAttribute('y1')));
    expect(faces()).toHaveLength(2);
  });

  it('stays flat at the usual mood with a sun behind a cloud at each end for “about the same”, even when the halves differ', () => {
    render(<MoodLine kind="same" sides={sides} lowAverage={2} highAverage={4} />);
    const line = answerLine();
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
    expect(line.getAttribute('stroke-dasharray')).toBeNull();
    expect(host.querySelectorAll('.lucide-cloud-sun')).toHaveLength(2);
    expect(faces()).toHaveLength(0);
    // 12 days at 2 and 18 at 4 average 3.2, Okay to the nearest half.
    expect(label()).toBe('Typical mood: about the same, Okay, on days with 0–1 habits and on days with 2+ habits');
  });
});

describe('MoodLinePlaceholder', () => {
  it('shows a dashed, level line with an hourglass and no faces for “can’t tell yet”', () => {
    render(<MoodLinePlaceholder />);
    const line = answerLine();
    expect(line.getAttribute('y1')).toBe(line.getAttribute('y2'));
    expect(line.getAttribute('stroke-dasharray')).toBeTruthy();
    expect(host.querySelectorAll('.lucide-hourglass')).toHaveLength(1);
    expect(faces()).toHaveLength(0);
    expect(label()).toBe('No line yet: not enough to compare');
  });
});
