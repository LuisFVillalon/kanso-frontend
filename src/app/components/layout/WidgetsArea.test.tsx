// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => ({ dataUserId: 'u1' }) }));
vi.mock('@/app/components/calendar/WeekView', () => ({
  default: ({ fill, heightPx, onResize }: { fill?: boolean; heightPx?: number | null; onResize?: (px: number) => void }) => (
    <button type="button" data-testid="week-view" data-fill={String(!!fill)} data-height={String(heightPx)} onClick={() => onResize?.(900)} />
  ),
}));

import WidgetsArea from './WidgetsArea';

let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => root.render(<WidgetsArea widgets={<div data-testid="widgets">tiles</div>} />));
};

const tab = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes(name))!;

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('WidgetsArea', () => {
  it('shows the widgets, without mounting the week calendar', async () => {
    await render();
    const widgetsCell = container.querySelector('[data-testid="widgets"]')!.parentElement!;
    expect(widgetsCell.classList.contains('invisible')).toBe(false);
    expect(container.querySelector('[data-testid="week-view"]')).toBeNull();
  });

  it('fits the week calendar to the widgets box, which keeps setting the height', async () => {
    await render();
    await act(async () => tab('Week calendar').click());

    // The widgets stay in flow (hidden) so the area keeps their height.
    const widgetsCell = container.querySelector('[data-testid="widgets"]')!.parentElement!;
    expect(widgetsCell.classList.contains('invisible')).toBe(true);
    expect(widgetsCell.hasAttribute('inert')).toBe(true);

    // The week calendar is laid out over that box rather than sizing it.
    const week = container.querySelector<HTMLElement>('[data-testid="week-view"]')!;
    expect(week.dataset.fill).toBe('true');
    expect(week.parentElement!.classList.contains('absolute')).toBe(true);
    expect(week.parentElement!.classList.contains('inset-0')).toBe(true);
    expect(week.parentElement!.parentElement!.parentElement).toBe(widgetsCell.parentElement);
  });

  it('grows the box when the week calendar is dragged taller, and resets on Widgets', async () => {
    await render();
    await act(async () => tab('Week calendar').click());
    const week = () => container.querySelector<HTMLElement>('[data-testid="week-view"]')!;
    const box = () => week().parentElement!.parentElement!;
    expect(week().dataset.height).toBe('null');
    expect(box().style.minHeight).toBe('');

    await act(async () => week().click());
    expect(week().dataset.height).toBe('900');
    expect(box().style.minHeight).toBe('900px');

    await act(async () => tab('Widgets').click());
    await act(async () => tab('Week calendar').click());
    expect(week().dataset.height).toBe('null');
    expect(box().style.minHeight).toBe('');
  });

  it("doesn't keep a dragged height once the page is left", async () => {
    await render();
    await act(async () => tab('Week calendar').click());
    await act(async () => container.querySelector<HTMLElement>('[data-testid="week-view"]')!.click());
    act(() => root.unmount());
    root = createRoot(container);

    await render();
    expect(container.querySelector<HTMLElement>('[data-testid="week-view"]')!.dataset.height).toBe('null');
  });
});
