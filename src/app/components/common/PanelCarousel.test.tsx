// @vitest-environment jsdom
import React, { act, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarousel, {
  isHomePanels, parseHomePanels, phonePanel, toHomePanels, widePanels,
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

// ── Component ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let media: { phone: boolean };
let changes: HomePanels[];
let phoneChanges: PanelKey[];
let drags: [number, number][];
let handle: PanelCarouselHandle | null;

/** A panel with its own state, to check it survives being switched away and back. */
const Counter: React.FC<{ name: PanelKey; widthPct: number }> = ({ name, widthPct }) => {
  const [count, setCount] = useState(0);
  return <button type="button" data-counter={name} data-width={widthPct} onClick={() => setCount(c => c + 1)}>{name}:{count}</button>;
};

interface HarnessProps { initial?: HomePanels; initialPhone?: PanelKey; available?: PanelKey[]; movable?: boolean }

const Harness = React.forwardRef<PanelCarouselHandle, HarnessProps>(function Harness(
  { initial = 'tasks,notes', initialPhone = 'tasks', available = ALL, movable = true },
  ref,
) {
  const [value, setValue] = useState<HomePanels>(initial);
  const [phoneValue, setPhoneValue] = useState<PanelKey>(initialPhone);
  const splitRef = useRef<HTMLDivElement>(null);
  const inner = useRef<PanelCarouselHandle>(null);
  useImperativeHandle(ref, () => ({ show: panel => inner.current?.show(panel) }), []);
  return (
    <PanelCarousel
      ref={inner}
      value={value}
      onChange={next => { changes.push(next); setValue(next); }}
      phoneValue={phoneValue}
      onPhoneChange={next => { phoneChanges.push(next); setPhoneValue(next); }}
      available={available}
      panelWidths={count => (count === 3 ? [20, 30, 50] : count === 2 ? [60, 40] : [100])}
      dividersMovable={() => movable}
      splitRef={splitRef}
      onDividerPointerDown={(count, index) => { drags.push([count, index]); }}
      renderPanel={(key, { widthPct }) => <Counter name={key} widthPct={widthPct} />}
    />
  );
});

const render = async (props: HarnessProps = {}) => {
  await act(async () => root.render(<Harness {...props} ref={h => { handle = h; }} />));
};
const chips = () => [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')];
const chip = (label: string) => chips().find(c => c.textContent === label)!;
const pressed = () => chips().filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.textContent);
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const tab = (label: string) => tabs().find(t => t.textContent === label)!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const slot = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-panel="${key}"]`);
const visible = (key: PanelKey) => !!slot(key)?.className.includes('split-slot');
const onScreen = () => (['tasks', 'notes', 'canvas'] as PanelKey[]).filter(visible);
const width = (key: PanelKey) => slot(key)!.style.getPropertyValue('--slot-w');
const dividers = () => [...container.querySelectorAll<HTMLElement>('[data-divider]')];
const split = () => container.querySelector<HTMLElement>('#home-panels-tabpanel')!;

beforeEach(() => {
  media = { phone: false };
  changes = [];
  phoneChanges = [];
  drags = [];
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
  it('has a chip per panel, pressed for each panel on screen', async () => {
    await render();
    expect(container.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('Home panels');
    expect(chips().map(c => c.textContent)).toEqual(['Tasks', 'Notes', 'Canvas']);
    expect(pressed()).toEqual(['Tasks', 'Notes']);
    expect(onScreen()).toEqual(['tasks', 'notes']);
    expect(chip('Canvas').title).toBe('Show Canvas');
    expect(chip('Notes').title).toBe('Hide Notes');
    expect(split().getAttribute('role')).toBeNull();
  });

  it('turns a panel off to give the others its width, down to one panel filling the split', async () => {
    await render();
    await click(chip('Notes'));
    expect(changes).toEqual(['tasks']);
    expect(onScreen()).toEqual(['tasks']);
    expect(width('tasks')).toBe('calc(100% - 0px)');
    expect(dividers()).toEqual([]);
  });

  it('keeps the last panel on', async () => {
    await render({ initial: 'notes' });
    expect(chip('Notes').getAttribute('aria-disabled')).toBe('true');
    expect(chip('Notes').title).toBe('At least one panel stays on');
    await click(chip('Notes'));
    expect(changes).toEqual([]);
    expect(onScreen()).toEqual(['notes']);
  });

  it('shows three panels in columns with a divider between each, saved in Tasks, Notes, Canvas order', async () => {
    await render({ initial: 'notes,canvas' });
    await click(chip('Tasks'));
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
    expect(pressed()).toEqual(['Tasks', 'Canvas']);
    expect(onScreen()).toEqual(['tasks', 'canvas']);
    await click(chip('Notes'));
    expect(changes).toEqual(['tasks,notes,canvas']);
  });

  describe('without Canvas connected', () => {
    it('offers Tasks and Notes, still turning either off', async () => {
      await render({ initial: 'tasks,canvas', available: NO_CANVAS });
      expect(chips().map(c => c.textContent)).toEqual(['Tasks', 'Notes']);
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
      await click(chip('Notes'));
      expect(changes).toEqual(['tasks,notes']);
    });

    it('falls back to Tasks and Notes when only Canvas was on', async () => {
      await render({ initial: 'canvas', available: NO_CANVAS });
      expect(onScreen()).toEqual(['tasks', 'notes']);
      expect(changes).toEqual([]);
    });
  });

  describe('on a phone', () => {
    beforeEach(() => { media.phone = true; });

    it('shows one panel, picked from tabs, without touching the wide screen\'s panels', async () => {
      await render({ initial: 'tasks,notes,canvas', initialPhone: 'notes' });
      expect(container.querySelector('[role="group"]')).toBeNull();
      expect(tabs().map(t => t.textContent)).toEqual(['Tasks', 'Notes', 'Canvas']);
      expect(tab('Notes').getAttribute('aria-selected')).toBe('true');
      expect(onScreen()).toEqual(['notes']);
      expect(split().getAttribute('role')).toBe('tabpanel');
      expect(split().getAttribute('aria-labelledby')).toBe(tab('Notes').id);
      expect(dividers()).toEqual([]);
      await click(tab('Canvas'));
      expect(phoneChanges).toEqual(['canvas']);
      expect(onScreen()).toEqual(['canvas']);
      expect(changes).toEqual([]);
    });

    it('offers only Tasks and Notes without Canvas, falling back to Tasks', async () => {
      await render({ initialPhone: 'canvas', available: NO_CANVAS });
      expect(tabs().map(t => t.textContent)).toEqual(['Tasks', 'Notes']);
      expect(onScreen()).toEqual(['tasks']);
      expect(slot('canvas')).toBeNull();
    });
  });

  it('keeps each panel mounted, so it comes back as it was left', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    expect(slot('canvas')).toBeNull();
    await click(chip('Tasks'));
    expect(visible('tasks')).toBe(false);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    await click(chip('Tasks'));
    expect(slot('tasks')!.textContent).toBe('tasks:1');
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
