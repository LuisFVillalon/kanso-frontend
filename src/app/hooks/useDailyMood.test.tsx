// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { NotificationsContext, type NotificationsContextValue } from '@/app/context/NotificationsContextValue';
import { useDailyMood } from './useDailyMood';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ onResult }: { onResult: (on: boolean | null) => void }) {
  onResult(useDailyMood());
  return null;
}

const dailyMood = (value: Partial<NotificationsContextValue> | null) => {
  let result: boolean | null | undefined;
  const root = createRoot(document.createElement('div'));
  const probe = <Probe onResult={on => { result = on; }} />;
  act(() => root.render(value
    ? <NotificationsContext.Provider value={value as NotificationsContextValue}>{probe}</NotificationsContext.Provider>
    : probe));
  act(() => root.unmount());
  return result;
};

const ready = (types: Record<string, boolean>) => ({
  status: 'ready' as const,
  preferencesError: false,
  preferences: { types, quiet_hours_start: null, quiet_hours_end: null, default_reminder_minutes: 120 },
});

describe('useDailyMood', () => {
  it('follows the mood check-in reminder switch', () => {
    expect(dailyMood(ready({ mood_reminder: true }))).toBe(true);
    expect(dailyMood(ready({ mood_reminder: false }))).toBe(false);
    // A server that doesn't list the type yet: on, its default.
    expect(dailyMood(ready({}))).toBe(true);
  });

  it('is unknown while the notification settings load', () => {
    expect(dailyMood({ status: 'loading', preferences: null, preferencesError: false })).toBeNull();
    expect(dailyMood({ status: 'ready', preferences: null, preferencesError: false })).toBeNull();
  });

  it('falls back to on when the settings can’t load or there are no notifications', () => {
    expect(dailyMood({ status: 'ready', preferences: null, preferencesError: true })).toBe(true);
    expect(dailyMood({ status: 'unavailable', preferences: null, preferencesError: false })).toBe(true);
    expect(dailyMood({ status: 'error', preferences: null, preferencesError: false })).toBe(true);
    expect(dailyMood(null)).toBe(true);
  });
});
