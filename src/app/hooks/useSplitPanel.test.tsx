// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MIN_PANEL_HEIGHT, PANEL_BODY_ATTR, PANEL_HEIGHT_KEY_PREFIX, useSplitPanel } from './useSplitPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let auth = { user: { id: 'user-1' } as { id: string } | null };
vi.mock('@/app/context/AuthContext', () => ({ useAuth: () => auth }));

const KEY = `${PANEL_HEIGHT_KEY_PREFIX}:user-1`;

let container: HTMLDivElement;
let root: Root;
let panelHeightPx: number | null;

// The panels' tabs sit 60px down the screen, the split 100px, its panel's
// list 150px, and the handle ends 30px below the list. Each element's box comes from its
// data-top/data-bottom.
const boxOf = (el: Element) => {
  const top = Number(el.getAttribute('data-top') ?? 0);
  const bottom = Number(el.getAttribute('data-bottom') ?? 0);
  const width = Number(el.getAttribute('data-width') ?? 800);
  return { top, bottom, left: 0, right: width, width, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
};

const Probe: React.FC<{ onHeight: (h: number | null) => void }> = ({ onHeight }) => {
  const { panelHeightPx, splitContainerRef, panelAreaRef, handleHeightSplitterPointerDown } = useSplitPanel();
  onHeight(panelHeightPx);
  const height = panelHeightPx ?? 0;
  return (
    <div ref={panelAreaRef} data-top={60} data-bottom={150 + height + 30}>
      <div ref={splitContainerRef} data-top={100} data-bottom={150 + height + 20}>
        <div {...{ [PANEL_BODY_ATTR]: '' }} data-visible data-top={150} data-bottom={150 + height} />
      </div>
      <div
        data-top={150 + height + 22}
        data-bottom={150 + height + 30}
        onPointerDown={handleHeightSplitterPointerDown}
        data-testid="handle"
      />
    </div>
  );
};

const render = async () => {
  await act(async () => root.render(<Probe onHeight={h => { panelHeightPx = h; }} />));
};
const handle = () => container.querySelector('[data-testid="handle"]') as HTMLElement;

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return boxOf(this); });
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-visible') ? document.body : null;
  });
  localStorage.clear();
  auth = { user: { id: 'user-1' } };
  window.innerHeight = 900;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe('useSplitPanel height', () => {
  it('fills to the bottom of the screen by default', async () => {
    await render();
    // 900 screen − 150 list top − 30 below the list − 12 gap.
    expect(panelHeightPx).toBe(708);
  });

  it('refits when the window resizes', async () => {
    await render();
    await act(async () => {
      window.innerHeight = 1000;
      window.dispatchEvent(new Event('resize'));
    });
    expect(panelHeightPx).toBe(808);
  });

  it('fills the screen once scrolled to when the panels sit too far down', async () => {
    window.innerHeight = 500;
    await render();
    // 500 screen − 8 gap − 90 tabs and toolbar − 30 below the list − 12 gap.
    expect(panelHeightPx).toBe(360);
  });

  it("stops at a phone's tab bar", async () => {
    const tabBar = document.createElement('nav');
    tabBar.className = 'app-tabbar';
    tabBar.setAttribute('data-top', '836');
    tabBar.setAttribute('data-bottom', '900');
    document.body.appendChild(tabBar);
    await render();
    expect(panelHeightPx).toBe(644);
    tabBar.remove();
  });

  it('never fits below the minimum on a short screen', async () => {
    window.innerHeight = 300;
    await render();
    expect(panelHeightPx).toBe(MIN_PANEL_HEIGHT);
  });

  it("restores the account's saved height", async () => {
    localStorage.setItem(KEY, '1200');
    localStorage.setItem(`${PANEL_HEIGHT_KEY_PREFIX}:user-2`, '400');
    await render();
    expect(panelHeightPx).toBe(1200);
  });

  it('ignores a malformed saved height', async () => {
    localStorage.setItem(KEY, '"tall"');
    await render();
    expect(panelHeightPx).toBe(708);
  });

  it('remembers a dragged height, with the list ending at the pointer', async () => {
    await render();
    await act(async () => {
      handle().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: 1250 }));
      document.dispatchEvent(new PointerEvent('pointerup'));
    });
    expect(panelHeightPx).toBe(1100);
    expect(localStorage.getItem(KEY)).toBe('1100');
  });

  it('never renders a saved height shorter than the screen', async () => {
    localStorage.setItem(KEY, '400');
    await render();
    expect(panelHeightPx).toBe(708);
  });

  it('grows a saved height to fill a taller window', async () => {
    localStorage.setItem(KEY, '750');
    await render();
    expect(panelHeightPx).toBe(750);
    await act(async () => {
      window.innerHeight = 1000;
      window.dispatchEvent(new Event('resize'));
    });
    expect(panelHeightPx).toBe(808);
  });

  it('stops a drag above the bottom of the screen at the fill height', async () => {
    await render();
    await act(async () => {
      handle().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointermove', { clientY: 500 }));
      document.dispatchEvent(new PointerEvent('pointerup'));
    });
    expect(panelHeightPx).toBe(708);
    expect(localStorage.getItem(KEY)).toBe('708');
  });
});

