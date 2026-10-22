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
  types: { task_reminder: true },
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
    render(prefs({ types: { ...prefs().types, task_reminder: false } }));
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(switchFor('Reminder before a task is due').getAttribute('aria-checked')).toBe('false');
    expect([...document.querySelectorAll('button')].some(b => /save/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('saves only the switched type, at once', async () => {
    const onSave = render(prefs());
    await click(switchFor('Reminder before a task is due'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ types: { task_reminder: false } });
    expect(track).toHaveBeenCalledWith('notifications', expect.any(Function));
  });

  it('offers an Undo that switches the alert back and saves that', async () => {
    const onSave = render(prefs());
    await click(switchFor('Reminder before a task is due'));
    expect(onUndoableChange).toHaveBeenCalledWith('Reminder before a task is due turned off.', expect.any(Function));
    const undo = onUndoableChange.mock.calls[0][1];
    await act(async () => { undo(); });
    expect(switchFor('Reminder before a task is due').getAttribute('aria-checked')).toBe('true');
    expect(onSave).toHaveBeenLastCalledWith({ types: { task_reminder: true } });
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
    await click(switchFor('Reminder before a task is due'));
    expect(onSave).toHaveBeenCalledOnce();
    await expect(track.mock.results[0].value).resolves.toBe(false);
    expect(switchFor('Reminder before a task is due').getAttribute('aria-checked')).toBe('false');
  });

  it('saves a value still waiting for its pause when the page closes', async () => {
    const onSave = render(prefs());
    act(() => typeInto(select('default-reminder-label'), '1440'));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 1440 });
    root = createRoot(container);
  });

  it('offers no Final warning switch and never saves it, even when the server still lists it', async () => {
    const onSave = render(prefs({ types: { task_reminder: true, final_warning: false } }));
    expect(document.body.textContent).not.toMatch(/final warning/i);
    await click(switchFor('Reminder before a task is due'));
    expect(onSave).toHaveBeenCalledWith({ types: { task_reminder: false } });
  });

  it('has no Other alerts: types outside the groups get no switch', () => {
    render(prefs({ types: { ...prefs().types, due_today: true, overdue: true, habit_reminder: true, mood_check_in: true } }));
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/Other alerts|Morning summary|Slipped task nudge|Evening habit reminder|Mood check in/);
  });

  describe('groups', () => {
    const allPrefs = () =>
      prefs({ types: { ...prefs().types, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60 });
    const groupOf = (el: Element) => el.closest('section')!.querySelector('h3')!.textContent;

    it('orders the page as Reminders, Mood check-ins, Quiet hours', () => {
      render(allPrefs());
      expect([...document.querySelectorAll('h3')].map(h => h.textContent))
        .toEqual(['Reminders', 'Mood check-ins', 'Quiet hours']);
      expect(groupOf(switchFor('Reminder before a task is due'))).toBe('Reminders');
      expect(groupOf(switchFor('Mood check-in reminder'))).toBe('Mood check-ins');
      expect(groupOf(switchFor('Missed mood check-ins'))).toBe('Mood check-ins');
      expect(groupOf(input('quiet-start'))).toBe('Quiet hours');
    });

    it('puts the default reminder time right under the task reminder switch, explaining how it differs from the mood lead', () => {
      render(allPrefs());
      const taskRow = switchFor('Reminder before a task is due').parentElement!;
      expect(taskRow.nextElementSibling!.contains(select('default-reminder-label'))).toBe(true);
      expect(document.body.textContent).toContain("How long before a task’s due time its reminder arrives.");
      const moodRow = switchFor('Mood check-in reminder').parentElement!;
      expect(moodRow.nextElementSibling!.contains(select('mood-reminder-lead-label'))).toBe(true);
      expect(moodRow.nextElementSibling!.textContent).toContain('not from a task’s due time');
      expect(moodRow.nextElementSibling!.textContent).toContain('longer than your working day sends it at the start of the day');
    });

    it('shows the mood check-in settings it is given at the top of the Mood check-ins group', () => {
      act(() => root.render(
        <NotificationPreferencesForm preferences={allPrefs()} onSave={vi.fn()} track={track} moodCheckins={<p>Mood settings</p>} />,
      ));
      const group = byText('p', 'Mood settings').closest('section')!;
      expect(group.getAttribute('aria-labelledby')).toBe('notif-group-mood');
      expect(group.querySelector('h3')!.textContent).toBe('Mood check-ins');
      expect(byText('p', 'Mood settings').compareDocumentPosition(switchFor('Mood check-in reminder')))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('keeps the default reminder time when the server lists no reminder switch', () => {
      render(prefs({ types: {} }));
      expect(select('default-reminder-label')).toBeTruthy();
      expect(document.body.textContent).not.toContain('Mood check-ins');
    });
  });

  describe('mood reminders', () => {
    const moodPrefs = (overrides: Partial<NotificationPreferences> = {}) =>
      prefs({ types: { ...prefs().types, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60, ...overrides });
    const lead = () => select('mood-reminder-lead-label');
    const customAmount = () => document.querySelector<HTMLInputElement>('input[aria-label="Custom reminder amount"]')!;
    const customUnit = () => document.querySelector<HTMLSelectElement>('select[aria-label="Custom reminder unit"]')!;

    it('labels both mood switches and picks the saved lead', () => {
      render(moodPrefs());
      expect(switchFor('Mood check-in reminder').getAttribute('aria-checked')).toBe('true');
      expect(switchFor('Missed mood check-ins').getAttribute('aria-checked')).toBe('true');
      expect(lead().value).toBe('60');
    });

    it('saves a preset lead on its own, after a pause', async () => {
      const onSave = render(moodPrefs());
      act(() => typeInto(lead(), '30'));
      await pause();
      expect(onSave).toHaveBeenCalledWith({ mood_reminder_minutes: 30 });
    });

    it('offers its own same-day presets', () => {
      render(moodPrefs());
      expect([...lead().options].map(o => o.value)).toEqual(['15', '30', '60', '120', 'custom']);
    });

    it('saves a custom lead and holds back one of a day or more', async () => {
      const onSave = render(moodPrefs());
      act(() => typeInto(lead(), 'custom'));
      expect([...customUnit().options].map(o => o.value)).toEqual(['minutes', 'hours']);
      act(() => typeInto(customUnit(), 'hours'));
      act(() => typeInto(customAmount(), '24'));
      expect(document.body.textContent).toContain('from 1 minute up to 23 h 59 min');
      expect(customAmount().checkValidity()).toBe(false);
      await pause();
      expect(onSave).not.toHaveBeenCalledWith({ mood_reminder_minutes: 24 * 60 });
      act(() => typeInto(customUnit(), 'minutes'));
      act(() => typeInto(customAmount(), '1439'));
      await pause();
      expect(onSave).toHaveBeenLastCalledWith({ mood_reminder_minutes: 1439 });
      act(() => typeInto(customUnit(), 'minutes'));
      act(() => typeInto(customAmount(), '45'));
      await pause();
      expect(onSave).toHaveBeenLastCalledWith({ mood_reminder_minutes: 45 });
    });

    it('shows a saved custom lead as custom', () => {
      render(moodPrefs({ mood_reminder_minutes: 90 }));
      expect(lead().value).toBe('custom');
      expect(customAmount().value).toBe('90');
      expect(customUnit().value).toBe('minutes');
    });

    it("doesn't mention a final warning for a short lead", () => {
      render(moodPrefs({ mood_reminder_minutes: 15, default_reminder_minutes: 15 }));
      expect(document.body.textContent).not.toMatch(/final warning/i);
    });

    it('greys out the lead while the reminder is off', async () => {
      render(moodPrefs());
      await click(switchFor('Mood check-in reminder'));
      expect(lead().disabled).toBe(true);
    });

    it('greys out Missed mood check-ins while the reminder is off, keeping its saved value', async () => {
      const onSave = render(moodPrefs());
      await click(switchFor('Mood check-in reminder'));
      const missed = switchFor('Missed mood check-ins');
      expect(missed.disabled).toBe(true);
      expect(missed.getAttribute('aria-checked')).toBe('true');
      expect(document.body.textContent).toContain('Follows the Mood check-in reminder');
      await click(missed);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({ types: { mood_reminder: false } });
      await click(switchFor('Mood check-in reminder'));
      expect(switchFor('Missed mood check-ins').disabled).toBe(false);
    });

    it('has no lead choice, and never sends one, when the server has no such preference', async () => {
      const onSave = render(prefs({ types: { ...prefs().types, mood_reminder: true } }));
      expect(document.getElementById('mood-reminder-lead-label')).toBeNull();
      await click(switchFor('Mood check-in reminder'));
      expect(onSave).toHaveBeenCalledWith({ types: { mood_reminder: false } });
    });

    it('has no lead choice when the server lists no mood reminder type', () => {
      render(prefs({ types: { ...prefs().types, mood_missed: true }, mood_reminder_minutes: 60 }));
      expect(document.getElementById('mood-reminder-lead-label')).toBeNull();
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
