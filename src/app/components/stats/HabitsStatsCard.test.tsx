// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HabitsStatsCard from './HabitsStatsCard';
import type { Habit } from '@/app/types/habit';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

vi.mock('@/app/lib/backend-api', () => ({
  fetchHabitHistory: vi.fn(() => Promise.resolve([])),
}));

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
  container.remove();
});

const habits = (n: number): Habit[] =>
  Array.from({ length: n }, (_, i) => ({ id: i + 1, title: `Habit ${i + 1}`, current_streak: 0, max_streak: 0, logged_today: false, tags: [] }));

const drag = { onPointerDown: () => {} } as unknown as DragHandleProps;

describe('Habits tile', () => {
  it.each([3, 8, 15])('lists all %i habits in a list that scrolls instead of clipping', async n => {
    await act(async () => {
      root.render(<HabitsStatsCard habits={habits(n)} onToggle={() => {}} onExpand={() => {}} dragHandleProps={drag} />);
    });
    const toggles = container.querySelectorAll('button[aria-label^="Mark Habit"]');
    expect(toggles).toHaveLength(n);
    const list = toggles[0].closest('.grid');
    expect(list?.className).toContain('overflow-y-auto');
    expect(list?.className).toContain('scrollbar-custom');
    expect(list?.className).not.toContain('overflow-hidden');
  });
});
