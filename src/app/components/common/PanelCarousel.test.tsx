// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PanelCarousel, {
  revealDirection, shownPanels, slidePanels, type HomePanels, type PanelKey,
} from './PanelCarousel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('slidePanels', () => {
  it('slides left around the ring: Tasks+Notes → Notes+Canvas → Canvas+Tasks → Tasks+Notes', () => {
    const seen: HomePanels[] = ['tasks,notes'];
    for (let i = 0; i < 3; i++) seen.push(slidePanels(seen[seen.length - 1], 1));
    expect(seen).toEqual(['tasks,notes', 'notes,canvas', 'canvas,tasks', 'tasks,notes']);
  });

  it('slides right the other way round', () => {
    const seen: HomePanels[] = ['tasks,notes'];
    for (let i = 0; i < 3; i++) seen.push(slidePanels(seen[seen.length - 1], -1));
    expect(seen).toEqual(['tasks,notes', 'canvas,tasks', 'notes,canvas', 'tasks,notes']);
  });
});

describe('revealDirection', () => {
  it('brings the hidden panel in from the right on a wide screen', () => {
    expect(revealDirection('tasks,notes', 'canvas', false)).toBe(1);
    expect(revealDirection('canvas,tasks', 'notes', false)).toBe(1);
    expect(revealDirection('tasks,notes', 'notes', false)).toBe(0);
  });

  it('slides toward whichever side the panel sits on when a phone shows one', () => {
    expect(shownPanels('tasks,notes', true)).toEqual(['tasks']);
    expect(revealDirection('tasks,notes', 'notes', true)).toBe(1);
    expect(revealDirection('tasks,notes', 'canvas', true)).toBe(-1);
    expect(revealDirection('tasks,notes', 'tasks', true)).toBe(0);
  });
});

// ── Component ────────────────────────────────────────────────────────────────

let container: HTMLDivElement;
let root: Root;
let media: { reduce: boolean; phone: boolean };
let changes: HomePanels[];

/** A panel with its own state, to check it survives being slid away and back. */
const Counter: React.FC<{ name: PanelKey }> = ({ name }) => {
  const [count, setCount] = useState(0);
  return <button type="button" data-counter={name} onClick={() => setCount(c => c + 1)}>{name}:{count}</button>;
};

const Harness: React.FC<{ initial?: HomePanels }> = ({ initial = 'tasks,notes' }) => {
  const [value, setValue] = useState<HomePanels>(initial);
  const splitRef = React.useRef<HTMLDivElement>(null);
  return (
    <>
      <input aria-label="search" />
      <PanelCarousel
        value={value}
        onChange={next => { changes.push(next); setValue(next); }}
        leftWidthPct={50}
        splitRef={splitRef}
        onSplitterMouseDown={() => {}}
        renderPanel={key => <Counter name={key} />}
      />
    </>
  );
};

const render = async (initial?: HomePanels) => {
  await act(async () => root.render(<Harness initial={initial} />));
};
const button = (label: string) => container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const pressed = () =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')]
    .filter(b => b.getAttribute('aria-pressed') === 'true')
    .map(b => b.getAttribute('aria-label'));
const slot = (key: PanelKey) => container.querySelector<HTMLElement>(`[data-panel="${key}"]`);
const track = () => container.querySelector<HTMLElement>('[data-testid="panel-track"]')!;
const press = async (key: string, target: EventTarget = document, init: KeyboardEventInit = {}) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
};

