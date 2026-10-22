// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Habit } from '@/app/types/habit';
import ManageHabitsModal from './ManageHabitsModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 1, title: 'Read', current_streak: 5, max_streak: 12, logged_today: false, tags: [], estimated_time: 0.5,
  ...over,
});

const render = (props: Partial<React.ComponentProps<typeof ManageHabitsModal>> = {}) => {
  act(() => {
    root.render(<ManageHabitsModal isOpen onClose={() => {}} habits={[habit()]} {...props} />);
  });
};

const text = () => document.body.textContent ?? '';

describe('ManageHabitsModal', () => {
  it('labels the streak icons and reads the time goal as a sentence', () => {
    render();
    expect(text()).toContain('5-day streak');
    expect(text()).toContain('Best: 12 days');
    expect(text()).toContain('Goal: 30 min per day');
    expect(document.body.querySelector('[title^="Current streak"]')?.textContent).toBe('5-day streak');
    expect(document.body.querySelector('[title^="Best streak"]')?.textContent).toBe('Best: 12 days');
  });

  it('omits the goal when a habit has no time set', () => {
    render({ habits: [habit({ estimated_time: null })] });
    expect(text()).not.toContain('Goal:');
  });

  it('explains the time goal field and saves hours unchanged', async () => {
    const onUpdateHabit = vi.fn().mockResolvedValue(undefined);
    render({ onUpdateHabit });
    act(() => (document.body.querySelector('[aria-label="Edit habit"]') as HTMLButtonElement).click());

    const input = document.body.querySelector('input[type="number"]') as HTMLInputElement;
    const label = document.body.querySelector(`label[for="${input.id}"]`);
    expect(label?.textContent).toBe('Daily time goal (optional)');
    expect(text()).toContain('hours per day');
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Goal: 30 min per day. Goals go in half-hour steps (0.5 = 30 minutes).');

    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, '1.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(text()).toContain('Goal: 1.5 hrs per day');

    const save = [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Save')!;
    await act(async () => save.click());
    expect(onUpdateHabit).toHaveBeenCalledWith(1, 'Read', [], 1.5);
  });

  it('shows the field hint when no time goal is set', () => {
    render({ habits: [habit({ estimated_time: null })], onUpdateHabit: vi.fn() });
    act(() => (document.body.querySelector('[aria-label="Edit habit"]') as HTMLButtonElement).click());
    expect(text()).toContain('How long you plan to spend on this habit each day. Goals go in half-hour steps (0.5 = 30 minutes).');
  });
});
