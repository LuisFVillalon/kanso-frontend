// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  fetchProfile: vi.fn(),
  saveProfile: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => api);

import { useProfile } from './useProfile';

let container: HTMLDivElement;
let root: Root;
let hook: ReturnType<typeof useProfile>;

const Probe: React.FC<{ user: User | null; onResult: (r: typeof hook) => void }> = ({ user, onResult }) => {
  onResult(useProfile(user));
  return null;
};

const user = { id: 'user-1' } as User;

beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  api.fetchProfile.mockResolvedValue({ name: 'Maya', avatar: null, rest_days: [0] });
  api.saveProfile.mockResolvedValue({});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe user={user} onResult={r => { hook = r; }} />));
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('useProfile saveProfileField', () => {
  it('sends only the changed field, plus the name the endpoint requires', async () => {
    await act(async () => hook.saveProfileField({ restDays: [0, 6] }));
    expect(api.saveProfile).toHaveBeenCalledWith({ name: 'Maya', rest_days: [0, 6] });
    expect(hook.profile.restDays).toEqual([0, 6]);
    expect(localStorage.getItem('tm_rest_days')).toBe('[0,6]');
  });

  it("doesn't put back a name that a still-unanswered save replaced", async () => {
    let finishName!: () => void;
    api.saveProfile.mockImplementationOnce(() => new Promise(resolve => { finishName = () => resolve({}); }));
    let nameSave!: Promise<void>;
    act(() => { nameSave = hook.saveProfileField({ name: 'Mabel' }); });
    await act(async () => hook.saveProfileField({ avatar: 'tractor' }));
    expect(api.saveProfile).toHaveBeenLastCalledWith({ name: 'Mabel', avatar: 'tractor' });
    await act(async () => { finishName(); await nameSave; });
    expect(hook.profile).toMatchObject({ name: 'Mabel', avatar: 'tractor' });
  });

  it('throws and leaves the profile alone when the save fails', async () => {
    api.saveProfile.mockRejectedValueOnce(new Error('offline'));
    await act(async () => {
      await expect(hook.saveProfileField({ name: 'Mabel' })).rejects.toThrow('offline');
    });
    expect(hook.profile.name).toBe('Maya');
    await act(async () => hook.saveProfileField({ avatar: 'disc-3' }));
    expect(api.saveProfile).toHaveBeenLastCalledWith({ name: 'Maya', avatar: 'disc-3' });
  });

  it('drops legacy mood settings the server still returns, including daily, sending back only weekly/monthly', async () => {
    api.fetchProfile.mockResolvedValueOnce({
      name: 'Maya',
      mood_checkins: { daily: false, weekly: true, monthly: false, remind: 'off', show_in_reports: false },
    });
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<Probe user={user} onResult={r => { hook = r; }} />));
    expect(hook.profile.moodCheckins).toEqual({ weekly: true, monthly: false });
    await act(async () => hook.saveProfileField({ moodCheckins: { ...hook.profile.moodCheckins, monthly: true } }));
    expect(api.saveProfile).toHaveBeenLastCalledWith({
      name: 'Maya', mood_checkins: { weekly: true, monthly: true },
    });
  });

  it('saves days with their own window and caches them', async () => {
    const dayWindows = { '1': { start: '10:00', end: '16:00' } };
    await act(async () => hook.saveProfileField({ dayWindows }));
    expect(api.saveProfile).toHaveBeenLastCalledWith({ name: 'Maya', day_windows: dayWindows });
    expect(hook.profile.dayWindows).toEqual(dayWindows);
    expect(JSON.parse(localStorage.getItem('tm_day_windows')!)).toEqual(dayWindows);
  });
});

describe('useProfile day windows', () => {
  const remount = async () => {
    act(() => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(<Probe user={user} onResult={r => { hook = r; }} />));
  };

  it("loads the server's windows, dropping malformed ones", async () => {
    api.fetchProfile.mockResolvedValueOnce({
      name: 'Maya',
      day_windows: {
        '1': { start: '10:00', end: '16:00' },
        '2': { start: '17:00', end: '09:00' },
        '9': { start: '10:00', end: '16:00' },
      },
    });
    await remount();
    expect(hook.profile.dayWindows).toEqual({ '1': { start: '10:00', end: '16:00' } });
  });

  it('treats a null field as no days with their own window', async () => {
    localStorage.setItem('tm_day_windows', JSON.stringify({ '1': { start: '10:00', end: '16:00' } }));
    api.fetchProfile.mockResolvedValueOnce({ name: 'Maya', day_windows: null });
    await remount();
    expect(hook.profile.dayWindows).toEqual({});
  });

  it("keeps the cached windows when the server doesn't have the field", async () => {
    localStorage.setItem('tm_day_windows', JSON.stringify({ '1': { start: '10:00', end: '16:00' } }));
    api.fetchProfile.mockResolvedValueOnce({ name: 'Maya' });
    await remount();
    expect(hook.profile.dayWindows).toEqual({ '1': { start: '10:00', end: '16:00' } });
  });
});
