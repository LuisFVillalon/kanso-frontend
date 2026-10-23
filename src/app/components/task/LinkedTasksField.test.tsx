// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseTaskForm, LinkedTaskRef, Tag, Task } from '@/app/types/task';
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

type SaveLinked = (task: Task, linked?: LinkedTaskRef[]) => Promise<boolean>;

function EditHarness({ initial, onSubmit, onChange = () => {}, tasks = allTasks, tags = [], onSaveLinkedTask, onClose = () => {} }: {
  initial: Task; onSubmit: Submit; onChange?: (t: TaskFormData) => void; tasks?: Task[]; tags?: Tag[];
  onSaveLinkedTask?: SaveLinked; onClose?: () => void;
}) {
  const [t, setT] = useState(initial);
  return (
    <EditTaskModal
      isOpen task={t} onClose={onClose} onTaskChange={next => { onChange(next); setT({ ...t, ...next } as Task); }}
      tags={tags} onToggleTag={() => {}} onSubmit={onSubmit} activeTaskCount={1} usedPriorityLevels={[]}
      allTasks={tasks} onSaveLinkedTask={onSaveLinkedTask}
    />
  );
}

/** What PUT /update-linked-tasks gets for a new linked task with just a title (and `extra`). */
const newRef = (title: string, extra: Partial<LinkedTaskRef> = {}) => ({
  title, description: '', priority: null, due_date: null, due_time: null, tags: [],
  estimated_time: null, reminder_minutes: null, ...extra,
});

const doc = () => container.ownerDocument;
const button = (label: string) => doc().querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const buttonByText = (text: string) => [...doc().querySelectorAll('button')].find(b => b.textContent === text)!;
const rowTitles = () =>
  [...doc().querySelectorAll('ul[aria-labelledby="linked-tasks-label"] > li')].map(li =>
    li.querySelector('span.truncate')?.textContent ?? '');
/** The fields of a new linked task's row, while they show. */
const draftFields = () => doc().querySelector<HTMLElement>('li[data-draft^="new-"]:not([hidden]) .border-dashed');
/** The form that's showing: the editor's top one when a linked task is open on top of its parent. */
const visibleForm = () => [...doc().querySelectorAll('form')].find(f => !f.closest('[hidden]'))!;
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
    visibleForm().dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
      expect.anything(), [{ id: 6 }, newRef('Ask Prof. Kim for a reference letter')], undefined,
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
    type(draftFields()!.querySelector<HTMLInputElement>('input[type="text"]')!, '  ');
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

    act(() => buttonByText('Unlink').click());
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ parent_task_id: null }));
    expect(doc().body.textContent).toContain('Unlinked. Save to make it a standalone task again.');
    // The trail stays, struck through, until Undo.
    expect(doc().body.textContent).toContain('Prepare for Google phone screen');

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
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), [newRef('Book a quiet room')]);
  });

  it('shows the whole trail above a deeply linked task as plain text, so edits are never left behind', () => {
    const deeper = task(7, 'Book a quiet room', { parent_task_id: 3, position: 0 });
    const tasks = [...allTasks, deeper];
    act(() => root.render(<EditHarness initial={deeper} onSubmit={vi.fn()} tasks={tasks} />));
    expect(doc().querySelector('[title="Leads up to Prepare for Google phone screen › Mock interview with Dana"]'))
      .not.toBeNull();
    expect(button('Go to Mock interview with Dana')).toBeNull();
    expect(button('Go to original task: Prepare for Google phone screen')).toBeNull();
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

describe('LinkedTasksField new linked tasks with every field', () => {
  const school: Tag = { id: 8, name: 'School', color: '#123456' };
  const gym: Tag = { id: 9, name: 'Gym', color: '#654321' };
  const parentTask = { ...allTasks[0], tags: [school] };
  const addNew = (title: string) => {
    type(newTitleInput(), title);
    key(newTitleInput(), 'Enter');
  };
  const field = (selector: string) => draftFields()!.querySelector<HTMLInputElement>(selector)!;

  it("opens a new row with the task form's fields, starting with this task's tags", () => {
    act(() => root.render(<EditHarness initial={parentTask} onSubmit={vi.fn()} tags={[school, gym]} />));
    addNew('Practice questions');
    const fields = draftFields()!;
    for (const selector of ['input[type="text"]', 'input[type="date"]', 'input[type="time"]', 'select', 'textarea']) {
      expect(fields.querySelector(selector)).not.toBeNull();
    }
    expect(field('input[type="text"]').value).toBe('Practice questions');
    expect(fields.textContent).toContain('Selected:School');
    expect(fields.textContent).toContain('Starts with “Apply to internships”’s tags.');
    expect(button('Hide details of Practice questions').getAttribute('aria-expanded')).toBe('true');
  });

  it('saves the fields set on a new row with the list', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<EditHarness initial={parentTask} onSubmit={onSubmit} tags={[school, gym]} />));
    addNew('Practice questions');
    act(() => buttonByText('Day before “Apply to internshi…”').click());
    type(field('input[type="time"]'), '17:00');
    const tagButton = (name: string) => [...draftFields()!.querySelectorAll('button')].find(b => b.textContent === name)!;
    act(() => tagButton('Gym').click());
    act(() => tagButton('School').click());
    await submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), [
      { id: 5 }, { id: 4 },
      newRef('Practice questions', { due_date: '2026-11-14', due_time: '17:00', tags: [{ id: 9, name: 'Gym', color: '#654321' }] }),
    ]);
  });

  it('hides the fields behind a summary, and shows them again', () => {
    act(() => root.render(<EditHarness initial={parentTask} onSubmit={vi.fn()} />));
    addNew('Practice questions');
    act(() => buttonByText('Same day').click());
    act(() => button('Hide details of Practice questions').click());
    expect(draftFields()).toBeNull();
    expect(doc().body.textContent).toContain('Nov 15');
    act(() => button('Edit details of Practice questions').click());
    expect(field('input[type="date"]').value).toBe('2026-11-15');
  });

  it('opens only the newest row', () => {
    act(() => root.render(<EditHarness initial={parentTask} onSubmit={vi.fn()} />));
    addNew('One');
    addNew('Two');
    expect(button('Edit details of One').getAttribute('aria-expanded')).toBe('false');
    expect(button('Hide details of Two').getAttribute('aria-expanded')).toBe('true');
  });

  it('warns when a new linked task is due after this one', () => {
    act(() => root.render(<EditHarness initial={parentTask} onSubmit={vi.fn()} />));
    addNew('Practice questions');
    type(field('input[type="date"]'), '2026-11-20');
    expect(draftFields()!.textContent).toContain('This is due after “Apply to internships” (Nov 15). Saving is still allowed.');
  });
});

