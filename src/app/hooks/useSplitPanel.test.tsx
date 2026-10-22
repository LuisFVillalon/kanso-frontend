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
  return { top, bottom, left: 0, right: 800, width: 800, height: bottom - top, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
};

const Probe: React.FC<{ onHeight: (h: number | null) => void }> = ({ onHeight }) => {
  const { panelHeightPx, splitContainerRef, panelAreaRef, handleHeightSplitterMouseDown, resetPanelHeight } = useSplitPanel();
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
        onDoubleClick={resetPanelHeight}
        onMouseDown={handleHeightSplitterMouseDown}
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
      handle().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 1250 }));
      document.dispatchEvent(new MouseEvent('mouseup'));
    });
    expect(panelHeightPx).toBe(1100);
    expect(localStorage.getItem(KEY)).toBe('1100');
  });

  it('goes back to filling the screen on a double-click', async () => {
    localStorage.setItem(KEY, '1200');
    await render();
    await act(async () => {
      handle().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(panelHeightPx).toBe(708);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
