// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PriorityPicker from './PriorityPicker';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

// Mirrors the task list: the picker sits on one glass card (its own
// stacking context) inside a scrolling panel, followed by a long card.
function renderInTaskList(onSelect = vi.fn()) {
  act(() => {
    root.render(
      <div className="overflow-y-auto">
        <div className="card-glass" data-testid="first-card">
          <PriorityPicker priority={2} maxPriority={10} availablePriorities={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onSelect={onSelect} />
        </div>
        <div className="card-glass" data-testid="long-card" style={{ height: 2000 }} />
      </div>,
    );
  });
  return onSelect;
}

function anchorAt(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    top, bottom, left: 900, right: 940, width: 40, height: bottom - top, x: 900, y: top, toJSON: () => ({}),
  } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(180);
}

function openMenu() {
  act(() => (container.querySelector('[aria-label="Change priority"]') as HTMLButtonElement).click());
  return document.querySelector('[role="menu"]') as HTMLDivElement;
}

describe('PriorityPicker menu', () => {
  it('renders outside the task card so neighbouring cards cannot cover or clip it', () => {
    anchorAt(100, 120);
    renderInTaskList();
    const menu = openMenu();
    expect(menu).not.toBeNull();
    expect(menu.parentElement).toBe(document.body);
    expect(container.contains(menu)).toBe(false);
    expect(menu.className).toContain('fixed');
    expect(menu.style.top).toBe('124px');
    expect(menu.style.visibility).toBe('');
  });

  it('flips upward when there is no room below the badge', () => {
    anchorAt(window.innerHeight - 30, window.innerHeight - 10);
    renderInTaskList();
    const menu = openMenu();
    expect(menu.style.top).toBe('');
    expect(menu.style.bottom).toBe('34px');
  });

  it('selects a level from the portaled menu', async () => {
    anchorAt(100, 120);
    const onSelect = renderInTaskList();
    const menu = openMenu();
    const option = Array.from(menu.querySelectorAll('button')).find(b => b.textContent === '7')!;
    act(() => option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await act(async () => option.click());
    expect(onSelect).toHaveBeenCalledWith(7);
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('closes when the task list scrolls', () => {
    anchorAt(100, 120);
    renderInTaskList();
    openMenu();
    act(() => container.firstElementChild!.dispatchEvent(new Event('scroll')));
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('moves keyboard focus into the menu and lets arrow keys pick a level', async () => {
    anchorAt(100, 120);
    const onSelect = renderInTaskList();
    const menu = openMenu();
    const items = Array.from(menu.querySelectorAll('[role="menuitem"]')) as HTMLButtonElement[];
    expect(document.activeElement).toBe(items.find(b => b.textContent === '2'));
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('3');
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(document.activeElement?.textContent).toBe('1');
    await act(async () => (document.activeElement as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('closes on Escape and returns focus to the badge', () => {
    anchorAt(100, 120);
    renderInTaskList();
    const menu = openMenu();
    act(() => menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector('[aria-label="Change priority"]'));
  });

  it('closes when focus leaves the menu', () => {
    anchorAt(100, 120);
    renderInTaskList();
    openMenu();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    act(() => outside.focus());
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('stays open when focus is dropped without a new target, as when clicking the badge in Safari', () => {
    anchorAt(100, 120);
    renderInTaskList();
    openMenu();
    act(() => (document.activeElement as HTMLElement).blur());
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });
});
