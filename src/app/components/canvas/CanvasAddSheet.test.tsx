// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasItem } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import { DEFAULT_ACCENT } from '@/app/lib/theme';
import CanvasAddSheet from './CanvasAddSheet';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date(2026, 9, 22, 10, 30);
const ITEM: CanvasItem = {
  id: 9, kind: 'quiz', title: 'Quiz 5: Dynamic programming', course_id: 41201, course_name: 'CS 460-01',
  due_at: new Date(2026, 9, 27, 9, 30).toISOString(), points_possible: 15, html_url: null, submission: null,
};
const TAGS: Tag[] = [
  { id: 1, name: 'School', color: '#1F6FC4' },
  { id: 2, name: 'CS', color: '#0D9488' },
  { id: 5, name: 'Deep work', color: '#7C3AED' },
];
const CANVAS_TAG: Tag = { id: 0, name: 'CS 460-01', color: DEFAULT_ACCENT };

let container: HTMLDivElement;
let root: Root;
let onConfirm: ReturnType<typeof vi.fn<(tags: Tag[], remember: boolean) => Promise<void>>>;
let onClose: ReturnType<typeof vi.fn<() => void>>;

const render = async (props: Partial<React.ComponentProps<typeof CanvasAddSheet>> = {}) => {
  await act(async () => root.render(
    <CanvasAddSheet
      mode="add"
      item={ITEM}
      classLabel="CS 460-01"
      tags={TAGS}
      initial={[CANVAS_TAG]}
      fromDefaults={false}
      canRemember
      now={NOW}
      onClose={onClose}
      onConfirm={onConfirm}
      {...props}
    />,
  ));
};
const selected = () => [...container.querySelectorAll('[data-testid="canvas-sheet-selected"] > span.rounded-full')].map(s => s.textContent);
const input = () => container.querySelector<HTMLInputElement>('input[aria-label="Find or create a tag"]')!;
const button = (label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };
const type = async (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input(), value);
    input().dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const key = async (k: string, target: HTMLElement = input()) => {
  await act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
};

beforeEach(() => {
  onConfirm = vi.fn<(tags: Tag[], remember: boolean) => Promise<void>>().mockResolvedValue(undefined);
  onClose = vi.fn<() => void>();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('CanvasAddSheet', () => {
  it('opens on the class tag from Canvas, says it is new, and focuses the search', async () => {
    await render();
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Add to tasks');
    expect(container.textContent).toContain('Quiz 5: Dynamic programming · CS 460-01 · due');
    expect(selected()).toEqual(['CS 460-01']);
    expect(container.textContent).toContain('It’s new: kanso creates it with the first task you add.');
    expect(document.activeElement).toBe(input());
  });

  it('lets the class tag go, and says the task still names its class', async () => {
    await render();
    await click(button('Remove CS 460-01')!);
    expect(selected()).toEqual([]);
    expect(container.textContent).toContain('No class tag from Canvas. The task still shows “From Canvas · CS 460-01”.');
    // It's offered again, marked as coming from Canvas.
    expect(button('CS 460-01from Canvas')).toBeTruthy();
    await click(button('Add task')!);
    expect(onConfirm).toHaveBeenCalledWith([], false);
  });

  it('adds one of your tags from the search, by click or Enter', async () => {
    await render();
    await click(button('School')!);
    await type('deep work');
    await key('Enter');
    expect(selected()).toEqual(['CS 460-01', 'School', 'Deep work']);
    expect(input().value).toBe('');
    expect(button('CS')).toBeTruthy();
    expect(button('School')).toBeUndefined();
  });

  it('creates a new tag in the chosen color', async () => {
    await render();
    await type('Exam prep');
    expect(button('Create “Exam prep”')).toBeTruthy();
    await click(button('Violet')!);
    await key('Enter');
    expect(selected()).toEqual(['CS 460-01', 'Exam prep']);
    await key('Enter');
    expect(onConfirm).toHaveBeenCalledWith([CANVAS_TAG, { id: 0, name: 'Exam prep', color: '#7C3AED' }], false);
  });

  it("doesn't offer to create a tag you already have", async () => {
    await render();
    await type('cs');
    expect(button('Create “cs”')).toBeUndefined();
    await key('Enter');
    expect(selected()).toEqual(['CS 460-01', 'CS']);
  });

  it('removes the last tag with Backspace and closes with Escape', async () => {
    await render({ initial: [CANVAS_TAG, TAGS[1]] });
    await key('Backspace');
    expect(selected()).toEqual(['CS 460-01']);
    await key('Escape');
    expect(onClose).toHaveBeenCalled();
  });

  it('remembers the tags for the class when ticked', async () => {
    await render();
    const remember = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(remember.checked).toBe(false);
    expect(remember.parentElement?.textContent).toBe('Use these tags for every CS 460-01 task I add from Canvas');
    await click(remember);
    await click(button('Add task')!);
    expect(onConfirm).toHaveBeenCalledWith([CANVAS_TAG], true);
  });

  it("opens on the class's usual tags with remembering already ticked", async () => {
    await render({ initial: [TAGS[1], TAGS[2]], fromDefaults: true });
    expect(selected()).toEqual(['CS', 'Deep work']);
    expect(container.textContent).toContain('Your usual tags for CS 460-01.');
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true);
  });

  it('disables remembering with no tags, and still adds the task', async () => {
    await render({ initial: [TAGS[1]], fromDefaults: true });
    const remember = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(remember.disabled).toBe(false);
    await click(button('Remove CS')!);
    expect(remember.disabled).toBe(true);
    expect(container.textContent).toContain('Remembering tags for CS 460-01 needs at least one tag.');
    await click(button('Add task')!);
    expect(onConfirm).toHaveBeenCalledWith([], true);
  });

  it('offers no remembering for an item without a class', async () => {
    await render({ classLabel: null, initial: [], canRemember: false });
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("chooses a class's tags with Save", async () => {
    await render({ mode: 'class', item: null });
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Tags for CS 460-01 tasks');
    expect(container.textContent).toContain('Every CS 460-01 task you add from Canvas starts with these tags.');
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await click(button('CS')!);
    await click(button('Save')!);
    expect(onConfirm).toHaveBeenCalledWith([CANVAS_TAG, TAGS[1]], true);
  });

  it("won't save a class's tags with none chosen", async () => {
    await render({ mode: 'class', item: null });
    await click(button('Remove CS 460-01')!);
    expect(button('Save')!.disabled).toBe(true);
    expect(container.textContent).toContain('Saving tags for CS 460-01 needs at least one tag.');
    await key('Enter');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('marks the class tag when it is one of your tags already', async () => {
    const own = { id: 8, name: 'CS 460-01', color: '#006BCB' };
    await render({ tags: [...TAGS, own], initial: [own] });
    expect(container.textContent).toContain('It’s already one of your tags.');
  });
});
