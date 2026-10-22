// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseTaskForm, LinkedTaskRef, Task } from '@/app/types/task';
import { LinkedTasksSaveError } from '@/app/utils/linkedTasks';
import EditTaskModal from './EditTaskModal';
import NewTaskModal from './NewTaskModal';
import type { TaskFormData } from './TaskFormFields';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

const allTasks = [
  task(1, 'Apply to internships', { due_date: '2026-11-15' }),
  task(2, 'Prepare for Google phone screen'),
  task(3, 'Mock interview with Dana', { parent_task_id: 2, position: 0, due_date: '2026-10-25', estimated_time: 1 }),
  task(4, 'Update résumé', { parent_task_id: 1, position: 1, completed: true, estimated_time: 2 }),
  task(5, 'Read the job posting', { parent_task_id: 1, position: 0, due_date: '2026-11-20' }),
  task(6, 'Read DDIA chapter 5'),
];

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

type Submit = (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task) => Promise<void>;

function NewHarness({ onSubmit }: { onSubmit: Submit }) {
  const [form, setForm] = useState({
    id: 0, title: 'Apply to summer internships', description: '', priority: null, due_date: '2026-11-01',
    due_time: '', tags: [], category: null, estimated_time: null, created_date: '',
  } as BaseTaskForm);
  return (
    <NewTaskModal
      isOpen onClose={() => {}} newTask={form} onTaskChange={setForm} tags={[]} onToggleTag={() => {}}
      onSubmit={onSubmit} activeTaskCount={1} usedPriorityLevels={[]} allTasks={allTasks}
    />
  );
}

function EditHarness({ initial, onSubmit, onChange = () => {}, tasks = allTasks }: {
  initial: Task; onSubmit: Submit; onChange?: (t: TaskFormData) => void; tasks?: Task[];
}) {
  const [t, setT] = useState(initial);
  return (
    <EditTaskModal
      isOpen task={t} onClose={() => {}} onTaskChange={next => { onChange(next); setT({ ...t, ...next } as Task); }}
      tags={[]} onToggleTag={() => {}} onSubmit={onSubmit} activeTaskCount={1} usedPriorityLevels={[]}
      allTasks={tasks} onOpenTask={setT}
    />
  );
}

const doc = () => container.ownerDocument;
const button = (label: string) => doc().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const buttonByText = (text: string) => [...doc().querySelectorAll('button')].find(b => b.textContent === text)!;
const rowTitles = () =>
  [...doc().querySelectorAll('ul[aria-labelledby="linked-tasks-label"] > li')].map(li =>
    li.querySelector<HTMLInputElement>('input')?.value ?? li.querySelector('span.truncate')?.textContent ?? '');
const search = () => doc().querySelector<HTMLInputElement>('input[role="combobox"]')!;
const newTitleInput = () => doc().querySelector<HTMLInputElement>('input[aria-labelledby="linked-new-label"]')!;

