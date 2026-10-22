// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Tag, Task, TaskView } from '@/app/types/task';
import { DEFAULT_TASK_VIEW, isTaskView, useTaskFiltering } from './useTaskFiltering';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const school: Tag = { id: 1, name: 'School', color: '#123456' };
const task = (id: number, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', completed: false, priority: null, due_date: null, due_time: null,
  tags: [], created_date: '2026-10-01', completed_date: null, parent_task_id: null, ...extra,
});

// "Apply to Google" has three linked tasks; "Laundry" stands alone.
const tasks = [
  task(1, 'Apply to Google', { due_date: '2026-10-30' }),
  task(2, 'Update résumé', { parent_task_id: 1, completed: true, due_date: '2026-10-21' }),
  task(3, 'Mock interview', { parent_task_id: 1, tags: [school] }),
  task(4, 'Ask for a reference', { parent_task_id: 1 }),
  task(5, 'Laundry', { due_date: '2026-10-25' }),
];

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useTaskFiltering>;

type ProbeProps = { view?: Partial<TaskView>; search?: string; selectedTags?: Tag[]; list?: Task[] };
const Probe: React.FC<ProbeProps & { onResult: (r: typeof result) => void }> = ({ view, search = '', selectedTags = [], list = tasks, onResult }) => {
  const r = useTaskFiltering(list, { ...DEFAULT_TASK_VIEW, ...view }, search, selectedTags);
  useEffect(() => onResult(r));
  return null;
};
const run = (props: ProbeProps) => {
  act(() => root.render(<Probe {...props} onResult={r => { result = r; }} />));
  return result.taskGroups.map(g => [g.task.title, g.linked.map(l => l.task.title), `${g.linkedDone}/${g.linkedTotal}`]);
};

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

describe('useTaskFiltering with linked tasks', () => {
  it('nests linked tasks under their parent instead of listing them top-level', () => {
    expect(run({})).toEqual([
      ['Laundry', [], '0/0'],
      ['Apply to Google', ['Update résumé', 'Mock interview', 'Ask for a reference'], '1/3'],
    ]);
  });

  it('keeps the parent when a search matches only a linked task', () => {
    expect(run({ search: 'mock' })).toEqual([
      ['Apply to Google', ['Mock interview'], '1/3'],
    ]);
  });

  it('keeps the parent when a tag filter matches only a linked task', () => {
    expect(run({ selectedTags: [school] })).toEqual([
      ['Apply to Google', ['Mock interview'], '1/3'],
    ]);
  });

  it('keeps the parent when the completed filter matches only a linked task', () => {
    expect(run({ view: { show: 'done' } })).toEqual([
      ['Apply to Google', ['Update résumé'], '1/3'],
    ]);
  });

  it('counts each task once in the stats', () => {
    run({});
    expect(result.stats.total.tasks).toHaveLength(5);
    expect(result.stats.completed.tasks).toHaveLength(1);
  });
});

// Four standalone tasks, each one ranking differently by each sort key.
const essay = task(11, 'Essay', { due_date: '2026-10-24', priority: 2, estimated_time: 90, created_date: '2026-10-03' });
const quiz = task(12, 'Quiz', { due_date: '2026-10-22', priority: 3, estimated_time: 30, created_date: '2026-10-01' });
const gym = task(13, 'Gym', { due_date: '2026-10-23', priority: null, estimated_time: 60, created_date: '2026-10-04', completed: true });
const read = task(14, 'Read', { due_date: null, priority: 1, estimated_time: null, created_date: '2026-10-02' });
const flat = [essay, quiz, gym, read];
const titles = (props: ProbeProps) => run({ list: flat, ...props }).map(([title]) => title);

describe('useTaskFiltering show and sort', () => {
  it('shows open, completed or all tasks', () => {
    expect(titles({ view: { show: 'open' } })).toEqual(['Quiz', 'Essay', 'Read']);
    expect(titles({ view: { show: 'done' } })).toEqual(['Gym']);
    expect(titles({ view: { show: 'all' } })).toEqual(['Quiz', 'Gym', 'Essay', 'Read']);
  });

  it('sorts by each key, with tasks missing a value last going up', () => {
    expect(titles({ view: { sortKey: 'due' } })).toEqual(['Quiz', 'Gym', 'Essay', 'Read']);
    expect(titles({ view: { sortKey: 'priority' } })).toEqual(['Read', 'Essay', 'Quiz', 'Gym']);
    expect(titles({ view: { sortKey: 'duration' } })).toEqual(['Quiz', 'Gym', 'Essay', 'Read']);
    expect(titles({ view: { sortKey: 'created' } })).toEqual(['Quiz', 'Read', 'Essay', 'Gym']);
  });

  it('reverses the order going down', () => {
    expect(titles({ view: { sortKey: 'priority', sortOrder: 'desc' } })).toEqual(['Gym', 'Quiz', 'Essay', 'Read']);
    expect(titles({ view: { sortKey: 'created', sortOrder: 'desc' } })).toEqual(['Gym', 'Essay', 'Read', 'Quiz']);
  });

  it('combines show with sort', () => {
    expect(titles({ view: { show: 'open', sortKey: 'duration', sortOrder: 'desc' } })).toEqual(['Read', 'Essay', 'Quiz']);
  });
});

describe('isTaskView', () => {
  it('accepts a saved view and rejects anything else', () => {
    expect(isTaskView({ show: 'done', sortKey: 'priority', sortOrder: 'desc' })).toBe(true);
    expect(isTaskView({ show: 'completed', sortKey: 'due', sortOrder: 'asc' })).toBe(false);
    expect(isTaskView('all')).toBe(false);
    expect(isTaskView(null)).toBe(false);
  });
});
