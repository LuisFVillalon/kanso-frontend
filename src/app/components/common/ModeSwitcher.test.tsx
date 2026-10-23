// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModeSwitcher, { type AppMode } from './ModeSwitcher';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let changes: AppMode[];

const Harness: React.FC = () => {
  const [mode, setMode] = useState<AppMode>('normal');
  return <ModeSwitcher mode={mode} onChange={next => { changes.push(next); setMode(next); }} />;
};

const buttons = () => [...container.querySelectorAll<HTMLButtonElement>('button')];
const button = (name: string) => buttons().find(b => b.getAttribute('aria-label') === name)!;
const click = async (el: HTMLElement) => { await act(async () => { el.click(); }); };

beforeEach(() => {
  vi.useFakeTimers();
  changes = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('ModeSwitcher', () => {
  it('names every mode, showing the name only on the selected one', async () => {
    await act(async () => root.render(<Harness />));
    expect(container.querySelector('[role="group"]')!.getAttribute('aria-label')).toBe('View mode');
    expect(buttons().map(b => b.getAttribute('aria-label'))).toEqual(['Overview', 'kanso (focus mode)', 'Doodle']);
    expect(buttons().map(b => b.textContent)).toEqual(['Overview', '', '']);
    expect(button('Overview').getAttribute('aria-pressed')).toBe('true');
    expect(button('Overview').hasAttribute('data-tip')).toBe(false);
    expect(button('kanso (focus mode)').dataset.tip).toBe('kanso (focus mode)');
    expect(button('Doodle').dataset.tip).toBe('Doodle');
  });

  it('draws Overview as a grid and kanso as the logo\'s k, in the button\'s ink', async () => {
    await act(async () => root.render(<Harness />));
    expect(button('Overview').querySelector('svg')!.classList.contains('lucide-layout-grid')).toBe(true);
    const k = button('kanso (focus mode)').querySelector('svg path')!;
    expect(k.getAttribute('fill')).toBe('currentColor');
    expect(button('kanso (focus mode)').innerHTML).not.toContain('--kanso-key');
  });

  it('switches mode, moving the name, and presses the clicked mode once', async () => {
    await act(async () => root.render(<Harness />));
    await click(button('kanso (focus mode)'));
    expect(changes).toEqual(['focus']);
    expect(buttons().map(b => b.textContent)).toEqual(['', 'kanso', '']);
    expect(button('kanso (focus mode)').getAttribute('aria-pressed')).toBe('true');
    expect(button('Overview').dataset.tip).toBe('Overview');
    expect(button('kanso (focus mode)').className).toContain('key-press-play');
    expect(button('Overview').className).not.toContain('key-press-play');
    act(() => { vi.advanceTimersByTime(400); });
    expect(button('kanso (focus mode)').className).not.toContain('key-press-play');
  });

  it('shows an icon-only mode\'s name on a long press, without switching to it', async () => {
    await act(async () => root.render(<Harness />));
    const doodle = button('Doodle');
    act(() => { doodle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' })); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(doodle.hasAttribute('data-tip-open')).toBe(true);
    act(() => { doodle.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' })); });
    await click(doodle);
    expect(changes).toEqual([]);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(doodle.hasAttribute('data-tip-open')).toBe(false);
    await click(doodle);
    expect(changes).toEqual(['doodle']);
  });
});
