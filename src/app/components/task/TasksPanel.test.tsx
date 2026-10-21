// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';
import { groupLinkedTasks } from '@/app/utils/taskUtils';
import { DEFAULT_TASK_VIEW } from '@/app/hooks/useTaskFiltering';
import TasksPanel from './TasksPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

const parent = task(1, 'Apply to Google');
const done = task(2, 'Update résumé', { parent_task_id: 1, position: 0, completed: true });
const open = task(3, 'Mock interview', { parent_task_id: 1, position: 1 });
const solo = task(5, 'Laundry');

let container: HTMLDivElement;
let root: Root;
type Props = React.ComponentProps<typeof TasksPanel>;
const makeHandlers = () => ({
  onToggleComplete: vi.fn<Props['onToggleComplete']>(),
  onCompleteWithLinked: vi.fn<Props['onCompleteWithLinked']>(),
  onDeleteTask: vi.fn<Props['onDeleteTask']>(),
  onArchiveTask: vi.fn<Props['onArchiveTask']>(),
});
let handlers: ReturnType<typeof makeHandlers>;

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  handlers = makeHandlers();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const render = (tasks: Task[]) =>
  act(() => root.render(
    <TasksPanel
      tags={[]}
      taskGroups={groupLinkedTasks(tasks, tasks)}
      onUpdatePriority={vi.fn()}
      onEditTask={vi.fn()}
      activeTaskCount={tasks.length}
      occupiedPriorities={[]}
      compact={false}
      view={DEFAULT_TASK_VIEW}
      onViewChange={vi.fn()}
      selectedTags={[]}
      onToggleTag={vi.fn()}
      onClearTags={vi.fn()}
      {...handlers}
    />,
  ));

const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
const click = (label: string) => act(() => button(label)!.click());
// The parent's own checkbox is the first "Mark complete" one (rows are labelled with their title).
const parentCheckbox = (index = 0) =>
  [...container.querySelectorAll<HTMLButtonElement>('button[aria-label="Mark complete"]')][index];

