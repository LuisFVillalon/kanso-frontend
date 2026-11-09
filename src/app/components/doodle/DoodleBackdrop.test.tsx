// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  pathname: '/notes',
  fetchDrawing: vi.fn(),
  saveDrawingRemote: vi.fn(),
  deleteDrawingRemote: vi.fn(),
}));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
vi.mock('@/app/lib/backend-api', () => ({
  fetchDrawing: mocks.fetchDrawing,
  saveDrawingRemote: mocks.saveDrawingRemote,
  deleteDrawingRemote: mocks.deleteDrawingRemote,
}));

import DoodleBackdrop from './DoodleBackdrop';
import { cacheDrawing, clearCachedDrawing, readCachedDrawing } from '@/app/lib/doodleDrawing';

const OLD = 'data:image/png;base64,OLD';
const NEW = 'data:image/png;base64,NEW';
const saved = (image_data_url: string) => ({ user_id: 'u1', image_data_url, updated_at: '' });

let container: HTMLDivElement;
let root: Root;

const render = () => act(async () => root.render(<DoodleBackdrop />));
const navigate = (pathname: string) => { mocks.pathname = pathname; return render(); };
const shown = () =>
  container.querySelector<HTMLElement>('[data-testid="doodle-backdrop"]')?.style.backgroundImage ?? null;
const showing = (dataUrl: string) => `url("${dataUrl}")`;

/** A fetchDrawing call the test answers by hand, for what happens while it's in flight. */
const heldFetch = () => {
  let answer!: (value: unknown) => void;
  mocks.fetchDrawing.mockReturnValue(new Promise(resolve => { answer = resolve; }));
  return (value: unknown) => act(async () => answer(value));
};

beforeEach(() => {
  localStorage.clear();
  mocks.pathname = '/notes';
  mocks.fetchDrawing.mockReset().mockResolvedValue(null);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('DoodleBackdrop', () => {
  it('shows the cached drawing on other pages without taking pointer input', async () => {
    cacheDrawing(OLD);
    await render();
    expect(shown()).toBe(showing(OLD));
    expect(container.firstElementChild?.className).toContain('pointer-events-none');
  });

  it('leaves Home to the live canvas, and does not fetch for it', async () => {
    cacheDrawing(OLD);
    mocks.pathname = '/';
    await render();
    expect(shown()).toBeNull();
    expect(mocks.fetchDrawing).not.toHaveBeenCalled();
  });

  it('shows nothing when there is no drawing', async () => {
    await render();
    expect(shown()).toBeNull();
  });

  it('falls back to the backend when landing on a page with an empty cache', async () => {
    mocks.fetchDrawing.mockResolvedValue(saved(NEW));
    await render();
    expect(shown()).toBe(showing(NEW));
  });

  it('keeps showing the cache when the backend fails', async () => {
    cacheDrawing(OLD);
    mocks.fetchDrawing.mockRejectedValue(new Error('down'));
    await render();
    expect(shown()).toBe(showing(OLD));
  });

  it('never writes the drawing anywhere', async () => {
    cacheDrawing(OLD);
    mocks.fetchDrawing.mockResolvedValue(saved(NEW));
    await render();
    await navigate('/calendar');
    expect(shown()).toBe(showing(NEW));
    expect(readCachedDrawing()).toBe(OLD);
    expect(mocks.saveDrawingRemote).not.toHaveBeenCalled();
    expect(mocks.deleteDrawingRemote).not.toHaveBeenCalled();
  });

  it('fetches once across pages', async () => {
    await render();
    await navigate('/calendar');
    await navigate('/reports');
    expect(mocks.fetchDrawing).toHaveBeenCalledTimes(1);
  });

  it('shows new strokes and a cleared drawing after a trip to Home', async () => {
    cacheDrawing(OLD);
    mocks.pathname = '/';
    await render();

    act(() => cacheDrawing(NEW));
    await navigate('/archive');
    expect(shown()).toBe(showing(NEW));

    await navigate('/');
    act(() => clearCachedDrawing());
    await navigate('/trash');
    expect(shown()).toBeNull();
  });

  it('does not let an older backend copy replace strokes made since the page loaded', async () => {
    const answer = heldFetch();
    await render();
    act(() => cacheDrawing(NEW));
    await answer(saved(OLD));
    expect(shown()).toBe(showing(NEW));
  });

  it('does not bring back a drawing the user has cleared', async () => {
    mocks.fetchDrawing.mockResolvedValue(saved(OLD));
    await render();
    expect(shown()).toBe(showing(OLD));
    await navigate('/');
    act(() => clearCachedDrawing());
    await navigate('/notes');
    expect(shown()).toBeNull();
    expect(mocks.fetchDrawing).toHaveBeenCalledTimes(1);
  });

  it('does not fetch after Home has already changed the drawing', async () => {
    mocks.pathname = '/';
    await render();
    act(() => cacheDrawing(NEW));
    await navigate('/notes');
    expect(mocks.fetchDrawing).not.toHaveBeenCalled();
  });

  it('picks up a change made in another tab', async () => {
    await render();
    localStorage.setItem('tm_doodle_drawing', NEW);
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: 'tm_doodle_drawing' })); });
    expect(shown()).toBe(showing(NEW));
  });
});
