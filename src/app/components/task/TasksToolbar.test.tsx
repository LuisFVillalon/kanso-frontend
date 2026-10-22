// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tag, Task, TaskView } from '@/app/types/task';
import { DEFAULT_TASK_VIEW, useTaskFiltering } from '@/app/hooks/useTaskFiltering';
import TasksPanel from './TasksPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const school: Tag = { id: 1, name: 'School', color: '#4F46E5' };
const gym: Tag = { id: 2, name: 'Gym', color: '#10B981' };
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});
const tasks = [
  task(1, 'Essay', { due_date: '2026-10-24', priority: 2, tags: [school] }),
  task(2, 'Quiz', { due_date: '2026-10-22', priority: 3, tags: [school] }),
  task(3, 'Leg day', { due_date: '2026-10-23', priority: 1, tags: [gym], completed: true }),
];

let container: HTMLDivElement;
let root: Root;

// The home page's wiring: the toolbar's view and tag filter drive useTaskFiltering.
const Harness: React.FC<{ initial?: TaskView }> = ({ initial = DEFAULT_TASK_VIEW }) => {
  const [view, setView] = useState(initial);
  const [selected, setSelected] = useState<Tag[]>([]);
  const { taskGroups } = useTaskFiltering(tasks, view, '', selected);
  return (
    <TasksPanel
      tags={[school, gym]}
      taskGroups={taskGroups}
      onToggleComplete={vi.fn()}
      onCompleteWithLinked={vi.fn()}
      onDeleteTask={vi.fn()}
      onArchiveTask={vi.fn()}
      onUpdatePriority={vi.fn()}
      onEditTask={vi.fn()}
      activeTaskCount={2}
      occupiedPriorities={[]}
      compact={false}
      view={view}
      onViewChange={setView}
      selectedTags={selected}
      onToggleTag={tag => setSelected(prev => prev.some(t => t.id === tag.id) ? prev.filter(t => t.id !== tag.id) : [...prev, tag])}
      onClearTags={() => setSelected([])}
    />
  );
};

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Harness />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button')];
const byName = (name: string) =>
  buttons().find(b => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === name)!;
const byNameStart = (start: string) =>
  buttons().find(b => (b.getAttribute('aria-label') ?? '').startsWith(start))!;
const click = (el: HTMLElement) => act(() => el.click());
// The task titles on screen, top to bottom.
const shown = () => {
  const text = container.textContent ?? '';
  return tasks.map(t => t.title).filter(t => text.includes(t)).sort((a, b) => text.indexOf(a) - text.indexOf(b));
};
const select = () => container.querySelector<HTMLSelectElement>('select')!;
const pick = (value: string) => act(() => {
  const el = select();
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('change', { bubbles: true }));
});
const key = (el: Element, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });

describe('Tasks toolbar Show and Sort', () => {
  it('shows open, completed or all tasks from the Show control', () => {
    expect(shown()).toEqual(['Quiz', 'Leg day', 'Essay']);
    click(byName('Open'));
    expect(byName('Open').getAttribute('aria-pressed')).toBe('true');
    expect(shown()).toEqual(['Quiz', 'Essay']);
    click(byName('Completed'));
    expect(shown()).toEqual(['Leg day']);
    click(byName('All'));
    expect(shown()).toHaveLength(3);
  });

  it('sorts by the picked key and flips direction with a named button', () => {
    expect(select().labels?.[0]?.textContent).toBe('Sort tasks by');
    pick('priority');
    expect(shown()).toEqual(['Leg day', 'Essay', 'Quiz']);
    const dir = byNameStart('Sort direction');
    expect(dir.getAttribute('aria-label')).toBe('Sort direction: highest first. Switch to lowest first');
    click(dir);
    expect(shown()).toEqual(['Quiz', 'Essay', 'Leg day']);
    expect(byNameStart('Sort direction').getAttribute('aria-label')).toBe('Sort direction: lowest first. Switch to highest first');
  });
});

describe('Tasks toolbar tag filter', () => {
  const openTags = () => click(byName('Filter by tag'));
  const menu = () => container.querySelector<HTMLElement>('[role="menu"]');
  const item = (name: string) =>
    [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')].find(b => b.textContent?.trim() === name)!;

  it('picks tags from the Tags menu and shows them as removable chips', () => {
    openTags();
    expect(menu()?.getAttribute('aria-label')).toBe('Filter by tag');
    expect(document.activeElement).toBe(item('School'));
    click(item('Gym'));
    expect(item('Gym').getAttribute('aria-checked')).toBe('true');
    expect(shown()).toEqual(['Leg day']);
    expect(byName('Remove tag filter: Gym')).toBeDefined();
    expect(byName('Tags').getAttribute('aria-expanded')).toBe('true');

    click(byName('Remove tag filter: Gym'));
    expect(shown()).toHaveLength(3);
  });

  it('moves with the arrow keys, clears tags, and closes on Escape back to its button', () => {
    openTags();
    key(menu()!, 'ArrowDown');
    expect(document.activeElement).toBe(item('Gym'));
    click(item('Gym'));
    click(item('School'));
    expect(shown()).toEqual(['Quiz', 'Leg day', 'Essay']);
    const clear = [...menu()!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent?.includes('Clear tags'))!;
    click(clear);
    expect(menu()).toBeNull();
    expect(container.textContent).not.toContain('Remove tag filter');

    openTags();
    key(menu()!, 'Escape');
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(byName('Filter by tag'));
  });
});
