// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEEK_HEIGHT_KEY_PREFIX, useWeekCalendarHeight } from './useWeekCalendarHeight';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let auth = { user: { id: 'user-1' } as { id: string } | null };
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));

const KEY = `${WEEK_HEIGHT_KEY_PREFIX}:user-1`;

let container: HTMLDivElement;
let root: Root;
let height: ReturnType<typeof useWeekCalendarHeight>;

const Probe: React.FC<{ onHeight: (h: ReturnType<typeof useWeekCalendarHeight>) => void }> = ({ onHeight }) => {
  onHeight(useWeekCalendarHeight());
  return null;
};

const render = async () => {
  await act(async () => root.render(<Probe onHeight={h => { height = h; }} />));
};

beforeEach(() => {
  localStorage.clear();
  auth = { user: { id: 'user-1' } };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useWeekCalendarHeight', () => {
  it('starts at the default height', async () => {
    await render();
    expect(height.heightPx).toBeNull();
  });

  it("restores the account's saved height", async () => {
    localStorage.setItem(KEY, '1200');
    localStorage.setItem(`${WEEK_HEIGHT_KEY_PREFIX}:user-2`, '700');
    await render();
    expect(height.heightPx).toBe(1200);
  });

  it('ignores a malformed saved height', async () => {
    localStorage.setItem(KEY, '"tall"');
    await render();
    expect(height.heightPx).toBeNull();
  });

  it('follows a drag and saves the height when it ends', async () => {
    await render();
    await act(async () => height.onResize(950));
    expect(height.heightPx).toBe(950);
    expect(localStorage.getItem(KEY)).toBeNull();

    await act(async () => height.onResizeEnd());
    expect(localStorage.getItem(KEY)).toBe('950');

    act(() => root.unmount());
    root = createRoot(container);
    await render();
    expect(height.heightPx).toBe(950);
  });

  it('still resizes when storage is blocked', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    await render();
    await act(async () => {
      height.onResize(800);
      height.onResizeEnd();
    });
    expect(height.heightPx).toBe(800);
    setItem.mockRestore();
  });
});
