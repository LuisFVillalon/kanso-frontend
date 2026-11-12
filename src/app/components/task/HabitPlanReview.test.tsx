// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HabitPlanReview, { type ReviewRow } from './HabitPlanReview';
import type { SlotState, Span } from '@/app/utils/slotSuggest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The habit-time board's sample day: Thu Nov 12 2026, now 8:40 AM, work day 9 AM – 7 PM.
const H = (h: number, m = 0) => h * 60 + m;
const DAY = '2026-11-12';
const STATE: SlotState = {
  now: { date: DAY, min: H(8, 40) },
  windowOn: (): Span => [H(9), H(19)],
  events: [
    { date: DAY, title: 'BIO 210 lecture', start: H(11, 30), end: H(12, 45) },
    { date: DAY, title: 'Library shift', start: H(14), end: H(17) },
    { date: DAY, title: 'Dinner with Sam', start: H(19, 30), end: H(20, 30) },
  ],
  blocks: [],
  habits: [],
  tasks: [],
};
const ROWS: ReviewRow[] = [
  { id: 1, title: 'Workout', len: 90, start: H(9), on: true },
  { id: 2, title: 'Leetcode', len: 60, start: H(10, 30), on: true },
  { id: 3, title: 'Read', len: 30, start: H(12, 45), on: true },
];

let container: HTMLDivElement;
let root: Root;
const onSubmit = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  onSubmit.mockReset();
  onCancel.mockReset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const show = async (props: Partial<React.ComponentProps<typeof HabitPlanReview>> = {}) => {
  await act(async () => root.render(
    <HabitPlanReview mode="plan" rows={ROWS} state={STATE} fixed={[]} focusId={null} phone={false} busy={false}
      onCancel={onCancel} onSubmit={onSubmit} {...props} />,
  ));
};
const byLabel = <T extends HTMLElement = HTMLElement>(label: string) => container.querySelector<T>(`[aria-label="${label}"]`);
const buttonByText = (text: string) => [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text);
const setTime = async (label: string, value: string) => {
  const input = byLabel<HTMLInputElement>(label)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Plan today’s habits', () => {
  it('steps to the previous or next free start, skipping events and the other rows', async () => {
    await show();
    // Workout can start 15 minutes sooner; Read, right after the lecture, can't go earlier.
    expect(byLabel('Earlier free time: 8:45 AM')).not.toBeNull();
    expect(byLabel<HTMLButtonElement>('No earlier free time')!.disabled).toBe(true);
    await act(async () => byLabel<HTMLButtonElement>('Later free time: 1:00 PM')!.click());
    expect(byLabel<HTMLInputElement>('Read start time')!.value).toBe('13:00');
    await setTime('Read start time', '13:30');
    expect(container.textContent).toContain('1:30 – 2:00 PM · right before Library shift');
    const read = container.querySelector('[data-review-row="3"]')!;
    await act(async () => read.querySelector<HTMLButtonElement>('[aria-label="Later free time: 5:00 PM"]')!.click());
    expect(byLabel<HTMLInputElement>('Read start time')!.value).toBe('17:00');
  });

  it('names a clash with another row and a time already past, and counts what to fix', async () => {
    await show();
    await setTime('Read start time', '09:30');
    expect(container.textContent).toContain('Overlaps Workout (9:00 – 10:30 AM).');
    await setTime('Leetcode start time', '08:00');
    expect(container.textContent).toContain("That's already past.");
    // Both sides of an overlap need fixing.
    expect(container.textContent).toContain('Overlaps Read (9:30 – 10:00 AM).');
    expect(container.textContent).toContain('Fix 3 times above first.');
    await act(async () => buttonByText('Plan 3 habits')!.click());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reads "Nothing to plan" with nothing ticked, and hands back only the ticked rows', async () => {
    await show();
    for (const t of ['Workout', 'Leetcode', 'Read']) await act(async () => byLabel<HTMLInputElement>(`Plan ${t} today`)!.click());
    expect(buttonByText('Nothing to plan')!.getAttribute('aria-disabled')).toBe('true');
    await act(async () => byLabel<HTMLInputElement>('Plan Read today')!.click());
    await act(async () => buttonByText('Plan 1 habit')!.click());
    expect(onSubmit).toHaveBeenCalledWith([{ id: 3, title: 'Read', start: H(12, 45), end: H(13, 15), changed: false }]);
  });

  it('on a phone, opens as a bottom sheet dialog on the page body that keeps focus inside', async () => {
    await show({ phone: true, focusId: 2 });
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe('Plan today’s habits');
    const inSheet = (label: string) => dialog.querySelector<HTMLElement>(`[aria-label="${label}"]`);
    expect(document.activeElement).toBe(inSheet('Leetcode start time'));
    const cancel = [...dialog.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Cancel')!;
    cancel.focus();
    await act(async () => { cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    expect(document.activeElement).toBe(inSheet('Plan Workout today'));
    await act(async () => { cancel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(onCancel).toHaveBeenCalledTimes(1);
    await act(async () => (dialog.parentElement!.querySelector('[aria-hidden]') as HTMLElement).click());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
