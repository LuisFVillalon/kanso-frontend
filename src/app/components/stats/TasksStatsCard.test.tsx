// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TasksStatsCard, { TasksOverlay } from './TasksStatsCard';
import type { Task } from '@/app/types/task';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  // Friday, so the week runs Mon Oct 19 – Sun Oct 25.
  vi.setSystemTime(new Date(2026, 9, 23, 12, 0, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

let nextId = 1;
const task = (due: string | null, fields: Partial<Task> = {}): Task => ({
  id: nextId++,
  title: `Task ${nextId}`,
  description: '',
  completed: false,
  priority: null,
  due_date: due,
  due_time: null,
  tags: [],
  created_date: '2026-10-01',
  completed_date: null,
  ...fields,
});

const tasks: Task[] = [
  // This week: 3 done, 2 open (one prioritized) — 4.5h estimated in all.
  task('2026-10-19', { completed: true, estimated_time: 2 }),
  task('2026-10-21', { completed: true, estimated_time: 1 }),
  task('2026-10-23', { completed: true }),
  task('2026-10-23', { estimated_time: 1.5, priority: 1 }),
  task('2026-10-25'),
  // Outside this week: done last week, open and prioritized next week, undated.
  ...Array.from({ length: 5 }, () => task('2026-10-16', { completed: true, estimated_time: 3 })),
  ...Array.from({ length: 4 }, () => task('2026-10-26', { priority: 2, estimated_time: 4 })),
  ...Array.from({ length: 3 }, () => task(null)),
];

const text = () => container.textContent ?? '';

describe('Tasks tile', () => {
  it("shows this week's workload under the ring, not all-time hours done", () => {
    const drag = { onPointerDown: () => {} } as unknown as DragHandleProps;
    act(() => root.render(<TasksStatsCard tasks={tasks} total={tasks.length} onExpand={() => {}} dragHandleProps={drag} />));
    expect(text()).toContain('4.5h this week');
    expect(text()).not.toContain('h done');
  });
});

describe('Task Stats overlay', () => {
  beforeEach(() => {
    act(() => root.render(<TasksOverlay tasks={tasks} total={tasks.length} />));
  });

  const slideTotal = (totalLabel: string) =>
    [...container.querySelectorAll('span')].find(s => s.textContent === totalLabel)?.previousElementSibling?.textContent;

  it("counts only this week's open tasks in the Active ring", () => {
    expect(text()).toContain('Active this week');
    expect(text()).toContain('2 of 5 still open');
    expect(text()).not.toContain('/ 17 done');
  });

  it('scopes the Priority, Active and Completed slides to this week and says so', () => {
    const labels = [...container.querySelectorAll('button[aria-label^="Show "]')].map(b => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Show Overview',
      'Show Workload',
      'Show Priority · This week (Oct 19–25)',
      'Show Active · This week (Oct 19–25)',
      'Show Completed · This week (Oct 19–25)',
    ]);
    expect(slideTotal('prioritized tasks due this week')).toBe('1');
    expect(slideTotal('active tasks due this week')).toBe('2');
    expect(slideTotal('completed tasks due this week')).toBe('3');
  });

  it('explains the This Week ring gaps as one segment per day', () => {
    const ring = container.querySelector('[role="img"][title]');
    expect(ring?.getAttribute('title')).toBe('One segment per day with tasks due');
    expect(ring?.getAttribute('aria-label')).toBe('60% done. One segment per day with tasks due');
  });
});
