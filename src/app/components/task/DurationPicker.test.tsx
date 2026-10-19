// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditTaskModal from './EditTaskModal';
import NewTaskModal from './NewTaskModal';
import type { TaskFormData } from './TaskFormFields';
import type { BaseTaskForm, Task } from '@/app/types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

const baseTask = {
  title: 'Write report',
  description: '',
  priority: null,
  due_date: null,
  due_time: null,
  tags: [],
  estimated_time: 1.5,
};

function EditHarness({ onSubmit, onChange }: { onSubmit: () => void; onChange: (t: TaskFormData) => void }) {
  const [task, setTask] = useState({ ...baseTask, id: 1 } as unknown as Task);
  return (
    <EditTaskModal
      isOpen
      task={task}
      onClose={() => {}}
      onTaskChange={next => { onChange(next); setTask(next as Task); }}
      tags={[]}
      onToggleTag={() => {}}
      onSubmit={onSubmit}
      activeTaskCount={1}
      usedPriorityLevels={[]}
    />
  );
}

function NewHarness({ onSubmit, onChange }: { onSubmit: () => void; onChange: (t: BaseTaskForm) => void }) {
  const [task, setTask] = useState({ ...baseTask, estimated_time: null } as unknown as BaseTaskForm);
  return (
    <NewTaskModal
      isOpen
      newTask={task}
      onClose={() => {}}
      onTaskChange={next => { onChange(next); setTask(next); }}
      tags={[]}
      onToggleTag={() => {}}
      onSubmit={onSubmit}
      activeTaskCount={1}
      usedPriorityLevels={[]}
    />
  );
}

const customInput = () => document.querySelector<HTMLInputElement>('input[aria-label="Custom duration in hours"]');
const form = () => document.querySelector('form')!;

function clickButton(label: string) {
  const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === label)!;
  act(() => btn.click());
}

function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function submit() {
  act(() => form().requestSubmit());
}

describe('DurationPicker invalid custom input', () => {
  it('blocks Edit Task submission and keeps the existing estimate', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    act(() => root.render(<EditHarness onSubmit={onSubmit} onChange={onChange} />));

    type(customInput()!, '1.5h');
    submit();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();

    type(customInput()!, '2');
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estimated_time: 2 }));
  });

  it('blocks New Task submission until the custom text is cleared', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    act(() => root.render(<NewHarness onSubmit={onSubmit} onChange={onChange} />));

    clickButton('Custom');
    type(customInput()!, 'abc');
    submit();

    expect(onSubmit).not.toHaveBeenCalled();

    type(customInput()!, '');
    submit();

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estimated_time: null }));
  });

  it('allows submission after closing Custom while its text is invalid', () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    act(() => root.render(<EditHarness onSubmit={onSubmit} onChange={onChange} />));

    type(customInput()!, '-1');
    clickButton('Custom');
    submit();

    expect(customInput()).toBeNull();
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ estimated_time: null }));
  });
});
