// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';
import { groupLinkedTasks } from '@/app/utils/taskUtils';
import TaskItem from './TaskItem';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

const parent = task(1, 'Apply to Google');
const linkedTasks = [
  task(2, 'Update résumé', { parent_task_id: 1, position: 0, completed: true }),
  task(3, 'Mock interview', { parent_task_id: 1, position: 1 }),
];
/** The card's linked tasks as the list nests them. */
const nest = (tasks: Task[]) => groupLinkedTasks(tasks, tasks)[0].linked;
const linked = nest([parent, ...linkedTasks]);

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
    expect(onEditTask).toHaveBeenCalledWith(linkedTasks[1]);
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

  it('shows each linked task with a trail to the card it leads up to, which opens it', () => {
    const onEditTask = vi.fn();
    render({ onEditTask });
    const row = button('Edit Mock interview')!.closest('li')!;
    expect(row.querySelector('[title="Leads up to Apply to Google"]')).not.toBeNull();
    act(() => row.querySelector<HTMLButtonElement>('button[aria-label="Open parent task Apply to Google"]')!.click());
    expect(onEditTask).toHaveBeenCalledWith(parent);
  });

  describe('nested deeper', () => {
    const practice = task(4, 'Practice questions', { parent_task_id: 3, position: 0 });
    const room = task(5, 'Book a quiet room', { parent_task_id: 3, position: 1, completed: true });
    const notes = task(6, 'Write up notes', { parent_task_id: 4 });
    const nested = nest([parent, ...linkedTasks, practice, room, notes]);
    const rowOf = (title: string) => button(`Edit ${title}`)!.closest('li')!;

    it('nests a linked task under its own parent, with its progress and full trail', () => {
      render({ linkedTasks: nested });
      // Mock interview's linked tasks sit inside its own row, not beside it.
      expect(rowOf('Mock interview').contains(rowOf('Practice questions'))).toBe(true);
      expect(rowOf('Practice questions').contains(rowOf('Write up notes'))).toBe(true);
      expect(rowOf('Update résumé').contains(rowOf('Practice questions'))).toBe(false);
      expect(rowOf('Mock interview').querySelector('[title="1 of 2 linked tasks done"]')).not.toBeNull();
      expect(rowOf('Write up notes').querySelector('[title="Leads up to Apply to Google › Mock interview › Practice questions"]'))
        .not.toBeNull();
      // The card counts only its own linked tasks.
      expect(container.textContent).toContain('1 of 2 done');
    });

    it('opens any task in the trail', () => {
      const onEditTask = vi.fn();
      render({ linkedTasks: nested, onEditTask });
      const trail = rowOf('Write up notes').querySelector('[title^="Leads up to"]')!;
      act(() => trail.querySelector<HTMLButtonElement>('button[aria-label="Open parent task Mock interview"]')!.click());
      expect(onEditTask).toHaveBeenCalledWith(linkedTasks[1]);
    });

    it('collapses and expands one linked task’s own linked tasks', () => {
      render({ linkedTasks: nested });
      act(() => button('Hide linked tasks of Mock interview')!.click());
      expect(container.textContent).not.toContain('Practice questions');
      expect(container.textContent).toContain('Update résumé');
      act(() => button('Show linked tasks of Mock interview')!.click());
      expect(container.textContent).toContain('Write up notes');
    });

    it('completes a nested task from its row and shows its banner there', () => {
      const onToggleComplete = vi.fn();
      render({
        linkedTasks: nested,
        onToggleComplete,
        linkedBannerFor: g => g.task.id === 3 && <p role="status">Mock interview banner</p>,
      });
      act(() => button('Mark complete: Write up notes')!.click());
      expect(onToggleComplete).toHaveBeenCalledWith(6);
      expect(rowOf('Mock interview').querySelector('[role="status"]')?.textContent).toBe('Mock interview banner');
      expect(rowOf('Practice questions').querySelector('[role="status"]')).toBeNull();
    });
  });

  it("shows the API's summary of a card's parent that isn't loaded", () => {
    render({
      task: task(8, 'Orphan', { parent_task_id: 99, parent: { id: 99, title: 'Archived goal' } }),
      linkedTotal: 0,
    });
    expect(container.querySelector('[title="Leads up to Archived goal"]')).not.toBeNull();
    // Nothing to open it in, so it's plain text.
    expect(button('Open parent task Archived goal')).toBeNull();
  });

  it('renders no linked section for a task without linked tasks', () => {
    render({ linkedTasks: [], linkedDone: 0, linkedTotal: 0 });
    expect(container.textContent).not.toContain('Linked tasks');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });
});

describe('TaskItem added from Canvas', () => {
  const url = 'https://sdsu.instructure.com/courses/1001/assignments/9876';
  afterEach(() => localStorage.clear());

  it('links to the assignment, naming the course when the panel has listed it', () => {
    localStorage.setItem('tm-canvas-course-labels', JSON.stringify({ 1001: 'CS 460' }));
    render({ task: task(7, 'Problem Set 6', { canvas_assignment_id: 9876, canvas_html_url: url }), linkedTotal: 0 });
    const link = container.querySelector<HTMLAnchorElement>('a[title="Open in Canvas"]');
    expect(link?.href).toBe(url);
    expect(link?.target).toBe('_blank');
    expect(link?.textContent).toBe('From Canvas · CS 460');
  });

  it('says just "From Canvas" for an unknown course, in the compact card too', () => {
    render({ task: task(7, 'Problem Set 6', { canvas_html_url: url }), linkedTotal: 0, compact: true });
    expect(container.querySelector('a[title="Open in Canvas"]')?.textContent).toBe('From Canvas');
  });

  it('shows no link for other tasks or a link that is not https', () => {
    render({ task: task(7, 'Laundry', { canvas_html_url: 'javascript:alert(1)' }), linkedTotal: 0 });
    expect(container.querySelector('a[title="Open in Canvas"]')).toBeNull();
  });
});
