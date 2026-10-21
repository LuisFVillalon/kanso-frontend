// @vitest-environment jsdom
import React, { act, useEffect, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimersOverlay } from './TimersCard';
import type { CalendarSettings } from '@/app/types/calendar';
import type { ProfileFields } from '@/app/hooks/useProfile';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const settings = { start_date: '2026-08-24', end_date: '2026-12-18' } as CalendarSettings;
const profile = { dayStartTime: '00:00', shutoffTime: '23:59', restDays: [] } as unknown as ProfileFields;

// Re-renders more often than once a second, like a live clock above the overlay.
const ChattyParent: React.FC = () => {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 400);
    return () => clearInterval(interval);
  }, []);
  return <TimersOverlay profile={profile} settings={settings} settingsLoading={false} />;
};

const countdownSeconds = () => {
  const block = [...container.querySelectorAll('div')].find(d => d.firstElementChild?.textContent?.startsWith('Countdown to end of'));
  const label = [...(block?.querySelectorAll('span') ?? [])].find(s => s.textContent === 'Sec');
  return label?.previousElementSibling?.textContent ?? undefined;
};

describe('CountdownClock', () => {
  it('keeps ticking while its parent re-renders faster than once a second', () => {
    act(() => root.render(<ChattyParent />));
    const first = countdownSeconds();
    expect(first).toBe('00');

    // Separate act() calls so each parent re-render is committed between ticks.
    for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(400); });

    expect(countdownSeconds()).toBe('56');
  });
});