function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const key = (el: Element, k: string) =>
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
const submit = async () => {
  await act(async () => {
    doc().querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
};

describe('LinkedTasksField on the new-task form', () => {
  it('links an existing task, adds a new one, reorders and removes, then saves them in order', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<NewHarness onSubmit={onSubmit} />));
    expect(doc().body.textContent).toContain('No linked tasks yet');

    act(() => search().focus());
    type(search(), 'mock');
    const option = doc().querySelector('[role="option"]')!;
    expect(option.textContent).toContain('Mock interview with Dana');
    expect(option.textContent).toContain('Already linked to “Prepare for Google phone screen”. Linking moves it here');
    key(search(), 'Enter');

    type(newTitleInput(), 'Ask Prof. Kim for a reference letter');
    key(newTitleInput(), 'Enter');
    type(search(), 'DDIA');
    act(() => (doc().querySelector('[role="option"]') as HTMLElement).click());
    expect(rowTitles()).toEqual(['Mock interview with Dana', 'Ask Prof. Kim for a reference letter', 'Read DDIA chapter 5']);
    expect(doc().body.textContent).toContain('0 of 3 done');
    expect(doc().body.textContent).toContain('1 new task created on save');
    expect(doc().body.textContent).toContain('1 hr estimated across linked tasks');

    act(() => button('Move Read DDIA chapter 5 up').click());
    key(button('Reorder Mock interview with Dana. Use the up and down arrow keys'), 'ArrowDown');
    expect(rowTitles()).toEqual(['Read DDIA chapter 5', 'Mock interview with Dana', 'Ask Prof. Kim for a reference letter']);
    act(() => button('Remove Mock interview with Dana').click());
    expect(rowTitles()).toEqual(['Read DDIA chapter 5', 'Ask Prof. Kim for a reference letter']);

    await submit();
    expect(onSubmit).toHaveBeenCalledWith(
      expect.anything(), [{ id: 6 }, { title: 'Ask Prof. Kim for a reference letter' }], undefined,
    );
  });

  it('highlights the first option when ArrowDown reopens a closed picker', () => {
    act(() => root.render(<NewHarness onSubmit={vi.fn()} />));
    act(() => search().focus());
    type(search(), 'read');
    key(search(), 'Escape');
    expect(doc().querySelector('[role="option"]')).toBeNull();
    key(search(), 'ArrowDown');
    const first = doc().querySelector('[role="option"]')!;
    expect(search().getAttribute('aria-activedescendant')).toBe(first.id);
    key(search(), 'Enter');
    expect(rowTitles()).toHaveLength(1);
    expect(first.textContent).toContain(rowTitles()[0]);
  });

  it('links a task that has linked tasks of their own', () => {
    act(() => root.render(<NewHarness onSubmit={vi.fn()} />));
    act(() => search().focus());
    type(search(), 'google');
    const option = doc().querySelector('[role="option"]')!;
    expect(option.getAttribute('aria-disabled')).toBe('false');
    expect(doc().body.textContent).not.toContain("Can't be linked here");
    key(search(), 'Enter');
    expect(rowTitles()).toEqual(['Prepare for Google phone screen']);
  });

  it('warns when a linked task is due after this one', () => {
    act(() => root.render(<NewHarness onSubmit={vi.fn()} />));
    act(() => search().focus());
    type(search(), 'job posting');
    key(search(), 'Enter');
    expect(doc().body.textContent).toContain('Read the job posting is due after this task (Nov 1). Saving is still allowed.');
  });

  it('blocks saving a new linked task without a title', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<NewHarness onSubmit={onSubmit} />));
    type(newTitleInput(), 'Draft cover letter');
    key(newTitleInput(), 'Enter');
    type(doc().querySelector<HTMLInputElement>('input[aria-label="New linked task title"]')!, '  ');
    await submit();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(doc().querySelector('[role="alert"]')?.textContent).toBe('Give each new linked task a title, or remove it.');
  });

  it('shows a failed link save inline and retries without creating the task again', async () => {
    const created = task(50, 'Apply to summer internships');
    const onSubmit = vi.fn<Submit>()
      .mockRejectedValueOnce(new LinkedTasksSaveError(created, 'Task 6 is archived; restore it before linking it'))
      .mockResolvedValueOnce(undefined);
    act(() => root.render(<NewHarness onSubmit={onSubmit} />));
    act(() => search().focus());
    type(search(), 'DDIA');
    key(search(), 'Enter');

    await submit();
    expect(doc().querySelector('[role="alert"]')?.textContent).toBe(
      'The task was created, but its linked tasks weren\'t saved: “Read DDIA chapter 5” is archived; restore it before linking it',
    );
    expect(buttonByText('Save Changes')).toBeTruthy();

    await submit();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), [{ id: 6 }], created);
  });
});

