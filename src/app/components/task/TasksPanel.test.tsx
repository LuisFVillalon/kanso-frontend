// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/app/types/task';
import { DEFAULT_TASK_VIEW } from '@/app/hooks/useTaskFiltering';

const showToast = vi.fn();
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));

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
  showToast.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Renders the panel listing `shown` (all of `tasks` unless the filters hide some). */
const render = (tasks: Task[], extra: Partial<Props> & { shown?: Task[] } = {}) => {
  const { shown = tasks, ...props } = extra;
  act(() => root.render(
    <TasksPanel
      tags={[]}
      tasks={shown}
      allTasks={tasks}
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
      {...props}
    />,
  ));
};

const button = (label: string) =>
  [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
    b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  );
const click = (label: string) => act(() => button(label)!.click());
const card = (id: number) => container.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
const checkbox = (id: number) => card(id).querySelector<HTMLButtonElement>('button[aria-label^="Mark"]')!;
const within = (id: number, label: string) =>
  [...card(id).querySelectorAll<HTMLButtonElement>('button')].find(
    b => b.getAttribute('aria-label') === label || b.textContent?.trim() === label,
  )!;

describe('TasksPanel listing linked tasks', () => {
  it('shows every linked task as its own card, in the given order', () => {
    render([parent, done, open, solo], { shown: [open, solo, parent, done] });
    expect([...container.querySelectorAll('[data-task-id]')].map(el => el.getAttribute('data-task-id')))
      .toEqual(['3', '5', '1', '2']);
    // Each linked card names the task it leads up to.
    expect(card(3).querySelector('[title="Leads up to Apply to Google"]')).not.toBeNull();
    expect(card(5).querySelector('[title^="Leads up to"]')).toBeNull();
  });

  it('names the original task and the task before it on a deeper card', () => {
    const practice = task(4, 'Practice questions', { parent_task_id: 3 });
    render([parent, done, open, practice]);
    const trail = card(4).querySelector('[title^="Leads up to"]')!;
    expect(trail.getAttribute('title')).toBe('Leads up to Apply to Google › Mock interview');
    expect(within(4, 'Go to original task: Apply to Google')).toBeDefined();
    expect(within(4, 'Go to task before it: Mock interview')).toBeDefined();
  });

  it("lists a parent's linked tasks as chips with its progress", () => {
    render([parent, done, open]);
    expect(card(1).textContent).toContain('1 of 2 done');
    expect(within(1, 'Go to linked task: Mock interview')).toBeDefined();
    expect(within(1, 'Go to linked task: Update résumé (done)')).toBeDefined();
  });
});

