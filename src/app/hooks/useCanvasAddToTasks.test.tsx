// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasItem } from '@/app/types/canvas';
import type { BaseTaskForm, Tag, Task } from '@/app/types/task';

vi.mock('@/app/lib/supabase', () => ({ supabase: { auth: { getSession: vi.fn() } } }));

const tasksCtx = {
  tasks: [] as Task[],
  addTask: vi.fn<(form: BaseTaskForm) => Promise<Task | false>>(),
  discardTask: vi.fn<(task: Task) => Promise<boolean>>(),
};
const tagsCtx = { tags: [] as Tag[], setTags: vi.fn(), addTag: vi.fn<(tag: { name: string; color: string }) => Promise<Tag | false>>() };
const showToast = vi.fn();
vi.mock('@/app/context/TasksContext', () => ({ useTasksContext: () => tasksCtx }));
vi.mock('@/app/context/TagsContext', () => ({ useTagsContext: () => tagsCtx }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));

import { CanvasTaskExistsError } from '@/app/lib/backend-api';
import CanvasItemRow from '@/app/components/canvas/CanvasItemRow';
import { useCanvasAddToTasks } from './useCanvasAddToTasks';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const HOST = 'https://sdsu.instructure.com';
const item = (extra: Partial<CanvasItem> = {}): CanvasItem => ({
  id: 9876, kind: 'assignment', title: 'Problem Set 6', course_id: 1001, course_name: 'CS 460: Algorithms',
  due_at: new Date(2026, 9, 23, 23, 59).toISOString(), points_possible: 20,
  html_url: `${HOST}/courses/1001/assignments/9876`, submission: null, ...extra,
});
const task = (id: number, extra: Partial<Task> = {}): Task => ({
  id, title: 'Problem Set 6', description: '', completed: false, priority: null, due_date: '2026-10-23',
  due_time: '23:59', tags: [], created_date: '2026-10-21', completed_date: null, ...extra,
});

const onShowTask = vi.fn();
const lookup = () => ({ label: 'CS 460', color: 'var(--tm-accent)' });
// The tags the picker hands back; the panel's sheet is tested in CanvasAddSheet.test.
let chosen: Tag[] = [];
const latest: { hook?: ReturnType<typeof useCanvasAddToTasks> } = {};

const Rows: React.FC<{ items: CanvasItem[] }> = ({ items }) => {
  const addToTasks = useCanvasAddToTasks(onShowTask);
  useEffect(() => { latest.hook = addToTasks; });
  const rowAdd = { stateOf: addToTasks.stateOf, open: (item: CanvasItem) => void addToTasks.add(item, chosen) };
  return <>{items.map(i => <CanvasItemRow key={i.id} item={i} course={lookup} now={new Date(2026, 9, 21)} addToTasks={rowAdd} />)}</>;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  tasksCtx.tasks = [];
  tagsCtx.tags = [];
  chosen = [];
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

const render = (items: CanvasItem[]) => act(() => root.render(<Rows items={items} />));
const addButton = () => container.querySelector<HTMLButtonElement>('button[aria-label^="Add"]');

describe('Add to tasks on a Canvas item', () => {
  it('creates a task that follows the assignment with the chosen tags, then names them with Undo', async () => {
    chosen = [{ id: 3, name: 'CS 460', color: '#123456' }, { id: 4, name: 'Exam prep', color: '#7C3AED' }];
    const created = task(50, { tags: chosen, canvas_assignment_id: 9876 });
    tasksCtx.addTask.mockResolvedValue(created);
    render([item()]);
    await act(async () => addButton()!.click());

    expect(tasksCtx.addTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Problem Set 6',
      due_date: '2026-10-23',
      due_time: '23:59',
      tags: chosen,
      canvas_assignment_id: 9876,
      canvas_html_url: `${HOST}/courses/1001/assignments/9876`,
      canvas_due_at: item().due_at,
    }));
    expect(showToast).toHaveBeenCalledWith(
      'Added "Problem Set 6" to your tasks with CS 460, Exam prep.', 'success', expect.objectContaining({ label: 'Undo' }),
    );
    showToast.mock.calls[0][2].onClick();
    expect(tasksCtx.discardTask).toHaveBeenCalledWith(created);
  });

  it('says when the task has no tags', async () => {
    tasksCtx.addTask.mockResolvedValue(task(50, { tags: [] }));
    render([item()]);
    await act(async () => addButton()!.click());
    expect(showToast).toHaveBeenCalledWith('Added "Problem Set 6" to your tasks with no tags.', 'success', expect.anything());
  });

  it('adds a tag the backend created to the tag list', async () => {
    const newTag = { id: 9, name: 'Exam prep', color: '#7C3AED' };
    chosen = [{ id: 0, name: 'Exam prep', color: '#7C3AED' }];
    tasksCtx.addTask.mockResolvedValue(task(50, { tags: [newTag] }));
    render([item()]);
    await act(async () => addButton()!.click());
    expect(tasksCtx.addTask.mock.calls[0][0].tags).toEqual([{ id: 0, name: 'Exam prep', color: '#7C3AED' }]);
    const update = tagsCtx.setTags.mock.calls[0][0];
    expect(update([])).toEqual([newTag]);
    expect(update([newTag])).toEqual([newTag]);
  });

  it('says it is already in your tasks on a 409, with a jump to that task', async () => {
    tasksCtx.addTask.mockRejectedValue(new CanvasTaskExistsError(42, '{"task_id":42}'));
    render([item()]);
    await act(async () => addButton()!.click());
    expect(showToast).toHaveBeenCalledWith('Already in your tasks.', 'info', expect.objectContaining({ label: 'Show' }));
    showToast.mock.calls[0][2].onClick();
    expect(onShowTask).toHaveBeenCalledWith(42);
  });

  it('shows "In tasks" instead of the button once a task follows the assignment', () => {
    tasksCtx.tasks = [task(50, { canvas_assignment_id: 9876 })];
    render([item()]);
    expect(addButton()).toBeNull();
    expect(container.textContent).toContain('In tasks');
  });

  it('adds a calendar feed item, which has no submission or points, as a task following its assignment', async () => {
    tasksCtx.addTask.mockResolvedValue(task(51, { canvas_assignment_id: 9876 }));
    // The feed names the assignment only through its link.
    render([item({ id: 555, points_possible: null, course_id: null, course_name: 'CS 460', submission: null })]);
    await act(async () => addButton()!.click());
    expect(tasksCtx.addTask).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Problem Set 6',
      due_date: '2026-10-23',
      canvas_assignment_id: 9876,
      canvas_html_url: `${HOST}/courses/1001/assignments/9876`,
    }));
  });

  it('offers nothing for submitted work or items that are not assignments', () => {
    render([
      item({ submission: { submitted: true, missing: false, late: false, graded: false, excused: false, score: null, grade: null, submitted_at: null, graded_at: null } }),
      item({ id: 2, kind: 'event', html_url: `${HOST}/calendar` }),
    ]);
    expect(addButton()).toBeNull();
    expect(container.textContent).not.toContain('In tasks');
  });

  it('creates a tag on its own, or answers null when that failed', async () => {
    const made = { id: 12, name: 'Exam prep', color: '#7C3AED' };
    tagsCtx.addTag.mockResolvedValueOnce(made).mockResolvedValueOnce(false);
    render([]);
    await expect(latest.hook!.createTag({ name: 'Exam prep', color: '#7C3AED' })).resolves.toEqual(made);
    await expect(latest.hook!.createTag({ name: 'Exam prep', color: '#7C3AED' })).resolves.toBeNull();
  });
});
