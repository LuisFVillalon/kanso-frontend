// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseTaskForm, NewTag, Tag } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import { useTaskHandlers } from './useTaskHandlers';

const WORK: Tag = { id: 7, name: 'Work', color: '#3B82F6' } as Tag;

const draft = (): BaseTaskForm => ({
  id: 0, title: '', description: '', completed: false, urgent: false, tags: [],
  due_date: '', due_time: '', created_date: '',
} as unknown as BaseTaskForm);

let container: HTMLDivElement;
let root: Root;
type Snapshot = { handlers: ReturnType<typeof useTaskHandlers>; newTask: BaseTaskForm; showCreateTag: boolean };
let current: Snapshot;
const record = (snapshot: Snapshot) => { current = snapshot; };

const Harness: React.FC<{ addTag: () => Promise<Tag | false>; onResult: (snapshot: Snapshot) => void }> = ({ addTag, onResult }) => {
  const [newTask, setNewTask] = useState<BaseTaskForm>(draft);
  const [newTag, setNewTag] = useState<NewTag>({ name: 'Work', color: '#3B82F6' });
  const [showCreateTag, setShowCreateTag] = useState(true);
  const handlers = useTaskHandlers({
    setShowNewTaskModal: vi.fn(), setNewTask, setShowEditTaskModal: vi.fn(), setShowCreateTagModal: setShowCreateTag,
    setNewTag, setEditingTag: vi.fn(), setShowEditTagModal: vi.fn(), setTasks: vi.fn(),
    newTask, showEditTaskModal: { status: false, task: null }, newTag,
    addTask: vi.fn(), updateTask: vi.fn(), saveLinkedTasks: vi.fn(), addTag, updateTag: vi.fn(), delTag: vi.fn(),
  });
  onResult({ handlers, newTask, showCreateTag });
  return null;
};

beforeEach(() => {
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
});

describe('useTaskHandlers.handleCreateTag', () => {
  it('creates the tag and closes the form without adding it to the new-task draft', async () => {
    const addTag = vi.fn().mockResolvedValue(WORK);
    await act(async () => root.render(<Harness addTag={addTag} onResult={record} />));
    await act(async () => current.handlers.handleCreateTag({ preventDefault: () => {} } as React.FormEvent));
    expect(addTag).toHaveBeenCalledWith({ name: 'Work', color: '#3B82F6' });
    expect(current.showCreateTag).toBe(false);
    expect(current.newTask.tags).toEqual([]);
  });
});
