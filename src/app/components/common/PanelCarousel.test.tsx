// @vitest-environment jsdom
import React, { act, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarousel, {
  inOrder, isHomePanels, isPanelOrder, movePanel, parseHomePanels, phonePanel, restorePanels, stripItems, toHomePanels, widePanels,
  type HomePanels, type PanelCarouselHandle, type PanelKey,
} from './PanelCarousel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALL: PanelKey[] = ['tasks', 'notes', 'canvas'];
const NO_CANVAS: PanelKey[] = ['tasks', 'notes'];

describe('parseHomePanels', () => {
  it('reads every set of panels in Tasks, Notes, Canvas order', () => {
    expect(parseHomePanels('tasks')).toEqual(['tasks']);
    expect(parseHomePanels('tasks,notes')).toEqual(['tasks', 'notes']);
    expect(parseHomePanels('notes,canvas')).toEqual(['notes', 'canvas']);
    expect(parseHomePanels('tasks,notes,canvas')).toEqual(['tasks', 'notes', 'canvas']);
  });

  it('reads an older saved pair as the panels it names', () => {
    expect(parseHomePanels('canvas,tasks')).toEqual(['tasks', 'canvas']);
    expect(isHomePanels('canvas,tasks')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const bad of ['', 'Tasks', 'tasks,tasks', 'tasks,habits', null, 1]) expect(isHomePanels(bad)).toBe(false);
  });

  it('saves panels in Tasks, Notes, Canvas order', () => {
    expect(toHomePanels(['canvas', 'tasks'])).toBe('tasks,canvas');
    expect(toHomePanels(['canvas', 'notes', 'tasks'])).toBe('tasks,notes,canvas');
  });
});

describe('widePanels and phonePanel', () => {
  it('leaves Canvas out when it is not connected, falling back to Tasks and Notes when nothing else is on', () => {
    expect(widePanels('tasks,canvas', NO_CANVAS)).toEqual(['tasks']);
    expect(widePanels('canvas', NO_CANVAS)).toEqual(['tasks', 'notes']);
    expect(widePanels('canvas', ALL)).toEqual(['canvas']);
    expect(phonePanel('canvas', NO_CANVAS)).toBe('tasks');
    expect(phonePanel('notes', NO_CANVAS)).toBe('notes');
  });
});

describe('restorePanels', () => {
  it('goes back to the remembered split while it is still more than one panel', () => {
    expect(restorePanels('tasks,notes', ALL)).toEqual(['tasks', 'notes']);
    expect(restorePanels('notes,canvas', ALL)).toEqual(['notes', 'canvas']);
    expect(restorePanels('tasks,canvas', NO_CANVAS)).toBeNull();
    expect(restorePanels('tasks,notes,canvas', NO_CANVAS)).toEqual(['tasks', 'notes']);
    expect(restorePanels('bad', ALL)).toBeNull();
  });
});

describe('panel order', () => {
  it('accepts every panel once, in any order', () => {
    expect(isPanelOrder(['canvas', 'tasks', 'notes'])).toBe(true);
    for (const bad of [['tasks', 'notes'], ['tasks', 'tasks', 'notes'], ['tasks', 'notes', 'habits'], 'tasks,notes,canvas', null]) {
      expect(isPanelOrder(bad)).toBe(false);
    }
  });

  it('moves a panel before or after another', () => {
    expect(movePanel(ALL, 'canvas', 'tasks', false)).toEqual(['canvas', 'tasks', 'notes']);
    expect(movePanel(ALL, 'tasks', 'notes', true)).toEqual(['notes', 'tasks', 'canvas']);
    expect(movePanel(ALL, 'tasks', 'canvas', false)).toEqual(['notes', 'tasks', 'canvas']);
    expect(movePanel(ALL, 'notes', 'notes', true)).toEqual(ALL);
  });

  it('sorts panels into the order', () => {
    expect(inOrder(['tasks', 'canvas'], ['canvas', 'notes', 'tasks'])).toEqual(['canvas', 'tasks']);
  });
});

describe('stripItems', () => {
  it('gathers the split\'s panels into one tab where the first of them sits', () => {
    expect(stripItems(ALL, ['tasks', 'notes'])).toEqual([{ split: true, keys: ['tasks', 'notes'] }, { split: false, key: 'canvas' }]);
    expect(stripItems(ALL, ['tasks', 'canvas'])).toEqual([{ split: true, keys: ['tasks', 'canvas'] }, { split: false, key: 'notes' }]);
    expect(stripItems(['notes', 'canvas', 'tasks'], ['tasks', 'canvas'])).toEqual([{ split: false, key: 'notes' }, { split: true, keys: ['canvas', 'tasks'] }]);
    expect(stripItems(NO_CANVAS, [])).toEqual([{ split: false, key: 'tasks' }, { split: false, key: 'notes' }]);
  });
});

// ── Component ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let media: { phone: boolean };
let changes: HomePanels[];
let splitChanges: HomePanels[];
let phoneChanges: PanelKey[];
let orderChanges: PanelKey[][];
let drags: [number, number][];
let ghostCalls: string[];
let panelRenders: number;
let handle: PanelCarouselHandle | null;

/** A panel with its own state, to check it survives being switched away and back. */
const Counter: React.FC<{ name: PanelKey; widthPct: number }> = ({ name, widthPct }) => {
  const [count, setCount] = useState(0);
  return <button type="button" data-counter={name} data-width={widthPct} onClick={() => setCount(c => c + 1)}>{name}:{count}</button>;
};

interface HarnessProps {
  initial?: HomePanels;
  initialSplit?: HomePanels;
  initialPhone?: PanelKey;
  initialOrder?: PanelKey[];
  available?: PanelKey[];
  movable?: boolean;
  /** Offers the "+ Canvas" tab, and lets it be closed. */
  offerCanvas?: boolean;
}

const Harness = React.forwardRef<PanelCarouselHandle, HarnessProps>(function Harness(
  { initial = 'tasks,notes', initialSplit = 'tasks,notes', initialPhone = 'tasks', initialOrder = ALL, available = ALL, movable = true, offerCanvas = false },
  ref,
) {
  const [value, setValue] = useState<HomePanels>(initial);
  const [splitValue, setSplitValue] = useState<HomePanels>(initialSplit);
  const [phoneValue, setPhoneValue] = useState<PanelKey>(initialPhone);
  const [order, setOrder] = useState<PanelKey[]>(initialOrder);
  const splitRef = useRef<HTMLDivElement>(null);
  const inner = useRef<PanelCarouselHandle>(null);
  useImperativeHandle(ref, () => ({ show: panel => inner.current?.show(panel) }), []);
  return (
    <PanelCarousel
      ref={inner}
      value={value}
      onChange={next => { changes.push(next); setValue(next); }}
      splitValue={splitValue}
      onSplitChange={next => { splitChanges.push(next); setSplitValue(next); }}
      order={order}
      onOrderChange={next => { orderChanges.push(next); setOrder(next); }}
      phoneValue={phoneValue}
      onPhoneChange={next => { phoneChanges.push(next); setPhoneValue(next); }}
      available={available}
      onConnectCanvas={offerCanvas ? () => { ghostCalls.push('connect'); } : undefined}
      onHideCanvasTab={offerCanvas ? () => { ghostCalls.push('hide'); } : undefined}
      panelWidths={count => (count === 3 ? [20, 30, 50] : count === 2 ? [60, 40] : [100])}
      dividersMovable={() => movable}
      splitRef={splitRef}
      onDividerPointerDown={(count, index) => { drags.push([count, index]); }}
      renderPanel={(key, { widthPct }) => { panelRenders++; return <Counter name={key} widthPct={widthPct} />; }}
    />
  );
});

const render = async (props: HarnessProps = {}) => {
  await act(async () => root.render(<Harness {...props} ref={h => { handle = h; }} />));
};
/** A button by its accessible name (the tab controls are icon-only). */
const control = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name) ?? null;
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
/** A tab's name: its label, or the words on it. */
const tabName = (t: HTMLElement) => t.getAttribute('aria-label') ?? t.textContent;
const tab = (name: string) => tabs().find(t => tabName(t) === name)!;
const selectedTabs = () => tabs().filter(t => t.getAttribute('aria-selected') === 'true').map(tabName);
/** The wide screen's tabs, left to right, the split tab as its panels in brackets. */
const strip = () => [...container.querySelectorAll<HTMLElement>('[data-drop-kind="strip"]')]
  .map(el => (el.dataset.splitTab ? `[${el.dataset.splitTab}]` : el.dataset.dropKey));
