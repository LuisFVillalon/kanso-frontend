// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import WeekQuickAdd from './WeekQuickAdd';

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
  container.remove();
  document.body.innerHTML = '';
});

const repeatLabel = (day: Date, termEnd: string | null) => {
  act(() => {
    root.render(
      <WeekQuickAdd
        draft={{ day, startMin: 9 * 60, endMin: 10 * 60, kind: 'event' }}
        anchor={new DOMRect(0, 0, 10, 10)}
        tags={[]}
        termEnd={termEnd}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onMoreOptions={vi.fn()}
      />,
    );
  });
  return document.querySelector('input[type=checkbox]')?.closest('label')?.textContent;
};

describe('WeekQuickAdd', () => {
  it('offers to repeat until the end of term while the term is still on', () => {
    expect(repeatLabel(new Date(2026, 9, 27), '2026-12-11')).toBe('Repeat every Tuesday until Dec 11');
  });

  it("doesn't promise a term end that comes before the picked day", () => {
    expect(repeatLabel(new Date(2027, 0, 12), '2026-12-11')).toBe('Repeat every Tuesday');
  });
});