describe('useSplitPanel widths', () => {
  let widths: (count: number) => number[];

  let movable: (count: number) => boolean;

  // The split is 1200px wide, so 120px is 10% of it and a 240px column 20%.
  const WidthProbe: React.FC<{ onWidths: (w: (count: number) => number[]) => void; width?: number }> = ({ onWidths, width = 1200 }) => {
    const { panelWidths, dividersMovable, splitContainerRef, panelAreaRef, handleDividerPointerDown } = useSplitPanel();
    onWidths(panelWidths);
    movable = dividersMovable;
    return (
      <div ref={panelAreaRef} data-width={width}>
        <div ref={splitContainerRef} data-width={width}>
          {[0, 1].map(i => (
            <div key={i} data-testid={`divider-${i}`} onPointerDown={e => handleDividerPointerDown(3, i, e)} />
          ))}
          <div data-testid="divider-two" onPointerDown={e => handleDividerPointerDown(2, 0, e)} />
        </div>
      </div>
    );
  };

  const drag = async (testId: string, clientX: number) => {
    await act(async () => {
      container.querySelector(`[data-testid="${testId}"]`)!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      document.dispatchEvent(new PointerEvent('pointermove', { clientX }));
      document.dispatchEvent(new PointerEvent('pointerup'));
    });
  };

  beforeEach(async () => {
    await act(async () => root.render(<WidthProbe onWidths={w => { widths = w; }} />));
  });

  it('splits evenly until a divider is dragged', () => {
    expect(widths(1)).toEqual([100]);
    expect(widths(2)).toEqual([50, 50]);
    expect(widths(3).map(Math.round)).toEqual([33, 33, 33]);
  });

  it('moves the divider between two panels, keeping each at least 5% wide', async () => {
    await drag('divider-two', 360);
    expect(widths(2)).toEqual([30, 70]);
    await drag('divider-two', 1200);
    expect(widths(2)).toEqual([95, 5]);
  });

  it('moves either divider between three columns, keeping each column at least 240px wide', async () => {
    expect(movable(3)).toBe(true);
    await drag('divider-0', 120);
    expect(widths(3).map(Math.round)).toEqual([20, 47, 33]);
    await drag('divider-1', 600);
    expect(widths(3)).toEqual([20, 30, 50]);
    await drag('divider-0', 540);
    expect(widths(3)).toEqual([30, 20, 50]);
    await drag('divider-1', 1190);
    expect(widths(3)).toEqual([30, 50, 20]);
  });

  it('moves the three columns\' dividers on a laptop-sized split', async () => {
    await act(async () => root.render(<WidthProbe width={950} onWidths={w => { widths = w; }} />));
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(movable(3)).toBe(true);
    await drag('divider-0', 0);
    expect(widths(3)[0] * 9.5).toBeCloseTo(240);
    await drag('divider-1', 950);
    expect(widths(3)[2] * 9.5).toBeCloseTo(240);
  });

  it('widens columns left narrower than 240px when the split shrinks', async () => {
    await drag('divider-0', 0);
    await drag('divider-1', 480);
    expect(widths(3)).toEqual([20, 20, 60]);
    await act(async () => root.render(<WidthProbe width={950} onWidths={w => { widths = w; }} />));
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    const px = widths(3).map(w => w * 9.5);
    expect(px[0]).toBeCloseTo(240);
    expect(px[1]).toBeCloseTo(240);
    expect(px[2]).toBeCloseTo(470);
    await drag('divider-1', 950);
    expect(widths(3).map(w => w * 9.5)).toEqual([expect.closeTo(240, 5), expect.closeTo(470, 5), expect.closeTo(240, 5)]);
  });

  it('keeps three columns even, without movable dividers, on a split too narrow for 240px each', async () => {
    await drag('divider-0', 120);
    await act(async () => root.render(<WidthProbe width={700} onWidths={w => { widths = w; }} />));
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    expect(movable(3)).toBe(false);
    expect(movable(2)).toBe(true);
    expect(widths(3).map(Math.round)).toEqual([33, 33, 33]);
  });

  it('keeps the two-panel and three-column widths apart', async () => {
    await drag('divider-two', 360);
    expect(widths(3).map(Math.round)).toEqual([33, 33, 33]);
  });
});