describe('TasksPanel going to a task', () => {
  it('scrolls to the card and highlights it', () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    render([parent, done, open]);
    act(() => within(3, 'Go to Apply to Google').click());
    expect(scrolled).toHaveBeenCalled();
    expect(card(1).classList.contains('task-flash')).toBe(true);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('says when the filters hide it, and "Show it" clears them and goes there', () => {
    Element.prototype.scrollIntoView = vi.fn();
    const onShowAll = vi.fn();
    render([parent, done, open], { shown: [open], onShowAll });
    act(() => within(3, 'Go to Apply to Google').click());
    expect(showToast).toHaveBeenCalledWith('“Apply to Google” is hidden by your filters.', 'info', expect.objectContaining({ label: 'Show it' }));

    act(() => showToast.mock.calls[0][2].onClick());
    expect(onShowAll).toHaveBeenCalled();
    // The filters are cleared, so the list now shows it.
    render([parent, done, open], { onShowAll });
    expect(card(1).classList.contains('task-flash')).toBe(true);
  });
});

describe('TasksPanel completing a parent with open linked tasks', () => {
  it('asks with a warning banner instead of completing it', () => {
    render([parent, done, open]);
    act(() => checkbox(1).click());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(card(1).textContent).toContain('1 linked task is still open.');
    expect(button('Complete all')).toBeDefined();
    expect(button('Just this task')).toBeDefined();
    expect(button('Cancel')).toBeDefined();
  });

  it('"Complete all" completes the parent with its linked tasks in one call', () => {
    render([parent, done, open]);
    act(() => checkbox(1).click());
    click('Complete all');
    expect(handlers.onCompleteWithLinked).toHaveBeenCalledWith(1);
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('still open');
  });

  it('"Just this task" completes only the parent, and Cancel does nothing', () => {
    render([parent, done, open]);
    act(() => checkbox(1).click());
    click('Just this task');
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(1);
    expect(handlers.onCompleteWithLinked).not.toHaveBeenCalled();

    act(() => checkbox(1).click());
    click('Cancel');
    expect(handlers.onToggleComplete).toHaveBeenCalledTimes(1);
    expect(container.textContent).not.toContain('still open');
  });

  it('completes right away when every linked task is done, or there are none', () => {
    render([parent, done, { ...open, completed: true }]);
    act(() => checkbox(1).click());
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(1);
    render([solo]);
    act(() => checkbox(5).click());
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(5);
    expect(container.textContent).not.toContain('still open');
  });

  it('asks even when the parent is the only card shown, counting linked tasks the filters hide', () => {
    render([parent, done, open], { shown: [parent] });
    act(() => checkbox(1).click());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(card(1).textContent).toContain('1 linked task is still open.');
  });
});

describe('TasksPanel finishing the last open linked task', () => {
  it("suggests completing the parent with a success banner on the parent's card", () => {
    render([parent, done, open]);
    act(() => checkbox(3).click());
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(3);
    // The toggle updates the list optimistically.
    render([parent, done, { ...open, completed: true }]);
    expect(card(1).textContent).toContain('All linked tasks are done. Mark Apply to Google complete?');

    act(() => within(1, 'Mark complete').click());
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(1);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });

  it('"Not yet" dismisses the banner, and it does not show while others are still open', () => {
    const other = task(4, 'Cover letter', { parent_task_id: 1, position: 2 });
    render([parent, done, open, other]);
    act(() => checkbox(3).click());
    render([parent, done, { ...open, completed: true }, other]);
    expect(container.textContent).not.toContain('All linked tasks are done');

    act(() => checkbox(4).click());
    render([parent, done, { ...open, completed: true }, { ...other, completed: true }]);
    click('Not yet');
    expect(container.textContent).not.toContain('All linked tasks are done');
  });

  it('offers to complete the parent in a toast when the filters hide its card', () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    const onShowAll = vi.fn();
    render([parent, done, open], { shown: [open], onShowAll });
    act(() => checkbox(3).click());
    render([parent, done, { ...open, completed: true }], { shown: [{ ...open, completed: true }], onShowAll });
    act(() => { vi.advanceTimersByTime(60); });
    expect(showToast).toHaveBeenCalledWith(
      'All linked tasks are done. “Apply to Google” is hidden by your filters.',
      'info',
      [expect.objectContaining({ label: 'Complete “Apply to Google”' }), expect.objectContaining({ label: 'Show it' })],
    );
    const [complete, showIt] = showToast.mock.calls[0][2];

    act(() => showIt.onClick());
    expect(onShowAll).toHaveBeenCalled();
    render([parent, done, { ...open, completed: true }], { onShowAll });
    expect(card(1).classList.contains('task-flash')).toBe(true);
    expect(card(1).textContent).toContain('All linked tasks are done. Mark Apply to Google complete?');

    act(() => complete.onClick());
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(1);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });

  it("the toast's Complete does nothing once the parent no longer waits on it", () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    render([parent, done, open], { shown: [open] });
    act(() => checkbox(3).click());
    const closed = { ...open, completed: true };
    render([parent, done, closed], { shown: [closed] });
    act(() => { vi.advanceTimersByTime(60); });
    const [complete] = [showToast.mock.calls[0][2]].flat();
    handlers.onToggleComplete.mockClear();

    // The linked task was reopened (or its toggle rolled back).
    render([parent, done, open], { shown: [open] });
    act(() => complete.onClick());
    // The parent was completed elsewhere.
    render([{ ...parent, completed: true }, done, closed], { shown: [closed] });
    act(() => complete.onClick());
    // The parent was deleted.
    render([done, closed], { shown: [closed] });
    act(() => complete.onClick());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
  });

  it('shows no toast when the parent card is in the list', () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    render([parent, done, open]);
    act(() => checkbox(3).click());
    render([parent, done, { ...open, completed: true }]);
    act(() => { vi.advanceTimersByTime(60); });
    expect(showToast).not.toHaveBeenCalled();
  });

  it('drops the banner when the toggle fails and the list rolls back', () => {
    render([parent, done, open]);
    act(() => checkbox(3).click());
    render([parent, done, open]);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });
});