describe('Opening a linked task in the editor', () => {
  const rowOpen = (title: string) => button(`Open ${title}`);

  it('opens a linked task in the same editor, with a link back', () => {
    act(() => root.render(<EditHarness initial={allTasks[0]} onSubmit={vi.fn()} onSaveLinkedTask={vi.fn()} />));
    act(() => rowOpen('Read the job posting').click());
    // The parent's form stays mounted underneath, hidden.
    expect(doc().querySelectorAll('[hidden]')).toHaveLength(1);
    expect(buttonByText('Back to “Apply to internships”')).toBeTruthy();
    expect(visibleForm().querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Read the job posting');
    expect(buttonByText('Save and go back')).toBeTruthy();

    act(() => buttonByText('Back to “Apply to internships”').click());
    expect(doc().querySelectorAll('[hidden]')).toHaveLength(0);
    expect(visibleForm().querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Apply to internships');
  });

  it("saves the opened task and goes back, keeping the parent's unsaved changes", async () => {
    const onSaveLinkedTask = vi.fn<SaveLinked>(async () => true);
    const onSubmit = vi.fn<Submit>(async () => {});
    act(() => root.render(<EditHarness initial={allTasks[0]} onSubmit={onSubmit} onSaveLinkedTask={onSaveLinkedTask} />));
    type(visibleForm().querySelector<HTMLInputElement>('input[type="text"]')!, 'Apply to fall internships');
    act(() => rowOpen('Read the job posting').click());
    type(visibleForm().querySelector<HTMLInputElement>('input[type="text"]')!, 'Read both job postings');
    await submit();

    expect(onSaveLinkedTask).toHaveBeenCalledWith(expect.objectContaining({ id: 5, title: 'Read both job postings' }), undefined);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(doc().querySelectorAll('[hidden]')).toHaveLength(0);
    expect(visibleForm().querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Apply to fall internships');
  });

  it('stays on the opened task when it fails to save, and Cancel goes back without closing', async () => {
    const onClose = vi.fn();
    const onSaveLinkedTask = vi.fn<SaveLinked>(async () => false);
    act(() => root.render(
      <EditHarness initial={allTasks[0]} onSubmit={vi.fn()} onSaveLinkedTask={onSaveLinkedTask} onClose={onClose} />,
    ));
    act(() => rowOpen('Read the job posting').click());
    await submit();
    expect(buttonByText('Save and go back')).toBeTruthy();
    expect(doc().querySelectorAll('[hidden]')).toHaveLength(1);

    act(() => [...visibleForm().querySelectorAll('button')].find(b => b.textContent === 'Cancel')!.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(doc().querySelectorAll('[hidden]')).toHaveLength(0);
  });

  it('drops a linked task unlinked on top from the form below, so saving it does not link it back', async () => {
    const onSubmit = vi.fn<Submit>(async () => {});
    function Harness() {
      const [tasks, setTasks] = useState(allTasks);
      return (
        <EditHarness
          initial={allTasks[0]} tasks={tasks} onSubmit={onSubmit}
          onSaveLinkedTask={async t => { setTasks(prev => prev.map(x => (x.id === t.id ? t : x))); return true; }}
        />
      );
    }
    act(() => root.render(<Harness />));
    act(() => rowOpen('Read the job posting').click());
    act(() => buttonByText('Unlink').click());
    await submit();

    expect(doc().querySelectorAll('[hidden]')).toHaveLength(0);
    expect(rowTitles()).toEqual(['Update résumé']);
    act(() => button('Remove Update résumé').click());
    await submit();
    expect(onSubmit).toHaveBeenCalledWith(expect.anything(), []);
  });

  it('offers no open button without a way to save the opened task', () => {
    act(() => root.render(<EditHarness initial={allTasks[0]} onSubmit={vi.fn()} />));
    expect(rowOpen('Read the job posting')).toBeNull();
  });
});
