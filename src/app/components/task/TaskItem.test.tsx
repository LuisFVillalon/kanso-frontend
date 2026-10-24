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
const linkedTasks = [
  task(2, 'Update résumé', { parent_task_id: 1, position: 0, completed: true }),
  task(3, 'Mock interview', { parent_task_id: 1, position: 1 }),
];
/** The parent card's linked-task chips; Mock interview has 2 of its own. */
const linked = [{ task: linkedTasks[0], linkedCount: 0 }, { task: linkedTasks[1], linkedCount: 2 }];

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
    <TaskItem task={parent} index={0} tags={[]} linked={linked} onGoToTask={vi.fn()} {...props} />,
  ));
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

describe('TaskItem on a parent card', () => {
  it('shows "x of y done" progress and a chip for each linked task', () => {
    render();
    expect(container.textContent).toContain('Linked tasks');
    expect(container.textContent).toContain('1 of 2 done');
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');
    expect(button('Go to linked task: Update résumé (done)')).not.toBeNull();
    expect(button('Go to linked task: Mock interview')?.textContent).toBe('Mock interview+2');
  });

  it('goes to a linked task’s own card from its chip', () => {
    const onGoToTask = vi.fn();
    render({ onGoToTask });
    act(() => button('Go to linked task: Mock interview')!.click());
    expect(onGoToTask).toHaveBeenCalledWith(3);
  });

  it('shows a compact "done/total" pill on compact cards', () => {
    render({ compact: true });
    expect(container.textContent).toContain('1/2');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('renders no linked section for a task without linked tasks', () => {
    render({ linked: [] });
    expect(container.textContent).not.toContain('Linked tasks');
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('opens the "New linked task" form from "+ Linked task", except on a completed task', () => {
    const onAddLinked = vi.fn();
    render({ onAddLinked });
    act(() => button('Add a linked task to Apply to Google')!.click());
    expect(onAddLinked).toHaveBeenCalledWith(parent);
    render({ onAddLinked, compact: true });
    expect(button('Add a linked task to Apply to Google')).not.toBeNull();
    render({ onAddLinked, task: { ...parent, completed: true } });
    expect(button('Add a linked task to Apply to Google')).toBeNull();
  });

  it('marks the card with its task id, for scrolling to it', () => {
    render();
    expect(container.querySelector('[data-task-id="1"]')).not.toBeNull();
  });
});

describe('TaskItem on a linked task’s card', () => {
  const notes = task(6, 'Write up notes', { parent_task_id: 4 });
  // Write up notes → Practice questions → Mock interview (done) → Apply to Google.
  const chain = [
    { id: 1, title: 'Apply to Google' },
    { id: 3, title: 'Mock interview', completed: true },
    { id: 4, title: 'Practice questions' },
  ];

  it('names its original task and the task before it, with "…" for the rest', () => {
    render({ task: notes, parents: chain, linked: [] });
    const trail = container.querySelector('[title^="Leads up to"]')!;
    expect(trail.getAttribute('title')).toBe('Leads up to Apply to Google › Mock interview › Practice questions');
    expect(trail.textContent).toBe('Apply to Google›…›Practice questions');
    expect(button('Go to original task: Apply to Google')).not.toBeNull();
    expect(button('Go to task before it: Practice questions')).not.toBeNull();
  });

  it('goes to either task from the trail', () => {
    const onGoToTask = vi.fn();
    render({ task: notes, parents: chain, linked: [], onGoToTask });
    act(() => button('Go to original task: Apply to Google')!.click());
    act(() => button('Go to task before it: Practice questions')!.click());
    expect(onGoToTask.mock.calls).toEqual([[1], [4]]);
  });

  it('shows the whole trail from "…", striking through a done task', () => {
    render({ task: notes, parents: chain, linked: [] });
    act(() => button('Show 1 more')!.click());
    const done = button('Go to Mock interview (done)')!;
    expect(done.className).toContain('line-through');
  });

  it('names just the task before it when that is also its original task', () => {
    render({ task: linkedTasks[1], parents: [{ id: 1, title: 'Apply to Google' }], linked: [] });
    expect(button('Go to Apply to Google')).not.toBeNull();
  });

  it('shows the trail on compact cards too', () => {
    render({ task: notes, parents: chain, linked: [], compact: true });
    expect(button('Go to original task: Apply to Google')).not.toBeNull();
    expect(button('Go to task before it: Practice questions')).not.toBeNull();
  });

  it('shows no trail on a task with no parent', () => {
    render({ parents: [] });
    expect(container.querySelector('[title^="Leads up to"]')).toBeNull();
  });
});

describe('TaskItem added from Canvas', () => {
  const url = 'https://sdsu.instructure.com/courses/1001/assignments/9876';
  afterEach(() => localStorage.clear());

  it('links to the assignment, naming the course when the panel has listed it', () => {
    localStorage.setItem('tm-canvas-course-labels', JSON.stringify({ 1001: 'CS 460' }));
    render({ task: task(7, 'Problem Set 6', { canvas_assignment_id: 9876, canvas_html_url: url }) });
    const link = container.querySelector<HTMLAnchorElement>('a[title="Open in Canvas"]');
    expect(link?.href).toBe(url);
    expect(link?.target).toBe('_blank');
    expect(link?.textContent).toBe('From Canvas · CS 460');
  });

  it('says just "From Canvas" for an unknown course, in the compact card too', () => {
    render({ task: task(7, 'Problem Set 6', { canvas_html_url: url }), compact: true });
    expect(container.querySelector('a[title="Open in Canvas"]')?.textContent).toBe('From Canvas');
  });

  it('shows no link for other tasks or a link that is not https', () => {
    render({ task: task(7, 'Laundry', { canvas_html_url: 'javascript:alert(1)' }) });
    expect(container.querySelector('a[title="Open in Canvas"]')).toBeNull();
  });
  it.each([false, true])('says "Done in Canvas" on a task the Canvas sync completed (compact: %s)', compact => {
    const done = { canvas_html_url: url, completed: true, completed_by_canvas: true };
    render({ task: task(7, 'Problem Set 6', done), compact });
    expect(container.textContent).toContain('Done in Canvas');
    // Completed by hand, or reopened since: no badge.
    render({ task: task(7, 'Problem Set 6', { ...done, completed_by_canvas: false }), compact });
    expect(container.textContent).not.toContain('Done in Canvas');
    render({ task: task(7, 'Problem Set 6', { ...done, completed: false }), compact });
    expect(container.textContent).not.toContain('Done in Canvas');
  });
});