describe('TasksPanel completing a parent with open linked tasks', () => {
  it('asks with a warning banner instead of completing it', () => {
    render([parent, done, open]);
    act(() => parentCheckbox().click());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(container.textContent).toContain('1 linked task is still open.');
    expect(button('Complete all')).toBeDefined();
    expect(button('Just this task')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
  });

  it('"Complete all" completes the parent with its linked tasks in one call', () => {
    render([parent, done, open]);
    act(() => parentCheckbox().click());
    click('Complete all');
    expect(handlers.onCompleteWithLinked).toHaveBeenCalledWith(1);
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('still open');
  });

  it('"Just this task" completes only the parent, and Cancel does nothing', () => {
    render([parent, done, open]);
    act(() => parentCheckbox().click());
    click('Just this task');
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(1);
    expect(handlers.onCompleteWithLinked).not.toHaveBeenCalled();

    act(() => parentCheckbox().click());
    click('Cancel');
    expect(handlers.onToggleComplete).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('still open');
  });

  it('completes right away when every linked task is done, or there are none', () => {
    render([parent, done, { ...open, completed: true }]);
    act(() => parentCheckbox().click());
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(1);
    render([solo]);
    act(() => parentCheckbox().click());
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(5);
    expect(container.textContent).not.toContain('still open');
  });
});

describe('TasksPanel finishing the last open linked task', () => {
  it('suggests completing the parent with a success banner', () => {
    render([parent, done, open]);
    click('Mark complete: Mock interview');
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(3);
    // The toggle updates the list optimistically.
    render([parent, done, { ...open, completed: true }]);
    expect(container.textContent).toContain('All linked tasks are done. Mark Apply to Google complete?');

    click('Mark complete');
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(1);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });

  it('"Not yet" dismisses the banner, and it does not show while others are still open', () => {
    const other = task(4, 'Cover letter', { parent_task_id: 1, position: 2 });
    render([parent, done, open, other]);
    click('Mark complete: Mock interview');
    render([parent, done, { ...open, completed: true }, other]);
    expect(container.textContent).not.toContain('All linked tasks are done');

    click('Mark complete: Cover letter');
    render([parent, done, { ...open, completed: true }, { ...other, completed: true }]);
    click('Not yet');
    expect(container.textContent).not.toContain('All linked tasks are done');
  });

  it('drops the banner when the toggle fails and the list rolls back', () => {
    render([parent, done, open]);
    click('Mark complete: Mock interview');
    render([parent, done, open]);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });
});

describe('TasksPanel deleting or archiving a parent', () => {
  const radio = (value: string) =>
    document.body.querySelector<HTMLInputElement>(`input[name="linked-remove-mode"][value="${value}"]`)!;

  it('asks first, with "Keep them" picked by default, and passes linked=keep', () => {
    render([parent, done, open]);
    click('Delete task');
    expect(handlers.onDeleteTask).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Delete “Apply to Google”?');
    expect(document.body.textContent).toContain('It has 2 linked tasks.');
    expect(radio('keep').checked).toBe(true);
    expect(radio('cascade').checked).toBe(false);
    expect(document.body.textContent).toContain('Delete them too');

    click('Delete');
    expect(handlers.onDeleteTask).toHaveBeenCalledWith(parent, 'keep');
    expect(document.body.querySelector('input[name="linked-remove-mode"]')).toBeNull();
  });

  it('passes linked=cascade when "Archive them too" is picked', () => {
    render([parent, done, open]);
    click('Archive task');
    expect(document.body.textContent).toContain('Archive them too');
    act(() => radio('cascade').click());
    click('Archive');
    expect(handlers.onArchiveTask).toHaveBeenCalledWith(parent, 'cascade');
  });

  it('Cancel closes the dialog without deleting', () => {
    render([parent, done, open]);
    click('Delete task');
    click('Cancel');
    expect(handlers.onDeleteTask).not.toHaveBeenCalled();
    expect(document.body.querySelector('input[name="linked-remove-mode"]')).toBeNull();
  });

  it('deletes a task without linked tasks straight away', () => {
    render([solo]);
    click('Delete task');
    expect(handlers.onDeleteTask).toHaveBeenCalledWith(solo);
    expect(document.body.querySelector('input[name="linked-remove-mode"]')).toBeNull();
  });
});

describe('TasksPanel tasks added from Canvas', () => {
  const fromCanvas = task(7, 'Problem Set 6', {
    canvas_assignment_id: 9876,
    canvas_html_url: 'https://sdsu.instructure.com/courses/1001/assignments/9876',
  });
  const renderWith = (tasks: Task[], canvasSubmitted: Props['canvasSubmitted']) =>
    act(() => root.render(
      <TasksPanel
        tags={[]}
        taskGroups={groupLinkedTasks(tasks, tasks)}
        onUpdatePriority={vi.fn()}
        onEditTask={vi.fn()}
        activeTaskCount={tasks.length}
        occupiedPriorities={[]}
        compact={false}
        view={DEFAULT_TASK_VIEW}
        onViewChange={vi.fn()}
        selectedTags={[]}
        onToggleTag={vi.fn()}
        onClearTags={vi.fn()}
        canvasSubmitted={canvasSubmitted}
        {...handlers}
      />,
    ));

  it('offers to mark a task complete once Canvas shows it submitted', () => {
    const onNotYet = vi.fn();
    renderWith([fromCanvas, solo], { shows: t => t.id === 7, onNotYet });
    expect(container.textContent).toContain('Canvas shows this submitted.');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    click('Mark complete');
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(7);
  });

  it('"Not yet" hands the task to onNotYet without completing it', () => {
    const onNotYet = vi.fn();
    renderWith([fromCanvas], { shows: () => true, onNotYet });
    click('Not yet');
    expect(onNotYet).toHaveBeenCalledWith(7);
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
  });

  it('shows no banner while Canvas has nothing to say', () => {
    renderWith([fromCanvas], { shows: () => false, onNotYet: vi.fn() });
    expect(container.textContent).not.toContain('Canvas shows this submitted.');
  });
});
