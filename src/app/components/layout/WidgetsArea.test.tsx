// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => ({ dataUserId: 'u1' }) }));
vi.mock('@/app/components/calendar/WeekView', () => ({
  default: ({ fill, heightPx, onResize, newEventButton = true }: { fill?: boolean; heightPx?: number | null; onResize?: (px: number) => void; newEventButton?: boolean }) => (
    <button type="button" data-testid="week-view" data-fill={String(!!fill)} data-height={String(heightPx)} data-new-event={String(newEventButton)} onClick={() => onResize?.(900)} />
  ),
}));

import WidgetsArea from './WidgetsArea';

let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => root.render(<WidgetsArea widgets={<div data-testid="widgets">tiles</div>} />));
};

// The selected tab shows its name; the other is an icon named by aria-label.
const tab = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === name)!;

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

  it('names only the selected tab, leaving the other an icon with a tooltip, and presses the clicked one', async () => {
    await render();
    expect(tab('Widgets').textContent).toBe('Widgets');
    expect(tab('Widgets').querySelector('svg')!.classList.contains('lucide-shapes')).toBe(true);
    expect(tab('Week').textContent).toBe('');
    expect(tab('Week').dataset.tip).toBe('Week');
    expect(tab('Week').querySelector('svg')!.classList.contains('lucide-calendar-days')).toBe(true);

    await act(async () => tab('Week').click());
    expect(tab('Week').textContent).toBe('Week');
    expect(tab('Week').hasAttribute('data-tip')).toBe(false);
    expect(tab('Week').className).toContain('key-press-play');
    expect(tab('Widgets').textContent).toBe('');
    expect(tab('Widgets').getAttribute('aria-label')).toBe('Widgets');
  });

  it('fits the week calendar to the widgets box, which keeps setting the height', async () => {
    await render();
    await act(async () => tab('Week').click());

    // The widgets stay in flow (hidden) so the area keeps their height.
    const widgetsCell = container.querySelector('[data-testid="widgets"]')!.parentElement!;
    expect(widgetsCell.classList.contains('invisible')).toBe(true);
    expect(widgetsCell.hasAttribute('inert')).toBe(true);

    // The week calendar is laid out over that box rather than sizing it.
    const week = container.querySelector<HTMLElement>('[data-testid="week-view"]')!;
    expect(week.dataset.fill).toBe('true');
    // New event lives in the sidebar's New menu on the home page.
    expect(week.dataset.newEvent).toBe('false');
    expect(week.parentElement!.classList.contains('absolute')).toBe(true);
    expect(week.parentElement!.classList.contains('inset-0')).toBe(true);
    expect(week.parentElement!.parentElement!.parentElement).toBe(widgetsCell.parentElement);
  });

  it('grows the box when the week calendar is dragged taller, and keeps that height across Widgets', async () => {
    await render();
    await act(async () => tab('Week').click());
    const week = () => container.querySelector<HTMLElement>('[data-testid="week-view"]')!;
    const box = () => week().parentElement!.parentElement!;
    expect(week().dataset.height).toBe('null');
    expect(box().style.minHeight).toBe('');

    await act(async () => week().click());
    expect(week().dataset.height).toBe('900');
    expect(box().style.minHeight).toBe('900px');

    await act(async () => tab('Widgets').click());
    await act(async () => tab('Week').click());
    expect(week().dataset.height).toBe('900');
    expect(box().style.minHeight).toBe('900px');
  });

  it('opens the week calendar at its dragged height after the page is left', async () => {
    await render();
    await act(async () => tab('Week').click());
    await act(async () => container.querySelector<HTMLElement>('[data-testid="week-view"]')!.click());
    expect(localStorage.getItem('tm-home-week-height:u1')).toBe('900');
    act(() => root.unmount());
    root = createRoot(container);

    await render();
    expect(container.querySelector<HTMLElement>('[data-testid="week-view"]')!.dataset.height).toBe('900');
  });

  it('eases the area to the other view\'s height on a switch, unless motion is reduced', async () => {
    const animate = vi.fn();
    const proto = HTMLElement.prototype as unknown as { animate?: unknown };
    const heights = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get');
    proto.animate = animate;
    try {
      await render();
      const area = () => container.querySelector('[role="tabpanel"]')!.firstElementChild as HTMLElement;
      heights.mockReturnValue(320);
      await act(async () => tab('Week').click());
      expect(animate).not.toHaveBeenCalled(); // same height: nothing to ease

      heights.mockReturnValueOnce(900).mockReturnValue(320);
      await act(async () => tab('Widgets').click());
      expect(animate).toHaveBeenCalledTimes(1);
      expect(animate.mock.instances[0]).toBe(area());
      const [frames, timing] = animate.mock.calls[0];
      expect(frames.map((f: Keyframe) => f.height)).toEqual(['900px', '320px']);
      expect(timing.duration).toBeGreaterThanOrEqual(200);
      expect(timing.duration).toBeLessThanOrEqual(250);

      window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
      heights.mockReturnValueOnce(320).mockReturnValue(900);
      await act(async () => tab('Week').click());
      expect(animate).toHaveBeenCalledTimes(1);
    } finally {
      delete proto.animate;
      heights.mockRestore();
      delete (window as { matchMedia?: unknown }).matchMedia;
    }
  });
});