const click = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); };
const slot = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-panel="${key}"]`);
/** On a wide screen, the panels in the split; on a phone, the one not inert. */
const visible = (key: PanelKey) => !!slot(key)?.className.includes('split-slot') && !slot(key)!.hasAttribute('inert');
const onScreen = () => (['tasks', 'notes', 'canvas'] as PanelKey[]).filter(visible);
const width = (key: PanelKey) => slot(key)!.style.getPropertyValue('--slot-w');
const dividers = () => [...container.querySelectorAll<HTMLElement>('[data-divider]')];
/** The panels on screen, left to right as their CSS order places them. */
const placed = () => onScreen().sort((a, b) => Number(slot(a)!.style.order) - Number(slot(b)!.style.order));
/** The tab, or half of the split tab, that drags `key`. */
const handleOf = (key: PanelKey, kind = 'strip') => container.querySelector<HTMLElement>(`[data-drop-kind="${kind}"][data-drop-key="${key}"]`)!;
const announced = () => container.querySelector('[role="status"]')!.textContent;
const indicator = () => {
  const bar = container.querySelector<HTMLElement>('[data-drop-indicator]');
  return bar && [bar.closest<HTMLElement>('[data-drop-key]')!.dataset.dropKey, bar.dataset.dropIndicator];
};
/** Lays each kind of drop target out 100 px apart, left to right in the DOM's order (a phone's by its CSS order). */
const layOut = () => {
  const at = (el: HTMLElement, left: number) => {
    el.getBoundingClientRect = () => ({ left, top: 0, right: left + 100, bottom: 40, width: 100, height: 40, x: left, y: 0, toJSON: () => ({}) });
  };
  for (const kind of ['strip', 'half', 'tab']) {
    container.querySelectorAll<HTMLElement>(`[data-drop-kind="${kind}"]`).forEach((el, i) => at(el, i * 100));
  }
};
const pointer = async (type: string, target: EventTarget, x: number, y: number) => {
  await act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
};
/** Presses a tab with the mouse and moves it far enough to pick it up. */
const pickUp = async (el: HTMLElement, x: number) => {
  await pointer('pointerdown', el, x, 10);
  await pointer('pointermove', el, x + 15, 10);
};
const menu = () => document.querySelector<HTMLElement>('[role="menu"]');
const menuItem = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(b => b.textContent === name)!;
const menuItems = () => [...document.querySelectorAll('[role="menuitem"]')].map(b => b.textContent);
const key = async (el: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })); });
};

beforeEach(() => {
  media = { phone: false };
  changes = [];
  splitChanges = [];
  phoneChanges = [];
  orderChanges = [];
  drags = [];
  ghostCalls = [];
  panelRenders = 0;
  handle = null;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width') ? media.phone : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PanelCarousel', () => {
  it('shows a tab for each panel, the panels side by side sharing one split tab', async () => {
    await render();
    expect(onScreen()).toEqual(['tasks', 'notes']);
    expect(slot('tasks')!.getAttribute('aria-label')).toBe('Tasks');
    expect(strip()).toEqual(['[tasks,notes]', 'canvas']);
    expect(tabs().map(tabName)).toEqual(['Tasks + Notes side by side', 'Tasks', 'Notes', 'Canvas']);
    expect(selectedTabs()).toEqual(['Tasks + Notes side by side']);
    const panel = container.querySelector('[role="tabpanel"]')!;
    expect(panel.getAttribute('aria-labelledby')).toBe(tab('Tasks + Notes side by side').id);
    expect(tabs().every(t => t.getAttribute('aria-controls') === panel.id)).toBe(true);
    expect(tab('Tasks').getAttribute('aria-describedby')).toContain(tab('Tasks + Notes side by side').id);
    expect(container.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Home panels');
    expect(container.querySelector('[data-canvas-ghost]')).toBeNull();
  });

  it('shows a panel alone from its tab in one click, keeping the split tab to go back to', async () => {
    await render();
    await click(tab('Canvas'));
    expect(changes).toEqual(['canvas']);
    expect(splitChanges).toEqual(['tasks,notes']);
    expect(onScreen()).toEqual(['canvas']);
    expect(width('canvas')).toBe('calc(100% - 0px)');
    expect(dividers()).toEqual([]);
    expect(strip()).toEqual(['[tasks,notes]', 'canvas']);
    expect(selectedTabs()).toEqual(['Canvas']);
    expect(tab('Tasks + Notes side by side').dataset.tip).toBe('Back to Tasks + Notes');
    await click(tab('Tasks + Notes side by side'));
    expect(changes).toEqual(['canvas', 'tasks,notes']);
    expect(onScreen()).toEqual(['tasks', 'notes']);
  });

  it('shows only one panel of the split from its half of the split tab, then goes back to the split', async () => {
    await render({ initial: 'tasks,notes,canvas', initialSplit: 'tasks,notes,canvas' });
    expect(strip()).toEqual(['[tasks,notes,canvas]']);
    await click(tab('Notes'));
    expect(changes).toEqual(['notes']);
    expect(splitChanges).toEqual(['tasks,notes,canvas']);
    expect(onScreen()).toEqual(['notes']);
    expect(selectedTabs()).toEqual(['Notes']);
    await click(tab('Notes'));
    expect(changes).toEqual(['notes']);
    await click(tab('Tasks + Notes + Canvas side by side'));
    expect(changes).toEqual(['notes', 'tasks,notes,canvas']);
    expect(onScreen()).toEqual(['tasks', 'notes', 'canvas']);
  });

  it('takes a panel out of the split, down to no split at all', async () => {
    await render({ initial: 'tasks,notes,canvas', initialSplit: 'tasks,notes,canvas' });
    await click(control('Take Notes out of the split'));
    expect(changes).toEqual(['tasks,canvas']);
    expect(splitChanges).toEqual(['tasks,canvas']);
    expect(onScreen()).toEqual(['tasks', 'canvas']);
    expect(strip()).toEqual(['[tasks,canvas]', 'notes']);
    await click(control('Take Canvas out of the split'));
    expect(changes).toEqual(['tasks,canvas', 'tasks']);
    expect(onScreen()).toEqual(['tasks']);
    expect(strip()).toEqual(['tasks', 'notes', 'canvas']);
    expect(selectedTabs()).toEqual(['Tasks']);
  });

  it('leaves a panel shown alone on screen when the split it belongs to loses a panel', async () => {
    await render({ initial: 'tasks' });
    expect(selectedTabs()).toEqual(['Tasks']);
    await click(control('Take Notes out of the split'));
    expect(splitChanges).toEqual(['tasks']);
    expect(changes).toEqual([]);
    expect(strip()).toEqual(['tasks', 'notes', 'canvas']);
    expect(selectedTabs()).toEqual(['Tasks']);
  });

  it('adds a panel to the split from its tab, or opens it beside the one panel with no split yet', async () => {
    await render();
    await click(control('Add Canvas to the split'));
    expect(changes).toEqual(['tasks,notes,canvas']);
    expect(strip()).toEqual(['[tasks,notes,canvas]']);
    act(() => root.unmount());
    root = createRoot(container);
    changes = [];
    await render({ initial: 'notes', initialSplit: 'notes' });
    expect(strip()).toEqual(['tasks', 'notes', 'canvas']);
    expect(control('Open Notes beside Notes')).toBeNull();
    await click(control('Open Tasks beside Notes'));
    expect(changes).toEqual(['tasks,notes']);
    expect(strip()).toEqual(['[tasks,notes]', 'canvas']);
  });

  it('keeps the last panel on: a panel alone with no split has nothing to take out or close', async () => {
    await render({ initial: 'notes', initialSplit: 'notes', available: NO_CANVAS });
    expect([...container.querySelectorAll('button')].map(b => b.getAttribute('aria-label')).filter(Boolean))
      .toEqual(['Open Tasks beside Notes']);
  });

  it('shows three panels in columns with a divider between each, saved in Tasks, Notes, Canvas order', async () => {
    await render({ initial: 'notes,canvas', initialSplit: 'notes,canvas' });
    await click(control('Add Tasks to the split'));
    expect(changes).toEqual(['tasks,notes,canvas']);
    expect(onScreen()).toEqual(['tasks', 'notes', 'canvas']);
    expect([width('tasks'), width('notes'), width('canvas')]).toEqual(
      ['calc(20% - 5.333333333333333px)', 'calc(30% - 5.333333333333333px)', 'calc(50% - 5.333333333333333px)']);
    expect(slot('notes')!.querySelector('[data-counter]')!.getAttribute('data-width')).toBe('30');
    expect(dividers().map(d => d.style.order)).toEqual(['1', '3']);
    expect([slot('tasks')!.style.order, slot('notes')!.style.order, slot('canvas')!.style.order]).toEqual(['0', '2', '4']);
  });

  it('leaves out the dividers, and their width, when they can\'t be dragged', async () => {
    await render({ initial: 'tasks,notes,canvas', movable: false });
    expect(dividers()).toEqual([]);
    expect([width('tasks'), width('notes'), width('canvas')]).toEqual(['calc(20% - 0px)', 'calc(30% - 0px)', 'calc(50% - 0px)']);
  });

  it('starts dragging the divider that was grabbed', async () => {
    await render({ initial: 'tasks,notes,canvas' });
    const grab = async (el: HTMLElement) => {
      await act(async () => { el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })); });
    };
    await grab(dividers()[1].firstElementChild as HTMLElement);
    await grab(dividers()[0].firstElementChild as HTMLElement);
    expect(drags).toEqual([[3, 1], [3, 0]]);
  });

  it('reads an older saved pair as the panels it names', async () => {
    await render({ initial: 'canvas,tasks' });
    expect(onScreen()).toEqual(['tasks', 'canvas']);
    expect(strip()).toEqual(['[tasks,canvas]', 'notes']);
    await click(control('Add Notes to the split'));
    expect(changes).toEqual(['tasks,notes,canvas']);
  });

  describe('from the keyboard', () => {
    it('is one tab stop, on the selected tab, with the arrow keys moving between tabs', async () => {
      await render({ initial: 'canvas' });
      expect(tabs().filter(t => t.tabIndex === 0).map(tabName)).toEqual(['Canvas']);
      tab('Canvas').focus();
      await key(tab('Canvas'), 'ArrowRight');
      expect(document.activeElement).toBe(tab('Tasks + Notes side by side'));
      await key(document.activeElement!, 'ArrowRight');
      expect(document.activeElement).toBe(tab('Tasks'));
      expect(tabs().filter(t => t.tabIndex === 0).map(tabName)).toEqual(['Tasks']);
      await key(document.activeElement!, 'End');
      expect(document.activeElement).toBe(tab('Canvas'));
      await key(document.activeElement!, 'Home');
      expect(document.activeElement).toBe(tab('Tasks + Notes side by side'));
      await key(document.activeElement!, 'ArrowLeft');
      expect(document.activeElement).toBe(tab('Canvas'));
      expect(changes).toEqual([]);
    });

    it('adds a tab to the split, or takes a half out, from the tab\'s menu, focus going back to the tab', async () => {
      await render();
      tab('Canvas').focus();
      await key(tab('Canvas'), 'ContextMenu');
      expect(menuItems()).toEqual(['Add Canvas to the split']);
      expect(document.activeElement).toBe(menuItem('Add Canvas to the split'));
      await click(menuItem('Add Canvas to the split'));
      expect(changes).toEqual(['tasks,notes,canvas']);
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(tab('Canvas'));
      await key(tab('Notes'), 'F10', { shiftKey: true });
      expect(menuItems()).toEqual(['Take Notes out of the split']);
      await click(menuItem('Take Notes out of the split'));
      expect(changes).toEqual(['tasks,notes,canvas', 'tasks,canvas']);
      expect(strip()).toEqual(['[tasks,canvas]', 'notes']);
      expect(document.activeElement).toBe(tab('Notes'));
    });

    it('opens the tab\'s menu with a right-click too, and closes it with Escape, back on the tab', async () => {
      await render();
      await act(async () => {
        tab('Canvas').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 30 }));
      });
      expect(menuItems()).toEqual(['Add Canvas to the split']);
      await key(document.activeElement!, 'ArrowDown');
      expect(document.activeElement).toBe(menuItem('Add Canvas to the split'));
      await key(document.activeElement!, 'Escape');
      expect(menu()).toBeNull();
      expect(document.activeElement).toBe(tab('Canvas'));
      expect(changes).toEqual([]);
    });

    it('has no shortcuts for the split besides the tab\'s menu', async () => {
      await render();
      await key(tab('Canvas'), 'Enter', { shiftKey: true });
      await key(tab('Notes'), 'Delete');
      await key(tab('Notes'), 'Backspace');
      await key(tab('Notes'), 'ArrowLeft', { altKey: true });
      expect(changes).toEqual([]);
      expect(orderChanges).toEqual([]);
      expect(tab('Notes').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowLeft Shift+ArrowRight ContextMenu Shift+F10');
    });

    it('opens no menu on a tab with nothing to offer', async () => {
      await render({ initial: 'tasks', initialSplit: 'tasks', available: NO_CANVAS });
      await key(tab('Tasks'), 'ContextMenu');
      expect(menu()).toBeNull();
      expect(tab('Tasks').getAttribute('aria-keyshortcuts')).toBe('Shift+ArrowLeft Shift+ArrowRight');
    });

    it('has no number-key shortcuts', async () => {
      await render();
      for (const k of ['1', '2', '3', '0']) {
        await key(tab('Tasks'), k);
        await key(window, k);
      }
      expect(changes).toEqual([]);
    });
  });

  describe('without Canvas connected', () => {
    it('offers Tasks and Notes, with no Canvas tab and no split that needs it', async () => {
      await render({ initial: 'tasks,canvas', initialSplit: 'tasks,canvas', available: NO_CANVAS });
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
      expect(strip()).toEqual(['tasks', 'notes']);
      expect(control('Connect Canvas')).toBeNull();
      await click(control('Open Notes beside Tasks'));
      expect(changes).toEqual(['tasks,notes']);
    });

    it('falls back to Tasks and Notes when only Canvas was on', async () => {
      await render({ initial: 'canvas', available: NO_CANVAS });
      expect(onScreen()).toEqual(['tasks', 'notes']);
      expect(strip()).toEqual(['[tasks,notes]']);
      expect(changes).toEqual([]);
    });

    it('offers a "+ Canvas" tab beside the others that connects it, and can be closed', async () => {
      await render({ available: NO_CANVAS, offerCanvas: true });
      const ghost = container.querySelector('[data-canvas-ghost]')!;
      expect(ghost.closest('[role="tablist"]')).toBeNull();
      expect(ghost.textContent).toBe('Canvas');
      await click(control('Connect Canvas'));
      expect(control('Close the Canvas tab')!.tabIndex).toBe(0);
      await click(control('Close the Canvas tab'));
      expect(ghostCalls).toEqual(['connect', 'hide']);
      expect(changes).toEqual([]);
    });

    it('leaves the "+ Canvas" tab out once Canvas is connected', async () => {
      await render({ offerCanvas: true });
      expect(container.querySelector('[data-canvas-ghost]')).toBeNull();
    });
  });

  describe('on a phone', () => {
    beforeEach(() => { media.phone = true; });

    /** The swipe track, sized like a 300 px wide phone column. */
    const track = () => {
      const el = slot('tasks')!.parentElement!;
      Object.defineProperty(el, 'clientWidth', { configurable: true, value: 300 });
      return el;
    };

    it('shows one panel, picked from labelled tabs, without touching the wide screen\'s panels', async () => {
      await render({ initial: 'tasks,notes,canvas', initialPhone: 'notes' });
      expect(container.querySelector('[data-split-tab]')).toBeNull();
      expect(container.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Home panel');
      expect(tabs().map(tabName)).toEqual(['Tasks', 'Notes', 'Canvas']);
      expect(tabs().every(t => !t.hasAttribute('aria-label'))).toBe(true);
      expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
      expect(onScreen()).toEqual(['notes']);
      expect(slot('notes')!.getAttribute('role')).toBe('tabpanel');
      expect(slot('notes')!.getAttribute('aria-labelledby')).toBe(tab('Notes').id);
      expect(tab('Notes').getAttribute('aria-controls')).toBe(slot('notes')!.id);
      expect(dividers()).toEqual([]);
      await click(tab('Canvas'));
      expect(phoneChanges).toEqual(['canvas']);
      expect(onScreen()).toEqual(['canvas']);
      expect(tab('Canvas').className).toContain('key-press-play');
      expect(changes).toEqual([]);
    });

    it('keeps every panel mounted side by side, to swipe between', async () => {
      await render();
      expect(['tasks', 'notes', 'canvas'].map(k => !!slot(k as PanelKey))).toEqual([true, true, true]);
      expect(slot('notes')!.hasAttribute('inert')).toBe(true);
    });

    it('scrolls the track to a picked tab\'s panel', async () => {
      await render();
      const el = track();
      const scrollTo = vi.fn();
      el.scrollTo = scrollTo;
      await click(tab('Canvas'));
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 2 * (300 + 12) }));
    });

    it('picks the panel a swipe comes to rest on', async () => {
      vi.useFakeTimers();
      await render();
      const el = track();
      el.scrollTo = vi.fn();
      Object.defineProperty(el, 'scrollLeft', { configurable: true, value: 312 });
      act(() => { el.dispatchEvent(new Event('scroll')); });
      expect(phoneChanges).toEqual([]);
      act(() => { vi.advanceTimersByTime(100); });
      expect(phoneChanges).toEqual(['notes']);
      expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
      vi.useRealTimers();
    });

    it('moves between tabs with the arrow keys', async () => {
      await render();
      await key(tab('Tasks'), 'ArrowLeft');
      expect(phoneChanges).toEqual(['canvas']);
      expect(document.activeElement).toBe(tab('Canvas'));
    });

    it('lays the tabs and the swipe track out in the saved order', async () => {
      await render({ initialOrder: ['canvas', 'tasks', 'notes'] });
      expect(tabs().map(tabName)).toEqual(['Canvas', 'Tasks', 'Notes']);
      expect([slot('canvas')!.style.order, slot('tasks')!.style.order, slot('notes')!.style.order]).toEqual(['0', '1', '2']);
      const el = track();
      const scrollTo = vi.fn();
      el.scrollTo = scrollTo;
      await click(tab('Notes'));
      expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 2 * (300 + 12) }));
    });

    it('drags a held tab to a new place, without picking it', async () => {
      vi.useFakeTimers();
      await render();
      layOut();
      await pointer('pointerdown', tab('Canvas'), 250, 20);
      await act(async () => { vi.advanceTimersByTime(350); });
      expect(document.body.textContent).toContain('Moving Canvas');
      await pointer('pointermove', window, 30, 20);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointerup', window, 30, 20);
      await click(tab('Canvas'));
      expect(orderChanges).toEqual([['canvas', 'tasks', 'notes']]);
      expect(tabs().map(tabName)).toEqual(['Canvas', 'Tasks', 'Notes']);
      expect(phoneChanges).toEqual([]);
      expect(announced()).toBe('Canvas moved to position 1 of 3.');
      vi.useRealTimers();
    });

    it('picks the next tapped tab when a tab drag\'s release makes no click', async () => {
      vi.useFakeTimers();
      await render();
      layOut();
      await pointer('pointerdown', tab('Canvas'), 250, 20);
      await act(async () => { vi.advanceTimersByTime(350); });
      await pointer('pointermove', window, 30, 20);
      await pointer('pointerup', window, 30, 20);
      expect(orderChanges).toEqual([['canvas', 'tasks', 'notes']]);
      await act(async () => { vi.advanceTimersByTime(0); });
      await click(tab('Notes'));
      expect(phoneChanges).toEqual(['notes']);
      vi.useRealTimers();
    });

    it('treats a tab pressed and moved straight away as a swipe, not a drag', async () => {
      vi.useFakeTimers();
      await render();
      layOut();
      await pointer('pointerdown', tab('Canvas'), 250, 20);
      await pointer('pointermove', tab('Canvas'), 230, 20);
      await act(async () => { vi.advanceTimersByTime(350); });
      expect(document.body.textContent).not.toContain('Moving Canvas');
      await click(tab('Canvas'));
      expect(phoneChanges).toEqual(['canvas']);
      expect(orderChanges).toEqual([]);
      vi.useRealTimers();
    });

    it('moves the picked tab with Shift and an arrow key', async () => {
      await render({ initialPhone: 'notes' });
      await key(tab('Notes'), 'ArrowLeft', { shiftKey: true });
      expect(orderChanges).toEqual([['notes', 'tasks', 'canvas']]);
      expect(phoneChanges).toEqual([]);
      expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
      expect(announced()).toBe('Notes moved to position 1 of 3.');
      await key(tab('Notes'), 'ArrowRight', { shiftKey: true });
      expect(orderChanges.at(-1)).toEqual(['tasks', 'notes', 'canvas']);
      await key(tab('Notes'), 'ArrowRight', { altKey: true });
      expect(orderChanges).toHaveLength(2);
      expect(phoneChanges).toEqual(['canvas']);
    });

    it('offers only Tasks and Notes without Canvas, falling back to Tasks, with the "+ Canvas" tab when offered', async () => {
      await render({ initialPhone: 'canvas', available: NO_CANVAS, offerCanvas: true });
      expect(tabs().map(tabName)).toEqual(['Tasks', 'Notes']);
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
      await click(control('Connect Canvas'));
      expect(ghostCalls).toEqual(['connect']);
    });
  });

  describe('reordering', () => {
    it('drags a tab to a new place, showing where it will land', async () => {
      await render({ initial: 'tasks', initialSplit: 'tasks' });
      layOut();
      await pickUp(handleOf('canvas'), 250);
      expect(document.body.textContent).toContain('Moving Canvas');
      expect(handleOf('canvas').className).toContain('opacity-40');
      await pointer('pointermove', window, 30, 10);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointerup', window, 30, 10);
      expect(orderChanges).toEqual([['canvas', 'tasks', 'notes']]);
      expect(strip()).toEqual(['canvas', 'tasks', 'notes']);
      expect(indicator()).toBeNull();
      expect(announced()).toBe('Canvas moved to position 1 of 3.');
      expect(changes).toEqual([]);
    });

    it('doesn\'t pick a tab up until the mouse moves, so a click still picks it', async () => {
      await render({ initial: 'tasks', initialSplit: 'tasks' });
      await pointer('pointerdown', handleOf('canvas'), 250, 10);
      await pointer('pointermove', handleOf('canvas'), 254, 10);
      expect(document.body.textContent).not.toContain('Moving Canvas');
      await pointer('pointerup', handleOf('canvas'), 254, 10);
      await click(tab('Canvas'));
      expect(changes).toEqual(['canvas']);
    });

    it('moves a tab past the split tab as a whole', async () => {
      await render();
      layOut();
      await pickUp(handleOf('canvas'), 150);
      await pointer('pointermove', window, 20, 10);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointerup', window, 20, 10);
      expect(orderChanges).toEqual([['canvas', 'tasks', 'notes']]);
      expect(strip()).toEqual(['canvas', '[tasks,notes]']);
      layOut();
      await pickUp(handleOf('canvas'), 50);
      await pointer('pointermove', window, 190, 10);
      expect(indicator()).toEqual(['tasks', 'after']);
      await pointer('pointerup', window, 190, 10);
      expect(orderChanges.at(-1)).toEqual(['tasks', 'notes', 'canvas']);
      expect(strip()).toEqual(['[tasks,notes]', 'canvas']);
    });

    it('drags a half of the split tab within the split, moving its panel without remounting it', async () => {
      await render({ initial: 'tasks,notes,canvas' });
      await click(container.querySelector<HTMLElement>('[data-counter="notes"]')!);
      layOut();
      await pickUp(handleOf('notes', 'half'), 150);
      await pointer('pointermove', window, 30, 10);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointermove', window, 280, 10);
      expect(indicator()).toEqual(['canvas', 'after']);
      await pointer('pointerup', window, 280, 10);
      expect(orderChanges).toEqual([['tasks', 'canvas', 'notes']]);
      expect(placed()).toEqual(['tasks', 'canvas', 'notes']);
      expect(tabs().map(tabName)).toEqual(['Tasks + Canvas + Notes side by side', 'Tasks', 'Canvas', 'Notes']);
      expect(announced()).toBe('Notes moved to position 3 of 3.');
      // The panel moved without remounting, and the widths stay with the places.
      expect(slot('notes')!.textContent).toContain('notes:1');
      expect(width('notes')).toBe('calc(50% - 5.333333333333333px)');
      expect(dividers().map(d => d.style.order)).toEqual(['1', '3']);
      expect(changes).toEqual([]);
    });

    it('moves the ghost without re-rendering the panels until the drop target changes', async () => {
      await render({ initial: 'tasks,notes,canvas' });
      layOut();
      await pickUp(handleOf('notes', 'half'), 150);
      await pointer('pointermove', window, 30, 10);
      const ghost = [...document.body.querySelectorAll<HTMLElement>('[aria-hidden]')].find(el => el.textContent === 'Moving Notes')!;
      const renders = panelRenders;
      await pointer('pointermove', window, 40, 20);
      await pointer('pointermove', window, 20, 30);
      expect(panelRenders).toBe(renders);
      expect([ghost.style.left, ghost.style.top]).toEqual(['32px', '18px']);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointermove', window, 280, 10);
      expect(indicator()).toEqual(['canvas', 'after']);
      expect(panelRenders).toBeGreaterThan(renders);
      await pointer('pointerup', window, 280, 10);
    });

    it('puts a dragged tab back when Escape is pressed', async () => {
      await render();
      layOut();
      await pickUp(handleOf('tasks', 'half'), 50);
      await pointer('pointermove', window, 180, 10);
      expect(indicator()).toEqual(['notes', 'after']);
      // Released in the same task as Escape, before a render.
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: 180, clientY: 10 }));
      });
      expect(indicator()).toBeNull();
      expect(orderChanges).toEqual([]);
      expect(announced()).toBe('Moving Tasks cancelled.');
    });

    it('leaves the order alone when a tab is dropped where it was', async () => {
      await render({ initial: 'tasks', initialSplit: 'tasks' });
      layOut();
      await pickUp(handleOf('tasks'), 30);
      await pointer('pointermove', window, 60, 10);
      await pointer('pointerup', window, 60, 10);
      expect(orderChanges).toEqual([]);
    });

    it('moves a tab with Shift and an arrow key, past the split tab as a whole, keeping focus on it', async () => {
      await render();
      tab('Canvas').focus();
      expect(tab('Canvas').getAttribute('aria-keyshortcuts')).toContain('Shift+ArrowLeft');
      await key(tab('Canvas'), 'ArrowLeft', { shiftKey: true });
      expect(orderChanges).toEqual([['canvas', 'tasks', 'notes']]);
      expect(strip()).toEqual(['canvas', '[tasks,notes]']);
      expect(announced()).toBe('Canvas moved to position 1 of 3.');
      expect(document.activeElement).toBe(tab('Canvas'));
      await key(tab('Canvas'), 'ArrowLeft', { shiftKey: true });
      expect(orderChanges).toHaveLength(1);
      await key(tab('Canvas'), 'ArrowRight', { shiftKey: true });
      expect(orderChanges.at(-1)).toEqual(['tasks', 'notes', 'canvas']);
    });

    it('moves a half within the split with Shift and an arrow key', async () => {
      await render();
      tab('Tasks').focus();
      await key(tab('Tasks'), 'ArrowRight', { shiftKey: true });
      expect(orderChanges).toEqual([['notes', 'tasks', 'canvas']]);
      expect(placed()).toEqual(['notes', 'tasks']);
      expect(announced()).toBe('Tasks moved to position 2 of 2.');
      expect(document.activeElement).toBe(tab('Tasks'));
      await key(tab('Tasks'), 'ArrowRight', { shiftKey: true });
      expect(orderChanges).toHaveLength(1);
    });

    it('lays the tabs and panels out in the saved order, and adds a panel back in its place', async () => {
      await render({ initial: 'canvas,tasks', initialSplit: 'canvas,tasks', initialOrder: ['canvas', 'notes', 'tasks'] });
      expect(placed()).toEqual(['canvas', 'tasks']);
      expect(strip()).toEqual(['[canvas,tasks]', 'notes']);
      await click(control('Add Notes to the split'));
      expect(changes).toEqual(['tasks,notes,canvas']);
      expect(placed()).toEqual(['canvas', 'notes', 'tasks']);
      await click(control('Take Canvas out of the split'));
      expect(strip()).toEqual(['canvas', '[notes,tasks]']);
    });

    it('shows a panel alone and restores the split in any order', async () => {
      await render({ initial: 'tasks,notes,canvas', initialOrder: ['notes', 'canvas', 'tasks'] });
      await click(tab('Canvas'));
      expect(onScreen()).toEqual(['canvas']);
      await click(tab('Notes + Canvas + Tasks side by side'));
      expect(placed()).toEqual(['notes', 'canvas', 'tasks']);
    });
  });

  it('keeps each panel mounted, so it comes back as it was left', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    expect(slot('canvas')).toBeNull();
    await click(tab('Notes'));
    expect(visible('tasks')).toBe(false);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    await click(tab('Tasks + Notes side by side'));
    expect(slot('tasks')!.textContent).toContain('tasks:1');
  });

  it('keeps a panel mounted when the screen crosses between a phone and a wide screen', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    media.phone = true;
    await render();
    expect(tabs().map(tabName)).toEqual(['Tasks', 'Notes', 'Canvas']);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    media.phone = false;
    await render();
    expect(container.querySelector('[data-split-tab]')).not.toBeNull();
    expect(slot('tasks')!.textContent).toContain('tasks:1');
  });

  describe('bringing a panel on screen through its handle', () => {
    it('turns it on beside the others on a wide screen', async () => {
      await render({ initial: 'notes' });
      await act(async () => handle!.show('notes'));
      expect(changes).toEqual([]);
      await act(async () => handle!.show('tasks'));
      expect(changes).toEqual(['tasks,notes']);
      expect(onScreen()).toEqual(['tasks', 'notes']);
    });

    it('switches to it on a phone', async () => {
      media.phone = true;
      await render();
      await act(async () => handle!.show('notes'));
      expect(phoneChanges).toEqual(['notes']);
      expect(changes).toEqual([]);
    });

    it('leaves an unavailable panel alone', async () => {
      await render({ available: NO_CANVAS });
      await act(async () => handle!.show('canvas'));
      expect(changes).toEqual([]);
    });
  });
});
