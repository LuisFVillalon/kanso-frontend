// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import SegmentedTabs from './SegmentedTabs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const TABS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
] as const;

const Harness: React.FC<{ press?: boolean }> = ({ press }) => {
  const [value, setValue] = useState<'a' | 'b'>('a');
  return <SegmentedTabs label="Sections" tabs={TABS} value={value} onChange={setValue} idBase="t" press={press} />;
};

const tab = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent === name)!;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('SegmentedTabs', () => {
  it('switches on click without a key press by default', async () => {
    await act(async () => root.render(<Harness />));
    await act(async () => tab('Beta').click());
    expect(tab('Beta').getAttribute('aria-selected')).toBe('true');
    expect(tab('Beta').className).not.toContain('key-press-play');
  });

  it('presses the clicked tab like a key when asked to', async () => {
    await act(async () => root.render(<Harness press />));
    await act(async () => tab('Beta').click());
    expect(tab('Beta').getAttribute('aria-selected')).toBe('true');
    expect(tab('Beta').className).toContain('key-press-play');
  });
});
