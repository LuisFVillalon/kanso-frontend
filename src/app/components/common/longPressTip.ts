import type React from 'react';

// An icon-only control names itself in a tooltip (globals.css [data-tip]):
// on hover and keyboard focus by CSS alone, and on a touch screen by a long
// press, which these handlers add. The long press only shows the name; the
// click that follows it is dropped, so peeking doesn't switch anything.

const LONG_PRESS_MS = 500;
const TIP_SHOWN_MS = 1500;

const timers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();
const peeked = new WeakSet<HTMLElement>();

const clear = (el: HTMLElement) => {
  const timer = timers.get(el);
  if (timer) clearTimeout(timer);
  timers.delete(el);
};

export const longPressTip = {
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType !== 'touch') return;
    const el = e.currentTarget;
    clear(el);
    peeked.delete(el);
    timers.set(el, setTimeout(() => {
      peeked.add(el);
      el.setAttribute('data-tip-open', '');
      timers.set(el, setTimeout(() => el.removeAttribute('data-tip-open'), TIP_SHOWN_MS));
    }, LONG_PRESS_MS));
  },
  onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
    if (!peeked.has(e.currentTarget)) clear(e.currentTarget);
  },
  onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
    clear(e.currentTarget);
    e.currentTarget.removeAttribute('data-tip-open');
  },
  onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
    if (!peeked.has(e.currentTarget)) return;
    peeked.delete(e.currentTarget);
    e.preventDefault();
    e.stopPropagation();
  },
};
