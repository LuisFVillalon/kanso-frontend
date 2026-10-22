// @vitest-environment jsdom
import React, { act, useImperativeHandle, useRef, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarousel, {
  panelChoices, resolvePanels, shownPanels, type HomePanels, type PanelCarouselHandle, type PanelKey,
} from './PanelCarousel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ALL: PanelKey[] = ['tasks', 'notes', 'canvas'];
const NO_CANVAS: PanelKey[] = ['tasks', 'notes'];

describe('panelChoices', () => {
  it('offers every pair on a wide screen and every panel on a phone', () => {
    expect(panelChoices(ALL, false)).toEqual(['tasks,notes', 'notes,canvas', 'canvas,tasks']);
    expect(panelChoices(ALL, true).map(v => shownPanels(v, true))).toEqual([['tasks'], ['notes'], ['canvas']]);
  });

  it('leaves Canvas out when it is not connected', () => {
    expect(panelChoices(NO_CANVAS, false)).toEqual(['tasks,notes']);
    expect(panelChoices(NO_CANVAS, true).map(v => shownPanels(v, true))).toEqual([['tasks'], ['notes']]);
  });
});

describe('resolvePanels', () => {
  it('falls back to Tasks when a saved choice shows Canvas and it is not connected', () => {
    expect(resolvePanels('canvas,tasks', NO_CANVAS, true)).toBe('tasks,notes');
    expect(resolvePanels('notes,canvas', NO_CANVAS, false)).toBe('tasks,notes');
    expect(resolvePanels('canvas,tasks', ALL, false)).toBe('canvas,tasks');
  });

  it('keeps Notes on a phone, where the pair it was saved with is not on screen', () => {
    expect(resolvePanels('notes,canvas', NO_CANVAS, true)).toBe('notes,canvas');
  });
});

// ── Component ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let media: { phone: boolean };
let changes: HomePanels[];
let handle: PanelCarouselHandle | null;

/** A panel with its own state, to check it survives being switched away and back. */
const Counter: React.FC<{ name: PanelKey }> = ({ name }) => {
  const [count, setCount] = useState(0);
  return <button type="button" data-counter={name} onClick={() => setCount(c => c + 1)}>{name}:{count}</button>;
};

interface HarnessProps { initial?: HomePanels; available?: PanelKey[] }

const Harness = React.forwardRef<PanelCarouselHandle, HarnessProps>(function Harness({ initial = 'tasks,notes', available = ALL }, ref) {
  const [value, setValue] = useState<HomePanels>(initial);
  const splitRef = useRef<HTMLDivElement>(null);
  const inner = useRef<PanelCarouselHandle>(null);
  useImperativeHandle(ref, () => ({ show: panel => inner.current?.show(panel) }), []);
  return (
    <PanelCarousel
      ref={inner}
      value={value}
      onChange={next => { changes.push(next); setValue(next); }}
      available={available}
      leftWidthPct={50}
      splitRef={splitRef}
      onSplitterMouseDown={() => {}}
      renderPanel={key => <Counter name={key} />}
    />
  );
});

const render = async (props: HarnessProps = {}) => {
  await act(async () => root.render(<Harness {...props} ref={h => { handle = h; }} />));
};
const tabs = () => [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
const name = (el: HTMLElement) => el.getAttribute('aria-label');
const tabNamed = (label: string) => tabs().find(t => name(t) === label)!;
const selected = () => tabs().filter(t => t.getAttribute('aria-selected') === 'true').map(name);
const arrows = () => [...container.querySelectorAll<HTMLButtonElement>('button:not([role="tab"]):not([data-counter])')];
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const slot = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-panel="${key}"]`);
const visible = (key: PanelKey) => !!slot(key)?.className.includes('split-slot');
const split = () => container.querySelector<HTMLElement>('#home-panels-tabpanel')!;

beforeEach(() => {
  media = { phone: false };
  changes = [];
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
  it('names each icon tab after the panels it shows and marks the one on screen', async () => {
    await render();
    expect(container.querySelector('[role="tablist"]')!.getAttribute('aria-label')).toBe('Home panels');
    expect(tabs().map(name)).toEqual(['Tasks & Notes', 'Notes & Canvas', 'Canvas & Tasks']);
    expect(tabs().map(t => t.title)).toEqual(['Tasks & Notes', 'Notes & Canvas', 'Canvas & Tasks']);
    expect(tabs().every(t => t.textContent === '' && t.querySelector('svg'))).toBe(true);
    expect(selected()).toEqual(['Tasks & Notes']);
    expect(split().getAttribute('role')).toBe('tabpanel');
    expect(split().getAttribute('aria-labelledby')).toBe(tabNamed('Tasks & Notes').id);
  });

  it('switches the pair from a tab click', async () => {
    await render();
    await click(tabNamed('Canvas & Tasks'));
    expect(changes).toEqual(['canvas,tasks']);
    expect(selected()).toEqual(['Canvas & Tasks']);
    expect(visible('canvas') && visible('tasks')).toBe(true);
    expect(visible('notes')).toBe(false);
    await click(tabNamed('Canvas & Tasks'));
    expect(changes).toEqual(['canvas,tasks']);
  });

  it('cycles through the choices with the previous and next arrows, wrapping at the ends', async () => {
    await render();
    const [prev, next] = arrows();
    expect(name(prev)).toBe('Previous: Canvas & Tasks');
    expect(name(next)).toBe('Next: Notes & Canvas');
    await click(prev);
    expect(selected()).toEqual(['Canvas & Tasks']);
    await click(next);
    await click(next);
    expect(changes).toEqual(['canvas,tasks', 'tasks,notes', 'notes,canvas']);
    expect(name(next)).toBe('Next: Canvas & Tasks');
  });

  it('moves the selection with the arrow keys, Home and End, focusing the new tab', async () => {
    await render();
    const press = async (key: string) => {
      await act(async () => {
        document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      });
    };
    tabNamed('Tasks & Notes').focus();
    await press('ArrowRight');
    await press('End');
    await press('ArrowRight');
    await press('ArrowLeft');
    expect(changes).toEqual(['notes,canvas', 'canvas,tasks', 'tasks,notes', 'canvas,tasks']);
    expect(document.activeElement).toBe(tabNamed('Canvas & Tasks'));
    expect(tabs().map(t => t.tabIndex)).toEqual([-1, -1, 0]);
  });

  it('shows one panel per tab on a phone', async () => {
    media.phone = true;
    await render({ initial: 'notes,canvas' });
    expect(tabs().map(name)).toEqual(['Tasks', 'Notes', 'Canvas']);
    expect(selected()).toEqual(['Notes']);
    await click(tabNamed('Tasks'));
    expect(changes).toEqual(['tasks,notes']);
    await click(arrows()[0]);
    expect(selected()).toEqual(['Canvas']);
  });

  describe('without Canvas connected', () => {
    it('shows Tasks and Notes with no tabs on a wide screen, even when Canvas was saved', async () => {
      await render({ initial: 'canvas,tasks', available: NO_CANVAS });
      expect(container.querySelector('[role="tablist"]')).toBeNull();
      expect(arrows()).toEqual([]);
      expect(split().getAttribute('role')).toBeNull();
      expect(visible('tasks') && visible('notes')).toBe(true);
      expect(slot('canvas')).toBeNull();
      expect(changes).toEqual([]);
    });

    it('offers only Tasks and Notes on a phone, falling back to Tasks', async () => {
      media.phone = true;
      await render({ initial: 'canvas,tasks', available: NO_CANVAS });
      expect(tabs().map(name)).toEqual(['Tasks', 'Notes']);
      expect(selected()).toEqual(['Tasks']);
      expect(slot('canvas')).toBeNull();
      await click(arrows()[1]);
      await click(arrows()[1]);
      expect(selected()).toEqual(['Tasks']);
    });
  });

  it('keeps each panel mounted, so it comes back as it was left', async () => {
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    expect(slot('canvas')).toBeNull();
    await click(tabNamed('Notes & Canvas'));
    expect(visible('tasks')).toBe(false);
    expect(slot('tasks')!.textContent).toBe('tasks:1');
    await click(tabNamed('Canvas & Tasks'));
    expect(slot('tasks')!.className).toContain('split-right');
    expect(slot('tasks')!.textContent).toBe('tasks:1');
  });

  it('brings a panel on screen through its handle, with that panel on the left', async () => {
    await render({ initial: 'notes,canvas' });
    await act(async () => handle!.show('canvas'));
    expect(changes).toEqual([]);
    await act(async () => handle!.show('tasks'));
    expect(changes).toEqual(['tasks,notes']);
  });
});