beforeEach(() => {
  media = { reduce: false, phone: false };
  changes = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') ? media.reduce : query.includes('max-width') ? media.phone : false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // jsdom lays nothing out; give the split a width so the slide can be measured.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PanelCarousel', () => {
  it('loops through the pairs with the ‹ and › buttons', async () => {
    media.reduce = true;
    await render();
    expect(pressed()).toEqual(['Tasks', 'Notes']);
    for (let i = 0; i < 3; i++) await click(button('Slide left'));
    await click(button('Slide right'));
    expect(changes).toEqual(['notes,canvas', 'canvas,tasks', 'tasks,notes', 'canvas,tasks']);
    expect(pressed()).toEqual(['Tasks', 'Canvas']);
  });

  it('shows only the left panel of the pair as active on a phone', async () => {
    media.reduce = true;
    media.phone = true;
    await render('notes,canvas');
    expect(pressed()).toEqual(['Notes']);
    await click(button('Tasks'));
    expect(changes).toEqual(['tasks,notes']);
  });

  it('slides a grey icon in and ignores clicks on a shown one', async () => {
    media.reduce = true;
    await render();
    await click(button('Notes'));
    expect(changes).toEqual([]);
    await click(button('Canvas'));
    expect(changes).toEqual(['notes,canvas']);
    expect(pressed()).toEqual(['Notes', 'Canvas']);
  });

  describe('arrow keys', () => {
    beforeEach(() => { media.reduce = true; });

    it('slides left on ArrowLeft and right on ArrowRight', async () => {
      await render();
      await press('ArrowLeft');
      await press('ArrowRight');
      await press('ArrowRight');
      expect(changes).toEqual(['notes,canvas', 'tasks,notes', 'canvas,tasks']);
    });

    it('leaves keys typed in an input alone', async () => {
      await render();
      const input = container.querySelector('input')!;
      await press('ArrowLeft', input);
      expect(changes).toEqual([]);
    });

    it('ignores keys with a modifier or while a modal is open', async () => {
      await render();
      await press('ArrowLeft', document, { shiftKey: true });
      await press('ArrowRight', document, { metaKey: true });
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay fixed';
      document.body.appendChild(overlay);
      await press('ArrowLeft');
      expect(changes).toEqual([]);
    });
  });

  it('slides with a 350ms transform and keeps each panel mounted', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(cb => frames.push(cb));
    const flushFrames = async () => {
      while (frames.length) await act(async () => { frames.shift()!(0); });
    };
    await render();
    await click(container.querySelector<HTMLElement>('[data-counter="tasks"]')!);
    expect(slot('canvas')).toBeNull();

    await click(button('Slide left'));
    // The indicator moves at once; the strip starts where it was...
    expect(changes).toEqual(['notes,canvas']);
    expect(container.querySelector('[data-sliding="true"]')).not.toBeNull();
    expect(track().style.transform).toBe('translateX(0px)');
    // ...and slides one panel width plus the handle.
    await flushFrames();
    expect(track().style.transform).toBe('translateX(-508px)');
    expect(track().style.transition).toBe('transform var(--tm-dur-slow) var(--tm-ease)');
    expect(slot('canvas')).not.toBeNull();

    await act(async () => {
      const end = new Event('transitionend', { bubbles: true });
      Object.assign(end, { propertyName: 'transform' });
      track().dispatchEvent(end);
    });
    expect(container.querySelector('[data-sliding="true"]')).toBeNull();
    expect(track().style.transform).toBe('');
    expect(slot('tasks')!.className).toContain('hidden');

    // Sliding Tasks back in finds it as it was left.
    media.reduce = true;
    await click(button('Slide left'));
    expect(slot('tasks')!.className).toContain('split-right');
    expect(slot('tasks')!.textContent).toBe('tasks:1');
  });

  it('skips the slide under prefers-reduced-motion', async () => {
    media.reduce = true;
    await render();
    await click(button('Slide left'));
    expect(changes).toEqual(['notes,canvas']);
    expect(container.querySelector('[data-sliding="true"]')).toBeNull();
    expect(track().style.transform).toBe('');
    expect(slot('notes')!.className).toContain('split-left');
    expect(slot('canvas')!.className).toContain('split-right');
  });

  it('ignores another slide while one is running', async () => {
    await render();
    await click(button('Slide left'));
    await click(button('Slide left'));
    await press('ArrowLeft');
    expect(changes).toEqual(['notes,canvas']);
  });
});