describe('TasksPanel with linked tasks nested deeper', () => {
  // Mock interview (3) has its own linked tasks: Practice (4, open) and Room (6, done).
  const practice = task(4, 'Practice questions', { parent_task_id: 3, position: 0 });
  const room = task(6, 'Book a quiet room', { parent_task_id: 3, position: 1, completed: true });

  it("asks before completing a linked task whose own linked tasks are open, on that task's card", () => {
    render([parent, done, open, practice, room]);
    act(() => checkbox(3).click());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(card(3).querySelector('[role="status"]')?.textContent).toContain('1 linked task is still open.');

    click('Complete all');
    expect(handlers.onCompleteWithLinked).toHaveBeenCalledWith(3);
    expect(container.textContent).not.toContain('still open');
  });

  it("counts open tasks at every depth in the parent's banner", () => {
    render([parent, done, open, practice, room]);
    act(() => checkbox(1).click());
    expect(container.textContent).toContain('2 linked tasks are still open.');
  });

  it('asks even when the direct linked tasks are done but a deeper one is open', () => {
    // Mock interview was completed on its own, leaving Practice questions open under it.
    render([parent, done, { ...open, completed: true }, practice, room]);
    act(() => checkbox(1).click());
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
    expect(container.textContent).toContain('1 linked task is still open.');
  });

  it('suggests completing the task right above, not the original task, when its last open linked task is done', () => {
    render([parent, done, open, practice, room]);
    act(() => checkbox(4).click());
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(4);
    render([parent, done, open, { ...practice, completed: true }, room]);
    expect(card(3).querySelector('[role="status"]')?.textContent)
      .toContain('All linked tasks are done. Mark Mock interview complete?');
    expect(container.textContent).not.toContain('Mark Apply to Google complete?');

    act(() => within(3, 'Mark complete').click());
    expect(handlers.onToggleComplete).toHaveBeenLastCalledWith(3);
  });

  it('does not suggest completing the parent while a task deeper under it is still open', () => {
    // Mock interview was completed on its own, leaving Practice questions open under it.
    const completedOpen = { ...open, completed: true };
    const cover = task(7, 'Cover letter', { parent_task_id: 1, position: 2 });
    render([parent, done, completedOpen, practice, room, cover]);
    act(() => checkbox(7).click());
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(7);
    render([parent, done, completedOpen, practice, room, { ...cover, completed: true }]);
    expect(container.textContent).not.toContain('All linked tasks are done');
  });
});

