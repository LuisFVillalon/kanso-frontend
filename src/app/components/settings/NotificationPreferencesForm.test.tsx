// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPreferences, NotificationPreferencesUpdate } from '@/app/types/notification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/app/lib/backend-api', () => ({
  describeError: (_err: unknown, fallback: string) => fallback,
}));

import NotificationPreferencesForm, { preferenceChanges } from './NotificationPreferencesForm';
import { AUTOSAVE_DEBOUNCE_MS } from './autosave';

let container: HTMLDivElement;
let root: Root;

const prefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  types: { due_today: true, task_reminder: true, final_warning: true, overdue: true, habit_reminder: true },
  quiet_hours_start: null,
  quiet_hours_end: null,
  default_reminder_minutes: 120,
  ...overrides,
});

/** Runs each save the way the settings page's tracker does, reporting whether it succeeded. */
const track = vi.fn((_key: string, run: () => Promise<unknown>) => run().then(() => true, () => false));
const onUndoableChange = vi.fn<(message: string, undo: () => void) => void>();

/** An onSave that applies the changes and answers with the result, like the API. */
const server = (preferences: NotificationPreferences) => {
  let stored = preferences;
  return vi.fn(async (changes: NotificationPreferencesUpdate) => {
    const { default_reminder_minutes: minutes, ...rest } = changes;
    stored = {
      ...stored,
      ...rest,
      types: { ...stored.types, ...changes.types },
      default_reminder_minutes: minutes === undefined ? stored.default_reminder_minutes : minutes ?? 120,
    };
    return stored;
  });
};

const render = (
  preferences: NotificationPreferences,
  onSave: (changes: NotificationPreferencesUpdate) => Promise<NotificationPreferences> = server(preferences),
) => {
  act(() => root.render(
    <NotificationPreferencesForm preferences={preferences} onSave={onSave} track={track} onUndoableChange={onUndoableChange} />,
  ));
  return onSave as ReturnType<typeof vi.fn>;
};

const byText = <T extends HTMLElement>(selector: string, text: string) =>
  [...document.querySelectorAll<T>(selector)].find(el => el.textContent?.trim() === text)!;
const switchFor = (label: string) => {
  const id = byText('p', label).id;
  return document.querySelector<HTMLButtonElement>(`[role="switch"][aria-labelledby="${id}"]`)!;
};
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const select = (labelledBy: string) => document.querySelector<HTMLSelectElement>(`select[aria-labelledby="${labelledBy}"]`)!;

/** Sets a controlled input's value the way React notices. */
const typeInto = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

/** Lets a typed value's pause run out, and its save settle. */
const pause = async () => {
  await act(async () => { await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS); });
};
const click = async (el: HTMLElement) => {
  await act(async () => { el.click(); });
};

