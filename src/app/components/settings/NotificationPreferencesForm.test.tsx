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
/** The value row under a switch (or the only one, when no label is given). */
const leadRow = (switchLabel?: string) => (switchLabel
  ? switchFor(switchLabel).parentElement!.parentElement!
  : document.body).querySelector<HTMLButtonElement>('button[aria-expanded]')!;
const chips = (labelledBy: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`[role="radiogroup"][aria-labelledby="${labelledBy}"] [role="radio"]`)];
const chip = (labelledBy: string, label: string) => chips(labelledBy).find(c => c.textContent === label)!;
const checkedChip = (labelledBy: string) => chips(labelledBy).find(c => c.getAttribute('aria-checked') === 'true')?.textContent;

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
    // The task switch and quiet hours.
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(2);
    expect(switchFor('Tasks').getAttribute('aria-checked')).toBe('false');
    expect(switchFor('Quiet hours').getAttribute('aria-checked')).toBe('false');
    expect([...document.querySelectorAll('button')].some(b => /save/i.test(b.textContent ?? ''))).toBe(false);
  });

  it('saves only the switched type, at once', async () => {
    const onSave = render(prefs());
    await click(switchFor('Tasks'));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith({ types: { task_reminder: false } });
    expect(track).toHaveBeenCalledWith('notifications', expect.any(Function));
  });

  it('offers an Undo that switches the alert back and saves that', async () => {
    const onSave = render(prefs());
    await click(switchFor('Tasks'));
    expect(onUndoableChange).toHaveBeenCalledWith('Tasks turned off.', expect.any(Function));
    const undo = onUndoableChange.mock.calls[0][1];
    await act(async () => { undo(); });
    expect(switchFor('Tasks').getAttribute('aria-checked')).toBe('true');
    expect(onSave).toHaveBeenLastCalledWith({ types: { task_reminder: true } });
  });

  it('labels events as set per event', () => {
    render(prefs({ types: { task_reminder: true, event_reminder: true } }));
    expect(switchFor('Events').getAttribute('aria-checked')).toBe('true');
    expect(switchFor('Events').parentElement!.textContent).toContain('Set per event');
  });

  describe('quiet hours', () => {
    it('waits for both quiet-hour ends, then saves them as a pair after a pause', async () => {
      const onSave = render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
      act(() => typeInto(input('quiet-end'), ''));
      expect(document.body.textContent).toContain('Set both a start and an end');
      await pause();
      expect(onSave).not.toHaveBeenCalled();
      act(() => typeInto(input('quiet-end'), '06:30'));
      expect(onSave).not.toHaveBeenCalled();
      await pause();
      expect(onSave).toHaveBeenCalledOnce();
      expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: '22:00', quiet_hours_end: '06:30' });
    });

    it("doesn't save quiet hours that start and end together", async () => {
      const onSave = render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
      act(() => typeInto(input('quiet-start'), '09:00'));
      act(() => typeInto(input('quiet-end'), '09:00'));
      expect(document.body.textContent).toContain("can't start and end at the same time");
      await pause();
      expect(onSave).not.toHaveBeenCalled();
    });

    it('shows the saved window on the row, and the times only while on', () => {
      render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
      expect(switchFor('Quiet hours').getAttribute('aria-checked')).toBe('true');
      expect(switchFor('Quiet hours').parentElement!.textContent).toContain('10:00 PM – 7:00 AM');
      expect(input('quiet-start').value).toBe('22:00');
      act(() => root.unmount());
      root = createRoot(container);
      render(prefs());
      expect(input('quiet-start')).toBeNull();
    });

    it('switches off by clearing both, and back on with the last times', async () => {
      const onSave = render(prefs({ quiet_hours_start: '23:30', quiet_hours_end: '06:00' }));
      await click(switchFor('Quiet hours'));
      expect(onSave).toHaveBeenLastCalledWith({ quiet_hours_start: null, quiet_hours_end: null });
      expect(input('quiet-start')).toBeNull();
      await click(switchFor('Quiet hours'));
      expect(onSave).toHaveBeenLastCalledWith({ quiet_hours_start: '23:30', quiet_hours_end: '06:00' });
      expect(input('quiet-start').value).toBe('23:30');
      expect(input('quiet-end').value).toBe('06:00');
    });

    it('switches on with 10 PM to 7 AM when none were set', async () => {
      const onSave = render(prefs());
      await click(switchFor('Quiet hours'));
      expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
    });

    it('has no Clear button', () => {
      render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
      expect(byText('button', 'Clear')).toBeUndefined();
    });
  });

  describe('task reminder lead', () => {
    it('shows the lead on a value row that opens its chips', async () => {
      render(prefs());
      expect(leadRow('Tasks').textContent).toContain('Remind me');
      expect(leadRow('Tasks').textContent).toContain('2 h before');
      expect(chips('default-reminder-label')).toHaveLength(0);
      await click(leadRow('Tasks'));
      expect(leadRow('Tasks').getAttribute('aria-expanded')).toBe('true');
      expect(chips('default-reminder-label').map(c => c.textContent)).toEqual(['15 min', '30 min', '1 h', '2 h', '1 day', 'Custom']);
      expect(checkedChip('default-reminder-label')).toBe('2 h');
    });

    it('hides the lead while Tasks is off, keeping its value', async () => {
      const onSave = render(prefs({ default_reminder_minutes: 30 }));
      await click(switchFor('Tasks'));
      expect(document.querySelector('button[aria-expanded]')).toBeNull();
      expect(onSave).toHaveBeenLastCalledWith({ types: { task_reminder: false } });
      await click(switchFor('Tasks'));
      expect(leadRow('Tasks').textContent).toContain('30 min before');
    });

    it('saves a new default reminder from the presets', async () => {
      const onSave = render(prefs());
      await click(leadRow('Tasks'));
      await click(chip('default-reminder-label', '1 day'));
      await pause();
      expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 1440 });
      expect(leadRow('Tasks').textContent).toContain('1 day before');
    });

    it('saves a custom default reminder and holds back an out-of-range one', async () => {
      const onSave = render(prefs());
      await click(leadRow('Tasks'));
      await click(chip('default-reminder-label', 'Custom'));
      const amount = document.querySelector<HTMLInputElement>('input[aria-label="Custom reminder amount"]')!;
      const unit = document.querySelector<HTMLSelectElement>('select[aria-label="Custom reminder unit"]')!;
      act(() => typeInto(unit, 'days'));
      act(() => typeInto(amount, '8'));
      expect(document.body.textContent).toContain('from 1 minute up to 7 days');
      expect(amount.checkValidity()).toBe(false);
      await pause();
      expect(onSave).not.toHaveBeenCalledWith({ default_reminder_minutes: 8 * 24 * 60 });
      act(() => typeInto(unit, 'minutes'));
      act(() => typeInto(amount, '45'));
      await pause();
      expect(onSave).toHaveBeenLastCalledWith({ default_reminder_minutes: 45 });
    });

    it('saves a value still waiting for its pause when the page closes', async () => {
      const onSave = render(prefs());
      await click(leadRow('Tasks'));
      await click(chip('default-reminder-label', '1 day'));
      expect(onSave).not.toHaveBeenCalled();
      await act(async () => root.unmount());
      expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 1440 });
      root = createRoot(container);
    });

    it('keeps the lead when the server lists no reminder switch', async () => {
      render(prefs({ types: {} }));
      expect(leadRow().textContent).toContain('2 h before');
      await click(leadRow());
      expect(chips('default-reminder-label').length).toBeGreaterThan(0);
      expect(document.body.textContent).not.toContain('Mood check-ins');
    });
  });

  it('keeps the change on screen and reports the failure when saving fails', async () => {
    const onSave = render(prefs(), vi.fn().mockRejectedValue(new Error('offline')));
    await click(switchFor('Tasks'));
    expect(onSave).toHaveBeenCalledOnce();
    await expect(track.mock.results[0].value).resolves.toBe(false);
    expect(switchFor('Tasks').getAttribute('aria-checked')).toBe('false');
  });

  it('offers no Final warning switch and never saves it, even when the server still lists it', async () => {
    const onSave = render(prefs({ types: { task_reminder: true, final_warning: false } }));
    expect(document.body.textContent).not.toMatch(/final warning/i);
    await click(switchFor('Tasks'));
    expect(onSave).toHaveBeenCalledWith({ types: { task_reminder: false } });
  });

  it('has no Other alerts: types outside the groups get no switch', () => {
    render(prefs({ types: { ...prefs().types, due_today: true, overdue: true, habit_reminder: true, mood_check_in: true } }));
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/Other alerts|Morning summary|Slipped task nudge|Evening habit reminder|Mood check in/);
  });

  it('has no hint text under the switches', () => {
    render(prefs({ types: { task_reminder: true, event_reminder: true, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60 }));
    expect(document.body.textContent).not.toMatch(/At each task|Log your mood each day|When days go by|Counts back from/);
  });

  describe('groups', () => {
    const allPrefs = () =>
      prefs({ types: { ...prefs().types, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60 });
    const groupOf = (el: Element) => el.closest('section')!.getAttribute('aria-labelledby');

    it('orders the page as Reminders, Mood check-ins, Quiet hours', () => {
      render(allPrefs());
      expect([...document.querySelectorAll('h3')].map(h => h.textContent))
        .toEqual(['Reminders', 'Mood check-ins · private to you', 'Quiet hours']);
      expect(groupOf(switchFor('Tasks'))).toBe('notif-group-reminders');
      expect(groupOf(switchFor('Daily check-in'))).toBe('notif-group-mood');
      expect(groupOf(switchFor('Missed days'))).toBe('notif-group-mood');
      expect(groupOf(switchFor('Quiet hours'))).toBe('notif-group-quiet');
    });

    it('puts each lead right under its switch', () => {
      render(allPrefs());
      expect(switchFor('Tasks').parentElement!.nextElementSibling).toBe(leadRow('Tasks').parentElement);
      expect(switchFor('Daily check-in').parentElement!.nextElementSibling).toBe(leadRow('Daily check-in').parentElement);
    });

    it('shows the weekly and monthly rows it is given after the mood alerts', () => {
      act(() => root.render(
        <NotificationPreferencesForm preferences={allPrefs()} onSave={vi.fn()} track={track} moodCheckins={<p>Mood settings</p>} />,
      ));
      const group = byText('p', 'Mood settings').closest('section')!;
      expect(group.getAttribute('aria-labelledby')).toBe('notif-group-mood');
      expect(switchFor('Missed days').compareDocumentPosition(byText('p', 'Mood settings')))
        .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });
  });

  describe('mood reminders', () => {
    const moodPrefs = (overrides: Partial<NotificationPreferences> = {}) =>
      prefs({ types: { ...prefs().types, mood_reminder: true, mood_missed: true }, mood_reminder_minutes: 60, ...overrides });
    const renderMood = (preferences: NotificationPreferences, workDay = { start: '08:00', end: '18:00' }) => {
      const onSave = server(preferences);
      act(() => root.render(
        <NotificationPreferencesForm preferences={preferences} onSave={onSave} track={track} onUndoableChange={onUndoableChange} workDay={workDay} />,
      ));
      return onSave;
    };
    const lead = 'mood-reminder-lead-label';
    const openLead = () => click(leadRow('Daily check-in'));
    const customAmount = () => document.querySelector<HTMLInputElement>('input[aria-label="Custom reminder amount"]')!;
    const customUnit = () => document.querySelector<HTMLSelectElement>('select[aria-label="Custom reminder unit"]')!;

    it('labels both mood switches and shows the saved lead with its send time', async () => {
      renderMood(moodPrefs());
      expect(switchFor('Daily check-in').getAttribute('aria-checked')).toBe('true');
      expect(switchFor('Missed days').getAttribute('aria-checked')).toBe('true');
      expect(leadRow('Daily check-in').textContent).toContain('1 h before · 5:00 PM');
      await openLead();
      expect(checkedChip(lead)).toBe('1 h');
      expect(document.body.textContent).toContain('Before “Call it a day” (6:00 PM).');
    });

    it('sends at the start of the day when the lead is longer than the work day', () => {
      renderMood(moodPrefs({ mood_reminder_minutes: 600 }), { start: '09:00', end: '17:00' });
      expect(leadRow('Daily check-in').textContent).toContain('10 h before · 9:00 AM');
    });

    it('counts back across midnight for a day that ends past it', () => {
      renderMood(moodPrefs({ mood_reminder_minutes: 120 }), { start: '10:00', end: '01:00' });
      expect(leadRow('Daily check-in').textContent).toContain('2 h before · 11:00 PM');
    });

    it('offers Undo with the new label', async () => {
      renderMood(moodPrefs());
      await click(switchFor('Daily check-in'));
      expect(onUndoableChange).toHaveBeenCalledWith('Daily check-in turned off.', expect.any(Function));
    });

    it('saves a preset lead on its own, after a pause', async () => {
      const onSave = renderMood(moodPrefs());
      await openLead();
      await click(chip(lead, '30 min'));
      await pause();
      expect(onSave).toHaveBeenCalledWith({ mood_reminder_minutes: 30 });
    });

    it('offers its own same-day presets', async () => {
      renderMood(moodPrefs());
      await openLead();
      expect(chips(lead).map(c => c.textContent)).toEqual(['15 min', '30 min', '1 h', '2 h', 'Custom']);
    });

    it('saves a custom lead and holds back one of a day or more', async () => {
      const onSave = renderMood(moodPrefs());
      await openLead();
      await click(chip(lead, 'Custom'));
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

    it('shows a saved custom lead as custom', async () => {
      renderMood(moodPrefs({ mood_reminder_minutes: 90 }));
      expect(leadRow('Daily check-in').textContent).toContain('1 h 30 min before');
      await openLead();
      expect(checkedChip(lead)).toBe('Custom');
      expect(customAmount().value).toBe('90');
      expect(customUnit().value).toBe('minutes');
    });

    it("doesn't mention a final warning for a short lead", () => {
      renderMood(moodPrefs({ mood_reminder_minutes: 15, default_reminder_minutes: 15 }));
      expect(document.body.textContent).not.toMatch(/final warning/i);
    });

    it('hides the lead while the daily check-in is off', async () => {
      renderMood(moodPrefs());
      await click(switchFor('Daily check-in'));
      expect(switchFor('Daily check-in').parentElement!.parentElement!.querySelector('button[aria-expanded]')).toBeNull();
      expect(document.body.textContent).not.toContain('1 h before');
    });

    it('greys out Missed days while the daily check-in is off, keeping its saved value', async () => {
      const onSave = renderMood(moodPrefs());
      expect(document.body.textContent).not.toContain('Needs Daily check-in');
      await click(switchFor('Daily check-in'));
      const missed = switchFor('Missed days');
      expect(missed.disabled).toBe(true);
      expect(missed.getAttribute('aria-checked')).toBe('true');
      expect(document.body.textContent).toContain('Needs Daily check-in');
      await click(missed);
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith({ types: { mood_reminder: false } });
      await click(switchFor('Daily check-in'));
      expect(switchFor('Missed days').disabled).toBe(false);
    });

    it('has no lead choice, and never sends one, when the server has no such preference', async () => {
      const onSave = render(prefs({ types: { ...prefs().types, mood_reminder: true } }));
      expect(switchFor('Daily check-in').parentElement!.parentElement!.querySelector('button[aria-expanded]')).toBeNull();
      await click(switchFor('Daily check-in'));
      expect(onSave).toHaveBeenCalledWith({ types: { mood_reminder: false } });
    });

    it('has no lead choice when the server lists no mood reminder type', () => {
      render(prefs({ types: { ...prefs().types, mood_missed: true }, mood_reminder_minutes: 60 }));
      expect(document.body.textContent).not.toContain('1 h before');
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
