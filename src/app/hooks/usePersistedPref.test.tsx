// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePersistedPref } from './usePersistedPref';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type View = 'widgets' | 'week';
const isView = (c: unknown): c is View => c === 'widgets' || c === 'week';

let container: HTMLDivElement;
let root: Root;
let pref: readonly [View, (next: View) => void];

const Probe: React.FC<{ storageKey: string; onResult: (r: typeof pref) => void }> = ({ storageKey, onResult }) => {
  onResult(usePersistedPref<View>(storageKey, 'widgets', isView));
  return null;
};

const render = async (storageKey: string) => {
  await act(async () => root.render(<Probe storageKey={storageKey} onResult={r => { pref = r; }} />));
};

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('usePersistedPref', () => {
  it('reads the saved value for the key', async () => {
    localStorage.setItem('view:user-1', JSON.stringify('week'));
    await render('view:user-1');
    expect(pref[0]).toBe('week');
  });

  it('falls back to the default, without carrying the old value over, when the key changes to one with nothing saved', async () => {
    await render('view:guest');
    await act(async () => pref[1]('week'));
    expect(localStorage.getItem('view:guest')).toBe(JSON.stringify('week'));

    await render('view:user-1');
    expect(pref[0]).toBe('widgets');
    expect(localStorage.getItem('view:user-1')).toBeNull();
  });

  it('switches to the value saved under the new key', async () => {
    localStorage.setItem('view:user-1', JSON.stringify('week'));
    localStorage.setItem('view:user-2', JSON.stringify('widgets'));
    await render('view:user-1');
    expect(pref[0]).toBe('week');

    await render('view:user-2');
    expect(pref[0]).toBe('widgets');
    await render('view:user-1');
    expect(pref[0]).toBe('week');
  });
});
