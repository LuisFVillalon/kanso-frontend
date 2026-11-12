// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { NewHabit } from '@/app/types/task';

import CreateHabitModal from './CreateHabitModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let latest: NewHabit;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

function Harness({ initial }: { initial: NewHabit }) {
  const [habit, setHabit] = useState(initial);
  const change = (next: NewHabit) => { latest = next; setHabit(next); };
  return (
    <CreateHabitModal isOpen onClose={() => {}} newHabit={habit} onHabitChange={change} onSubmit={e => e.preventDefault()}
      availableTags={[]} />
  );
}

const render = async (initial: NewHabit) => {
  latest = initial;
  await act(async () => root.render(<Harness initial={initial} />));
};

const text = () => document.body.textContent ?? '';

const setGoal = async (value: string) => {
  const input = document.body.querySelector('input[type="number"]') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('CreateHabitModal', () => {
  it('has no usual time field, with or without a daily time goal', async () => {
    await render({ title: 'Read', tags: [], estimated_time: null });
    expect(text()).not.toContain('Usual time');
    await setGoal('0.5');
    expect(latest.estimated_time).toBe(0.5);
    expect(text()).not.toContain('Usual time');
    expect(text()).not.toContain('No set time');
    expect(latest.planned_time).toBeUndefined();
  });
});