describe('TasksPanel deleting or archiving a parent', () => {
  const radio = (value: string) =>
    document.body.querySelector<HTMLInputElement>(`input[name="linked-remove-mode"][value="${value}"]`)!;

  it('asks first, with "Keep them" picked by default, and passes linked=keep', () => {
    render([parent, done, open]);
    act(() => within(1, 'Delete task').click());
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

  it('previews what each choice does, at every depth', () => {
    const practice = task(4, 'Practice questions', { parent_task_id: 3 });
    render([parent, done, open, practice]);
    act(() => within(1, 'Delete task').click());
    const text = document.body.textContent!;
    expect(text).toContain('It has 3 linked tasks (2 directly under it).');
    expect(text).toContain('Update résumé becomes a standalone task');
    expect(text).toContain('Mock interview becomes a standalone task, and keeps its 1 linked task');
    expect(text).toContain('Practice questions now names Mock interview as its original task');

    act(() => radio('cascade').click());
    const items = [...document.body.querySelectorAll('[role="dialog"] li')].map(li => li.textContent);
    expect(items).toEqual(['Update résumé', 'Mock interview', 'Practice questions']);
  });

  it('asks before deleting a linked task that has linked tasks of its own', () => {
    const practice = task(4, 'Practice questions', { parent_task_id: 3 });
    render([parent, done, open, practice]);
    act(() => within(3, 'Delete task').click());
    expect(document.body.textContent).toContain('Delete “Mock interview”?');
    expect(document.body.textContent).toContain('It has 1 linked task.');
  });

  it('passes linked=cascade when "Archive them too" is picked', () => {
    render([parent, done, open]);
    act(() => within(1, 'Archive task').click());
    expect(document.body.textContent).toContain('Archive them too');
    act(() => radio('cascade').click());
    click('Archive');
    expect(handlers.onArchiveTask).toHaveBeenCalledWith(parent, 'cascade');
  });

  it('Cancel closes the dialog without deleting', () => {
    render([parent, done, open]);
    act(() => within(1, 'Delete task').click());
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

describe('TasksPanel creating a linked task from a card', () => {
  const school = { id: 9, name: 'School', color: '#123456' };
  const tagged = { ...parent, tags: [school], due_date: '2026-10-30' };
  const form = () => container.querySelector<HTMLFormElement>('form[aria-label="New linked task for Apply to Google"]');
  const input = (selector: string) => form()!.querySelector<HTMLInputElement>(selector)!;
  const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => act(() => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const flush = () => act(async () => { await Promise.resolve(); });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('opens a full form under the card, with the parent in the trail and its tags picked', () => {
    render([tagged, done, open], { tags: [school], onCreateLinkedTask: vi.fn() });
    act(() => within(1, 'Add a linked task to Apply to Google').click());
    expect(card(1).nextElementSibling).toBe(form());
    expect(form()!.textContent).toContain('Leads up to');
    expect(form()!.textContent).toContain('Apply to Google');
    for (const field of ['input[type="text"]', 'input[type="date"]', 'input[type="time"]', 'select', 'textarea']) {
      expect(form()!.querySelector(field)).not.toBeNull();
    }
    expect(form()!.textContent).toContain('Starts with “Apply to Google”’s tags.');
    expect(form()!.textContent).toContain('Selected:School');
    expect(button('Day before “Apply to Google”')).toBeDefined();
  });

  it('creates the task with every field under the parent, then closes', async () => {
    vi.useFakeTimers();
    const createdTask = task(10, 'Practice questions', { parent_task_id: 1 });
    const onCreateLinkedTask = vi.fn<NonNullable<Props['onCreateLinkedTask']>>().mockResolvedValue(createdTask);
    render([tagged, done, open], { tags: [school], onCreateLinkedTask });
    act(() => within(1, 'Add a linked task to Apply to Google').click());

    type(input('input[type="text"]'), 'Practice questions');
    click('Day before “Apply to Google”');
    type(input('input[type="time"]'), '17:00');
    type(form()!.querySelector('textarea')!, 'Two mediums a day');
    click('Create linked task');
    await flush();

    expect(onCreateLinkedTask).toHaveBeenCalledWith(tagged, expect.objectContaining({
      title: 'Practice questions',
      due_date: '2026-10-29',
      due_time: '17:00',
      description: 'Two mediums a day',
      tags: [school],
    }));
    expect(form()).toBeNull();

    render([tagged, done, open, createdTask], { tags: [school], onCreateLinkedTask });
    act(() => { vi.advanceTimersByTime(60); });
    expect(card(10).classList.contains('task-flash')).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Created “Practice questions” under “Apply to Google”.', 'success');
  });

  it('"Create and add another" keeps the form open with the due date for the next one', async () => {
    const onCreateLinkedTask = vi.fn<NonNullable<Props['onCreateLinkedTask']>>()
      .mockResolvedValue(task(10, 'One', { parent_task_id: 1 }));
    render([tagged, done, open], { tags: [school], onCreateLinkedTask });
    act(() => within(1, 'Add a linked task to Apply to Google').click());
    type(input('input[type="text"]'), 'One');
    click('Same day');
    click('Create and add another');
    await flush();

    expect(onCreateLinkedTask).toHaveBeenCalledTimes(1);
    expect(form()).not.toBeNull();
    expect(input('input[type="text"]').value).toBe('');
    expect(input('input[type="date"]').value).toBe('2026-10-30');
  });

  it('asks for a title before creating anything, and Cancel closes the form', async () => {
    const onCreateLinkedTask = vi.fn();
    render([tagged], { tags: [school], onCreateLinkedTask });
    act(() => within(1, 'Add a linked task to Apply to Google').click());
    click('Create linked task');
    await flush();
    expect(onCreateLinkedTask).not.toHaveBeenCalled();
    expect(form()!.textContent).toContain('Give the linked task a title.');
    click('Cancel');
    expect(form()).toBeNull();
  });

  it('warns when the new task is due after its parent', () => {
    render([tagged], { tags: [school], onCreateLinkedTask: vi.fn() });
    act(() => within(1, 'Add a linked task to Apply to Google').click());
    act(() => {
      const el = input('input[type="date"]');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '2026-11-02');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(form()!.textContent).toContain('This is due after “Apply to Google” (Oct 30). Saving is still allowed.');
  });

  it('stays open when creating fails', async () => {
    const onCreateLinkedTask = vi.fn<NonNullable<Props['onCreateLinkedTask']>>().mockResolvedValue(false);
    render([tagged], { tags: [school], onCreateLinkedTask });
    act(() => within(1, 'Add a linked task to Apply to Google').click());
    type(input('input[type="text"]'), 'Practice');
    click('Create linked task');
    await flush();
    expect(form()).not.toBeNull();
    expect(input('input[type="text"]').value).toBe('Practice');
  });

  it('offers no "+ Linked task" without a way to create one', () => {
    render([parent]);
    expect(button('Add a linked task to Apply to Google')).toBeUndefined();
  });
});

describe('TasksPanel tasks added from Canvas', () => {
  const fromCanvas = task(7, 'Problem Set 6', {
    canvas_assignment_id: 9876,
    canvas_html_url: 'https://sdsu.instructure.com/courses/1001/assignments/9876',
  });

  it('offers to mark a task complete once Canvas shows it submitted', () => {
    const onNotYet = vi.fn();
    render([fromCanvas, solo], { canvasSubmitted: { shows: t => t.id === 7, onNotYet } });
    expect(container.textContent).toContain('Canvas shows this submitted.');
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
    click('Mark complete');
    expect(handlers.onToggleComplete).toHaveBeenCalledWith(7);
  });

  it('"Not yet" hands the task to onNotYet without completing it', () => {
    const onNotYet = vi.fn();
    render([fromCanvas], { canvasSubmitted: { shows: () => true, onNotYet } });
    click('Not yet');
    expect(onNotYet).toHaveBeenCalledWith(7);
    expect(handlers.onToggleComplete).not.toHaveBeenCalled();
  });

  it('shows no banner while Canvas has nothing to say', () => {
    render([fromCanvas], { canvasSubmitted: { shows: () => false, onNotYet: vi.fn() } });
    expect(container.textContent).not.toContain('Canvas shows this submitted.');
  });
});