describe('LinkedTasksField on the edit-task form', () => {
  it('starts from the saved order with progress, and saves only when the list changed', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<EditHarness initial={allTasks[0]} onSubmit={onSubmit} />));
    expect(rowTitles()).toEqual(['Read the job posting', 'Update résumé']);
    expect(doc().body.textContent).toContain('1 of 2 done');
    expect(doc().querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('1');

    await submit();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), undefined);

    act(() => button('Move Update résumé up').click());
    await submit();
    expect(onSubmit).toHaveBeenLastCalledWith(expect.anything(), [{ id: 4 }, { id: 5 }]);
  });

  it('shows a failed link save inline', async () => {
    const onSubmit = vi.fn<Submit>().mockRejectedValue(
      new LinkedTasksSaveError(allTasks[0], 'Linking task 2 under task 1 would create a loop'),
    );
    act(() => root.render(<EditHarness initial={allTasks[0]} onSubmit={onSubmit} />));
    act(() => button('Remove Read the job posting').click());
    await submit();
    expect(doc().querySelector('[role="alert"]')?.textContent).toBe(
      'The task was saved, but its linked tasks weren\'t: Linking “Prepare for Google phone screen” under “Apply to internships” would create a loop',
    );
  });

  it('shows "Leads up to" on a linked task, which can be unlinked and undone', () => {
    const onChange = vi.fn();
    act(() => root.render(<EditHarness initial={allTasks[2]} onSubmit={vi.fn()} onChange={onChange} />));
    expect(doc().body.textContent).toContain('Leads up to');
    expect(button('Open parent task Prepare for Google phone screen')).not.toBeNull();

    act(() => buttonByText('Unlink').click());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parent_task_id: null }));
    expect(doc().body.textContent).toContain('Unlinked. Save to make it a standalone task again.');
    // The trail stays, struck through and no longer a link, until Undo.
    expect(doc().body.textContent).toContain('Prepare for Google phone screen');
    expect(button('Open parent task Prepare for Google phone screen')).toBeNull();

    act(() => buttonByText('Undo').click());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parent_task_id: 2 }));
  });

  it('gives a linked task the full editor, with linked tasks of its own', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<EditHarness initial={allTasks[2]} onSubmit={onSubmit} />));
    expect(search()).toBeTruthy();
    expect(newTitleInput()).toBeTruthy();
    type(newTitleInput(), 'Book a quiet room');
    key(newTitleInput(), 'Enter');
    await submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), [{ title: 'Book a quiet room' }]);
  });

  it('shows the whole trail above a deeply linked task and opens any task in it', () => {
    const deeper = task(7, 'Book a quiet room', { parent_task_id: 3, position: 0 });
    const tasks = [...allTasks, deeper];
    act(() => root.render(<EditHarness initial={deeper} onSubmit={vi.fn()} tasks={tasks} />));
    expect(doc().querySelector('[title="Leads up to Prepare for Google phone screen › Mock interview with Dana"]'))
      .not.toBeNull();

    act(() => button('Open parent task Mock interview with Dana').click());
    // The editor now shows Mock interview with Dana, with its own parent above it and its linked task in its list.
    expect(doc().querySelector<HTMLInputElement>('input[placeholder="Enter task title"]')!.value)
      .toBe('Mock interview with Dana');
    expect(doc().querySelector('[title="Leads up to Prepare for Google phone screen"]')).not.toBeNull();
    expect(rowTitles()).toEqual(['Book a quiet room']);
  });

  it("offers neither the task's own parents nor itself when linking under a nested task", () => {
    const deeper = task(7, 'Book a quiet room', { parent_task_id: 3, position: 0 });
    act(() => root.render(<EditHarness initial={deeper} onSubmit={vi.fn()} tasks={[...allTasks, deeper]} />));
    act(() => search().focus());
    type(search(), 'o');
    const blocked = [...doc().querySelectorAll('[role="option"][aria-disabled="true"]')].map(o => o.textContent);
    expect(blocked).toHaveLength(2);
    expect(blocked.every(text => text?.includes('Would create a loop'))).toBe(true);
    const offered = [...doc().querySelectorAll('[role="option"]')].map(o => o.textContent ?? '');
    expect(offered.some(text => text.includes('Book a quiet room'))).toBe(false);
  });
});
