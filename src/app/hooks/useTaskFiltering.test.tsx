// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FilterType, Tag, Task } from '@/app/types/task';
import { useTaskFiltering } from './useTaskFiltering';

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

const sortOrder = { all: 'asc', active: 'asc', completed: 'asc', priority: 'asc', created: 'asc', duration: 'asc' } as const;

let container: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useTaskFiltering>;

type ProbeProps = { filter: FilterType; search?: string; selectedTags?: Tag[] };
const Probe: React.FC<ProbeProps & { onResult: (r: typeof result) => void }> = ({ filter, search = '', selectedTags = [], onResult }) => {
  const r = useTaskFiltering(tasks, filter, sortOrder, search, selectedTags);
  useEffect(() => onResult(r));
  return null;
};
const run = (props: ProbeProps) => {
  act(() => root.render(<Probe {...props} onResult={r => { result = r; }} />));
  return result.taskGroups.map(g => [g.task.title, g.linked.map(t => t.title), `${g.linkedDone}/${g.linkedTotal}`]);
};

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => act(() => root.unmount()));

describe('useTaskFiltering with linked tasks', () => {
  it('nests linked tasks under their parent instead of listing them top-level', () => {
    expect(run({ filter: 'all' })).toEqual([
      ['Laundry', [], '0/0'],
      ['Apply to Google', ['Update résumé', 'Mock interview', 'Ask for a reference'], '1/3'],
    ]);
  });

  it('keeps the parent when a search matches only a linked task', () => {
    expect(run({ filter: 'all', search: 'mock' })).toEqual([
      ['Apply to Google', ['Mock interview'], '1/3'],
    ]);
  });

  it('keeps the parent when a tag filter matches only a linked task', () => {
    expect(run({ filter: 'all', selectedTags: [school] })).toEqual([
      ['Apply to Google', ['Mock interview'], '1/3'],
    ]);
  });

  it('keeps the parent when the completed filter matches only a linked task', () => {
    expect(run({ filter: 'completed' })).toEqual([
      ['Apply to Google', ['Update résumé'], '1/3'],
    ]);
  });

  it('counts each task once in the stats', () => {
    run({ filter: 'all' });
    expect(result.stats.total.tasks).toHaveLength(5);
    expect(result.stats.completed.tasks).toHaveLength(1);
  });
});
