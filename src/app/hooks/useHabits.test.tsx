// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchHabits: vi.fn(), verifyHabitStreaks: vi.fn(), toggleHabitDate: vi.fn() }));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_err: unknown, fallback: string) => fallback }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => vi.fn() }));

import { useHabits } from './useHabits';
import { useActivityVersion } from './useActivityVersion';
import { toLocalDateStr } from '@/app/utils/dateUtils';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const VersionProbe: React.FC<{ onVersion: (v: number) => void }> = ({ onVersion }) => {
  onVersion(useActivityVersion());
  return null;
};

let hook: ReturnType<typeof useHabits>;
const Probe: React.FC<{ onResult: (r: typeof hook) => void }> = ({ onResult }) => {
  onResult(useHabits(false));
  return null;
};

let root: Root;
beforeEach(() => {
  api.fetchHabits.mockReset().mockResolvedValue([{ id: 5, title: 'Run', tags: [] }]);
  api.verifyHabitStreaks.mockReset().mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe onResult={r => { hook = r; }} />));
});
afterEach(() => act(() => root.unmount()));

describe('useHabits.reloadEdited', () => {
  it('bumps the edit token and reloads the habits', async () => {
    expect(hook.editSyncToken).toBe(0);
    await act(async () => { await hook.reloadEdited(); });
    expect(hook.editSyncToken).toBe(1);
    expect(hook.habits).toEqual([{ id: 5, title: 'Run', tags: [] }]);
  });
});

describe('useHabits.toggleDate', () => {
  it('tells the calendars and Reports to reload after another day’s check-in changes, not today’s', async () => {
    let version = -1;
    const versionRoot = createRoot(document.createElement('div'));
    act(() => versionRoot.render(<VersionProbe onVersion={v => { version = v; }} />));
    await act(async () => {});
    api.toggleHabitDate.mockResolvedValue({ id: 5, title: 'Run', tags: [], logged_today: false });
    const before = version;

    await act(async () => { await hook.toggleDate(5, toLocalDateStr(new Date())); });
    expect(version).toBe(before);
    await act(async () => { await hook.toggleDate(5, '2020-01-06'); });
    expect(version).toBe(before + 1);
    act(() => versionRoot.unmount());
  });
});
