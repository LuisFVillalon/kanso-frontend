// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';
import TaskItem from './TaskItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

const parent = task(1, 'Apply to Google');
const linked = [
  task(2, 'Update résumé', { parent_task_id: 1, completed: true }),
  task(3, 'Mock interview', { parent_task_id: 1 }),
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const render = (props: Partial<React.ComponentProps<typeof TaskItem>> = {}) =>
  act(() => root.render(
    <TaskItem task={parent} index={0} tags={[]} linkedTasks={linked} linkedDone={1} linkedTotal={2} {...props} />,
  ));
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('TaskItem linked tasks', () => {
  it('shows linked tasks under the parent with "x of y done" progress', () => {
    render();
    expect(container.textContent).toContain('Linked tasks');
    expect(container.textContent).toContain('1 of 2 done');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(container.textContent).toContain('Update résumé');
    expect(container.textContent).toContain('Mock interview');
  });

  it('collapses and expands the linked tasks', () => {
    render();
    // The priority badge also carries aria-expanded, so pick the linked tasks header.
    const toggle = Array.from(container.querySelectorAll<HTMLButtonElement>('button[aria-expanded]'))
      .find(b => b.textContent?.includes('Linked tasks'))!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).not.toContain('Mock interview');
    expect(container.textContent).toContain('1 of 2 done');
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Mock interview');
  });

  it('completes and edits a linked task from its row', () => {
    const onToggleComplete = vi.fn();
    const onEditTask = vi.fn();
    render({ onToggleComplete, onEditTask });
    act(() => button('Mark complete: Mock interview')!.click());
    expect(onToggleComplete).toHaveBeenCalledWith(3);
    act(() => button('Edit Mock interview')!.click());
    expect(onEditTask).toHaveBeenCalledWith(linked[1]);
  });

  it('disables a linked task checkbox while its request is in flight', () => {
    render({ pendingTaskIds: new Set([3]) });
    expect(button('Mark complete: Mock interview')!.disabled).toBe(true);
    expect(button('Mark incomplete: Update résumé')!.disabled).toBe(false);
  });

  it('shows a compact "done/total" pill and collapsible rows on compact cards', () => {
    render({ compact: true });
    expect(container.textContent).toContain('1/2');
    expect(container.textContent).toContain('Mock interview');
    act(() => button('Hide linked tasks')!.click());
    expect(container.textContent).not.toContain('Mock interview');
  });

  it('labels a deeper linked task with its own parent', () => {
    const deeper = task(4, 'Practice questions', { parent_task_id: 3 });
    render({ linkedTasks: [...linked, deeper], linkedVia: { 4: 'Mock interview' } });
    const row = button('Edit Practice questions')!.closest('li')!;
    expect(row.textContent).toContain('↳ Mock interview');
    expect(button('Edit Mock interview')!.closest('li')!.textContent).not.toContain('↳');
    expect(container.textContent).toContain('1 of 2 done');
  });

  it('renders no linked section for a task without linked tasks', () => {
    render({ linkedTasks: [], linkedDone: 0, linkedTotal: 0 });
    expect(container.textContent).not.toContain('Linked tasks');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});
