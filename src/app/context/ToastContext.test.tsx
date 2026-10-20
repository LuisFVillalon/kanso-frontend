// @vitest-environment jsdom
import React, { act, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider, useToast, type ToastAction } from './ToastContext';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let showToast: ReturnType<typeof useToast>;

function Grab({ onReady }: { onReady: (show: ReturnType<typeof useToast>) => void }) {
  const show = useToast();
  useEffect(() => onReady(show), [show, onReady]);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<ToastProvider><Grab onReady={show => { showToast = show; }} /></ToastProvider>));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const show = (action?: ToastAction) => act(() => showToast('Task moved to Recently deleted.', 'info', action));
const undoButton = () => [...document.querySelectorAll('button')].find(b => b.textContent === 'Undo');

describe('ToastProvider actions', () => {
  it('runs the action and dismisses the toast when its button is clicked', () => {
    const onClick = vi.fn();
    show({ label: 'Undo', onClick });
    act(() => undoButton()!.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(document.body.textContent).not.toContain('Recently deleted');
  });

  it('keeps a toast with an action up longer than a plain one', () => {
    show({ label: 'Undo', onClick: () => {} });
    act(() => vi.advanceTimersByTime(5000));
    expect(undoButton()).toBeDefined();
    act(() => vi.advanceTimersByTime(3000));
    expect(undoButton()).toBeUndefined();
  });

  it('shows no button without an action', () => {
    show();
    expect(undoButton()).toBeUndefined();
    act(() => vi.advanceTimersByTime(5000));
    expect(document.body.textContent).not.toContain('Recently deleted');
  });
});