beforeEach(() => {
  vi.useFakeTimers();
  track.mockClear();
  onUndoableChange.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('NotificationPreferencesForm', () => {
  it('shows a switch per alert type, reflecting the saved state, and no Save button', () => {
    render(prefs({ types: { ...prefs().types, overdue: false } }));
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(5);
    expect(switchFor('Morning summary').getAttribute('aria-checked')).toBe('true');
    expect(switchFor('Slipped task nudge').getAttribute('aria-checked')).toBe('false');
    expect([...document.querySelectorAll('button')].some(b => /save/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('saves only the switched type, at once', async () => {
    const onSave = render(prefs());
    await click(switchFor('Final warning'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ types: { final_warning: false } });
    expect(track).toHaveBeenCalledWith('notifications', expect.any(Function));
  });

  it('offers an Undo that switches the alert back and saves that', async () => {
    const onSave = render(prefs());
    await click(switchFor('Evening habit reminder'));
    expect(onUndoableChange).toHaveBeenCalledWith('Evening habit reminder turned off.', expect.any(Function));
    const undo = onUndoableChange.mock.calls[0][1];
    await act(async () => { undo(); });
    expect(switchFor('Evening habit reminder').getAttribute('aria-checked')).toBe('true');
    expect(onSave).toHaveBeenLastCalledWith({ types: { habit_reminder: true } });
  });

  it('waits for both quiet-hour ends, then saves them as a pair after a pause', async () => {
    const onSave = render(prefs());
    act(() => typeInto(input('quiet-start'), '22:00'));
    expect(document.body.textContent).toContain('Set both a start and an end');
    await pause();
    expect(onSave).not.toHaveBeenCalled();
    act(() => typeInto(input('quiet-end'), '07:00'));
    expect(onSave).not.toHaveBeenCalled();
    await pause();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
  });

  it('clears quiet hours by sending both as null', async () => {
    const onSave = render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
    await click(byText<HTMLButtonElement>('button', 'Clear'));
    expect(input('quiet-start').value).toBe('');
    expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: null, quiet_hours_end: null });
  });

  it("doesn't save quiet hours that start and end together", async () => {
    const onSave = render(prefs());
    act(() => typeInto(input('quiet-start'), '09:00'));
    act(() => typeInto(input('quiet-end'), '09:00'));
    expect(document.body.textContent).toContain("can't start and end at the same time");
    await pause();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves a new default reminder from the presets', async () => {
    const onSave = render(prefs());
    act(() => typeInto(select('default-reminder-label'), '1440'));
    await pause();
    expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 1440 });
  });

  it('saves a custom default reminder and holds back an out-of-range one', async () => {
    const onSave = render(prefs());
    act(() => typeInto(select('default-reminder-label'), 'custom'));
    const amount = document.querySelector<HTMLInputElement>('input[aria-label="Custom reminder amount"]')!;
    const unit = document.querySelector<HTMLSelectElement>('select[aria-label="Custom reminder unit"]')!;
    act(() => typeInto(unit, 'days'));
    act(() => typeInto(amount, '8'));
    expect(document.body.textContent).toContain('from 1 minute up to 7 days');
    await pause();
    expect(onSave).not.toHaveBeenCalledWith({ default_reminder_minutes: 8 * 24 * 60 });
    act(() => typeInto(unit, 'minutes'));
    act(() => typeInto(amount, '45'));
    await pause();
    expect(onSave).toHaveBeenLastCalledWith({ default_reminder_minutes: 45 });
  });

  it('keeps the change on screen and reports the failure when saving fails', async () => {
    const onSave = render(prefs(), vi.fn().mockRejectedValue(new Error('offline')));
    await click(switchFor('Morning summary'));
    expect(onSave).toHaveBeenCalledOnce();
    await expect(track.mock.results[0].value).resolves.toBe(false);
    expect(switchFor('Morning summary').getAttribute('aria-checked')).toBe('false');
  });

  it('saves a value still waiting for its pause when the page closes', async () => {
    const onSave = render(prefs());
    act(() => typeInto(select('default-reminder-label'), '1440'));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 1440 });
    root = createRoot(container);
  });

  it('lists a type this build has no label for', () => {
    render(prefs({ types: { ...prefs().types, mood_check_in: true } }));
    expect(switchFor('Mood check in')).toBeTruthy();
  });

  describe('mood reminders', () => {
    const moodPrefs = (overrides: Partial<NotificationPreferences> = {}) =>
      prefs({ types: { ...prefs().types, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60, ...overrides });
    const lead = (name: string) => byText<HTMLButtonElement>('button', name);

    it('labels both mood switches and picks the saved lead', () => {
      render(moodPrefs());
      expect(switchFor('Mood check-in reminder').getAttribute('aria-checked')).toBe('true');
      expect(switchFor('Missed mood check-ins').getAttribute('aria-checked')).toBe('true');
      expect(lead('1 hour before').getAttribute('aria-pressed')).toBe('true');
      expect(lead('30 minutes before').getAttribute('aria-pressed')).toBe('false');
    });

    it('saves the lead on its own, at once', async () => {
      const onSave = render(moodPrefs());
      await click(lead('30 minutes before'));
      expect(onSave).toHaveBeenCalledWith({ mood_reminder_minutes: 30 });
    });

    it('greys out the lead while the reminder is off', async () => {
      render(moodPrefs());
      await click(switchFor('Mood check-in reminder'));
      expect(lead('1 hour before').disabled).toBe(true);
    });

    it('says the mood notifications are silenced while mood reminders are off', () => {
      act(() => root.render(<NotificationPreferencesForm preferences={moodPrefs()} onSave={vi.fn()} track={track} moodRemindersOff />));
      expect(document.body.textContent?.match(/Silenced while Mood check-ins → Remind me/g)).toHaveLength(2);
      expect(lead('1 hour before').disabled).toBe(true);
    });

    it('has no lead choice, and never sends one, when the server has no such preference', async () => {
      const onSave = render(prefs({ types: { ...prefs().types, mood_reminder: true } }));
      expect(document.body.textContent).not.toContain('1 hour before');
      await click(switchFor('Mood check-in reminder'));
      expect(onSave).toHaveBeenCalledWith({ types: { mood_reminder: false } });
    });

    it('has no lead choice when the server lists no mood reminder type', () => {
      render(prefs({ types: { ...prefs().types, mood_missed: true }, mood_reminder_minutes: 60 }));
      expect(document.body.textContent).not.toContain('1 hour before');
    });
  });
});

describe('preferenceChanges', () => {
  it('is empty when nothing changed', () => {
    expect(preferenceChanges(prefs(), prefs())).toEqual({});
  });

  it('includes both quiet-hour ends when only one moved', () => {
    const saved = prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
    expect(preferenceChanges(saved, { ...saved, quiet_hours_end: '06:30' }))
      .toEqual({ quiet_hours_start: '22:00', quiet_hours_end: '06:30' });
  });
});
