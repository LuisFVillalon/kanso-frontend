// @vitest-environment jsdom
import React, { act, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarousel, {
  inOrder, isHomePanels, isPanelOrder, movePanel, parseHomePanels, phonePanel, restorePanels, toHomePanels, widePanels,
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

// ── Component ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let media: { phone: boolean };
let changes: HomePanels[];
let splitChanges: HomePanels[];
let phoneChanges: PanelKey[];
let orderChanges: PanelKey[][];
let drags: [number, number][];
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
}

const Harness = React.forwardRef<PanelCarouselHandle, HarnessProps>(function Harness(
  { initial = 'tasks,notes', initialSplit = 'tasks,notes', initialPhone = 'tasks', initialOrder = ALL, available = ALL, movable = true },
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
/** A button by its accessible name (the panel controls are icon-only). */
const control = (name: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === name) ?? null;
const controlNames = (key: PanelKey) =>
  [...slot(key)!.querySelectorAll<HTMLButtonElement>('[role="group"] button')].map(b => b.getAttribute('aria-label'));
const rails = () => [...container.querySelectorAll<HTMLElement>('[data-rail]')].map(r => r.dataset.rail);
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (label: string) => tabs().find(t => t.getAttribute('aria-label') === label)!;
const click = async (el: HTMLElement | null) => { await act(async () => { el!.click(); }); };
const slot = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-panel="${key}"]`);
/** On a wide screen, the panels in the split; on a phone, the one not inert. */
const visible = (key: PanelKey) => !!slot(key)?.className.includes('split-slot') && !slot(key)!.hasAttribute('inert');
const onScreen = () => (['tasks', 'notes', 'canvas'] as PanelKey[]).filter(visible);
const width = (key: PanelKey) => slot(key)!.style.getPropertyValue('--slot-w');
const dividers = () => [...container.querySelectorAll<HTMLElement>('[data-divider]')];
/** The panels on screen, left to right as their CSS order places them. */
const placed = () => onScreen().sort((a, b) => Number(slot(a)!.style.order) - Number(slot(b)!.style.order));
const grip = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-reorder-grip="${key}"]`)!;
const announced = () => container.querySelector('[role="status"]')!.textContent;
const indicator = () => {
  const bar = container.querySelector<HTMLElement>('[data-drop-indicator]');
  return bar && [bar.closest<HTMLElement>('[data-drop-key]')!.dataset.dropKey, bar.dataset.dropIndicator];
};
/** Lays the drop targets out 100 px apart: across for panels and tabs, down for rails. */
const layOut = () => {
  const at = (el: HTMLElement, left: number, top: number, w: number, h: number) => {
    el.getBoundingClientRect = () => ({ left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON: () => ({}) });
  };
  const across = [...container.querySelectorAll<HTMLElement>('[data-drop-kind="panel"], [data-drop-kind="tab"]')]
    .sort((a, b) => Number(a.style.order || 0) - Number(b.style.order || 0));
  across.forEach((el, i) => at(el, i * 100, 0, 100, 400));
  container.querySelectorAll<HTMLElement>('[data-drop-kind="rail"]').forEach((el, i) => at(el, 1000, i * 100, 40, 100));
};
const pointer = async (type: string, target: EventTarget, x: number, y: number) => {
  await act(async () => { target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y })); });
};
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
  it('shows the panels on, each with a header to show it alone or hide it, and the hidden ones as rails', async () => {
    await render();
    expect(onScreen()).toEqual(['tasks', 'notes']);
    expect(slot('tasks')!.getAttribute('aria-label')).toBe('Tasks');
    expect(controlNames('tasks')).toEqual(['Show only Tasks', 'Hide Tasks']);
    expect(controlNames('notes')).toEqual(['Show only Notes', 'Hide Notes']);
    expect(rails()).toEqual(['canvas']);
    expect(container.querySelector('[role="group"][aria-label="Hidden panels"]')).not.toBeNull();
    expect(control('Show only Canvas')!.dataset.tip).toBe('Show only Canvas');
    expect(container.querySelector('[role="tab"]')).toBeNull();
  });

  it('hides a panel from its header, giving the others its width, down to one panel filling the split', async () => {
    await render();
    await click(control('Hide Notes'));
    expect(changes).toEqual(['tasks']);
    expect(onScreen()).toEqual(['tasks']);
    expect(width('tasks')).toBe('calc(100% - 0px)');
    expect(dividers()).toEqual([]);
    expect(rails()).toEqual(['notes', 'canvas']);
  });

  it('keeps the last panel on: a panel shown alone has no hide, only the way back to the split', async () => {
    await render({ initial: 'notes' });
    expect(control('Hide Notes')).toBeNull();
    expect(controlNames('notes')).toEqual(['Back to Tasks + Notes']);
    await click(control('Back to Tasks + Notes'));
    expect(changes).toEqual(['tasks,notes']);
    expect(onScreen()).toEqual(['tasks', 'notes']);
  });

  it('maximizes a panel, then restores the split it came from', async () => {
    await render({ initial: 'tasks,notes,canvas' });
    expect(rails()).toEqual([]);
    await click(control('Show only Canvas'));
    expect(changes).toEqual(['canvas']);
    expect(splitChanges).toEqual(['tasks,notes,canvas']);
    expect(onScreen()).toEqual(['canvas']);
    expect(rails()).toEqual(['tasks', 'notes']);
    await click(control('Back to Tasks + Notes + Canvas'));
    expect(changes).toEqual(['canvas', 'tasks,notes,canvas']);
    expect(onScreen()).toEqual(['tasks', 'notes', 'canvas']);
  });

  it('shows a hidden panel alone from its rail, or beside the others with its +', async () => {
    await render();
    await click(control('Show only Canvas'));
    expect(changes).toEqual(['canvas']);
    expect(controlNames('canvas')).toEqual(['Back to Tasks + Notes']);
    await click(control('Add Tasks beside the others'));
    expect(changes).toEqual(['canvas', 'tasks,canvas']);
    expect(splitChanges.at(-1)).toBe('tasks,canvas');
    expect(onScreen()).toEqual(['tasks', 'canvas']);
    expect(rails()).toEqual(['notes']);
    const rail = container.querySelector('[data-rail="notes"]')!;
    expect([...rail.querySelectorAll('button')].map(b => b.getAttribute('aria-label')))
      .toEqual(['Move Notes', 'Add Notes beside the others', 'Show only Notes']);
  });

  it('shows three panels in columns with a divider between each, saved in Tasks, Notes, Canvas order', async () => {
    await render({ initial: 'notes,canvas' });
    await click(control('Add Tasks beside the others'));
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
    await click(control('Add Notes beside the others'));
    expect(changes).toEqual(['tasks,notes,canvas']);
  });

  describe('without Canvas connected', () => {
    it('offers Tasks and Notes, with no Canvas rail and no way back to a split that needs it', async () => {
      await render({ initial: 'tasks,canvas', initialSplit: 'tasks,canvas', available: NO_CANVAS });
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
      expect(rails()).toEqual(['notes']);
      expect(controlNames('tasks')).toEqual([]);
      await click(control('Add Notes beside the others'));
      expect(changes).toEqual(['tasks,notes']);
    });

    it('falls back to Tasks and Notes when only Canvas was on', async () => {
      await render({ initial: 'canvas', available: NO_CANVAS });
      expect(onScreen()).toEqual(['tasks', 'notes']);
      expect(rails()).toEqual([]);
      expect(changes).toEqual([]);
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

    it('shows one panel, picked from icon tabs, without touching the wide screen\'s panels', async () => {
      await render({ initial: 'tasks,notes,canvas', initialPhone: 'notes' });
      expect(container.querySelector('[role="group"]')).toBeNull();
      expect(rails()).toEqual([]);
      expect(tabs().map(t => t.getAttribute('aria-label'))).toEqual(['Tasks', 'Notes', 'Canvas']);
      expect(tabs().map(t => t.textContent)).toEqual(['', '', '']);
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
      await act(async () => { tab('Tasks').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
      expect(phoneChanges).toEqual(['canvas']);
      expect(document.activeElement).toBe(tab('Canvas'));
    });

    it('lays the tabs and the swipe track out in the saved order', async () => {
      await render({ initialOrder: ['canvas', 'tasks', 'notes'] });
      expect(tabs().map(t => t.getAttribute('aria-label'))).toEqual(['Canvas', 'Tasks', 'Notes']);
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
      expect(tabs().map(t => t.getAttribute('aria-label'))).toEqual(['Canvas', 'Tasks', 'Notes']);
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

    it('moves the picked tab with Alt and an arrow key', async () => {
      await render({ initialPhone: 'notes' });
      await key(tab('Notes'), 'ArrowLeft', { altKey: true });
      expect(orderChanges).toEqual([['notes', 'tasks', 'canvas']]);
      expect(phoneChanges).toEqual([]);
      expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
      expect(announced()).toBe('Notes moved to position 1 of 3.');
      await key(tab('Notes'), 'ArrowLeft', { altKey: true });
      expect(orderChanges).toHaveLength(1);
    });

    it('offers only Tasks and Notes without Canvas, falling back to Tasks', async () => {
      await render({ initialPhone: 'canvas', available: NO_CANVAS });
      expect(tabs().map(t => t.getAttribute('aria-label'))).toEqual(['Tasks', 'Notes']);
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
    });
  });

  describe('reordering', () => {
    it('drags a panel by its grip to the other side of another, showing where it will land', async () => {
      await render({ initial: 'tasks,notes,canvas' });
      await click(container.querySelector<HTMLElement>('[data-counter="notes"]')!);
      layOut();
      expect(grip('notes').dataset.tip).toBe('Drag to reorder');
      await pointer('pointerdown', grip('notes'), 150, 10);
      expect(slot('notes')!.className).toContain('opacity-50');
      await pointer('pointermove', window, 30, 10);
      expect(indicator()).toEqual(['tasks', 'before']);
      await pointer('pointermove', window, 280, 10);
      expect(indicator()).toEqual(['canvas', 'after']);
      await pointer('pointerup', window, 280, 10);
      expect(orderChanges).toEqual([['tasks', 'canvas', 'notes']]);
      expect(placed()).toEqual(['tasks', 'canvas', 'notes']);
      expect(indicator()).toBeNull();
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
      await pointer('pointerdown', grip('notes'), 150, 10);
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

    it('puts a dragged panel back when Escape is pressed', async () => {
      await render();
      layOut();
      await pointer('pointerdown', grip('tasks'), 50, 10);
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

    it('leaves the order alone when a panel is dropped where it was', async () => {
      await render();
      layOut();
      await pointer('pointerdown', grip('tasks'), 50, 10);
      await pointer('pointermove', window, 60, 10);
      await pointer('pointerup', window, 60, 10);
      expect(orderChanges).toEqual([]);
    });

    it('moves a panel with the arrow keys on its grip, keeping focus there', async () => {
      await render({ initial: 'tasks,notes,canvas' });
      expect(grip('tasks').getAttribute('aria-label')).toBe('Move Tasks');
      grip('tasks').focus();
      await key(grip('tasks'), 'ArrowRight');
      expect(placed()).toEqual(['notes', 'tasks', 'canvas']);
      expect(announced()).toBe('Tasks moved to position 2 of 3.');
      await key(grip('tasks'), 'End');
      expect(placed()).toEqual(['notes', 'canvas', 'tasks']);
      await key(grip('tasks'), 'ArrowRight');
      expect(orderChanges).toHaveLength(2);
      await key(grip('canvas'), 'Home');
      expect(placed()).toEqual(['canvas', 'notes', 'tasks']);
      expect(document.activeElement).toBe(grip('tasks'));
    });

    it('has no grip on a panel shown alone', async () => {
      await render({ initial: 'notes' });
      expect(container.querySelector('[data-panel="notes"] [data-reorder-grip]')).toBeNull();
    });

    it('drops a rail among the panels, showing that panel there', async () => {
      await render();
      layOut();
      await pointer('pointerdown', grip('canvas'), 1020, 50);
      await pointer('pointermove', window, 120, 10);
      expect(indicator()).toEqual(['notes', 'before']);
      await pointer('pointerup', window, 120, 10);
      expect(orderChanges).toEqual([['tasks', 'canvas', 'notes']]);
      expect(changes).toEqual(['tasks,notes,canvas']);
      expect(placed()).toEqual(['tasks', 'canvas', 'notes']);
      expect(rails()).toEqual([]);
    });

    it('reorders the rails among themselves, by dragging or with the up and down arrows', async () => {
      await render({ initial: 'tasks' });
      expect(rails()).toEqual(['notes', 'canvas']);
      layOut();
      await pointer('pointerdown', grip('canvas'), 1020, 150);
      await pointer('pointermove', window, 1020, 20);
      expect(indicator()).toEqual(['notes', 'before']);
      await pointer('pointerup', window, 1020, 20);
      expect(rails()).toEqual(['canvas', 'notes']);
      expect(changes).toEqual([]);
      grip('canvas').focus();
      await key(grip('canvas'), 'ArrowDown');
      expect(rails()).toEqual(['notes', 'canvas']);
      expect(document.activeElement).toBe(grip('canvas'));
      expect(announced()).toBe('Canvas moved to position 2 of 2.');
    });

    it('lays the panels and rails out in the saved order, and adds a panel back in its place', async () => {
      await render({ initial: 'canvas,tasks', initialOrder: ['canvas', 'notes', 'tasks'] });
      expect(placed()).toEqual(['canvas', 'tasks']);
      await click(control('Add Notes beside the others'));
      expect(changes).toEqual(['tasks,notes,canvas']);
      expect(placed()).toEqual(['canvas', 'notes', 'tasks']);
      await click(control('Hide Canvas'));
      await click(control('Hide Notes'));
      expect(rails()).toEqual(['canvas', 'notes']);
    });

    it('keeps the last panel on, maximize and restore working in any order', async () => {
      await render({ initial: 'tasks,notes,canvas', initialOrder: ['notes', 'canvas', 'tasks'] });
      await click(control('Show only Canvas'));
      expect(rails()).toEqual(['notes', 'tasks']);
      await click(control('Back to Tasks + Notes + Canvas'));
      expect(placed()).toEqual(['notes', 'canvas', 'tasks']);
    });
  });

  it('keeps each panel mounted, so it comes back as it was left', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    expect(slot('canvas')).toBeNull();
    await click(control('Hide Tasks'));
    expect(visible('tasks')).toBe(false);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    await click(control('Add Tasks beside the others'));
    expect(slot('tasks')!.textContent).toContain('tasks:1');
  });

  it('keeps a panel mounted when the screen crosses between a phone and a wide screen', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    media.phone = true;
    await render();
    expect(tabs().length).toBe(3);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    media.phone = false;
    await render();
    expect(tabs().length).toBe(0);
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
