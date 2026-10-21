// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationPreferences } from '@/app/types/notification';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@/app/lib/backend-api', () => ({
  describeError: (_err: unknown, fallback: string) => fallback,
}));

import NotificationPreferencesForm, { preferenceChanges } from './NotificationPreferencesForm';

let container: HTMLDivElement;
let root: Root;

const prefs = (overrides: Partial<NotificationPreferences> = {}): NotificationPreferences => ({
  types: { due_today: true, task_reminder: true, final_warning: true, overdue: true, habit_reminder: true },
  quiet_hours_start: null,
  quiet_hours_end: null,
  default_reminder_minutes: 120,
  ...overrides,
});

const render = (preferences: NotificationPreferences, onSave = vi.fn().mockImplementation(async () => preferences)) => {
  act(() => root.render(<NotificationPreferencesForm preferences={preferences} onSave={onSave} />));
  return onSave;
};

const byText = <T extends HTMLElement>(selector: string, text: string) =>
  [...document.querySelectorAll<T>(selector)].find(el => el.textContent?.trim() === text)!;
const switchFor = (label: string) => {
  const id = byText('p', label).id;
  return document.querySelector<HTMLButtonElement>(`[role="switch"][aria-labelledby="${id}"]`)!;
};
const saveButton = () => byText<HTMLButtonElement>('button', 'Save notifications');
const input = (id: string) => document.getElementById(id) as HTMLInputElement;
const select = (labelledBy: string) => document.querySelector<HTMLSelectElement>(`select[aria-labelledby="${labelledBy}"]`)!;

/** Sets a controlled input's value the way React notices. */
const typeInto = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
};

const submit = async () => {
  await act(async () => { saveButton().click(); });
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
});

describe('NotificationPreferencesForm', () => {
  it('shows a switch per alert type, reflecting the saved state', () => {
    render(prefs({ types: { ...prefs().types, overdue: false } }));
    expect(document.querySelectorAll('[role="switch"]')).toHaveLength(5);
    expect(switchFor('Morning summary').getAttribute('aria-checked')).toBe('true');
    expect(switchFor('Overdue nudge').getAttribute('aria-checked')).toBe('false');
  });

  it('keeps Save disabled until something changes', () => {
    render(prefs());
    expect(saveButton().disabled).toBe(true);
    act(() => switchFor('Evening habit reminder').click());
    expect(saveButton().disabled).toBe(false);
    act(() => switchFor('Evening habit reminder').click());
    expect(saveButton().disabled).toBe(true);
  });

  it('saves only the switched type', async () => {
    const onSave = render(prefs());
    act(() => switchFor('Final warning').click());
    await submit();
    expect(onSave).toHaveBeenCalledWith({ types: { final_warning: false } });
    expect(document.body.textContent).toContain('Saved.');
  });

  it('sends quiet hours as a pair, including ones that cross midnight', async () => {
    const onSave = render(prefs());
    act(() => typeInto(input('quiet-start'), '22:00'));
    expect(document.body.textContent).toContain('Set both a start and an end');
    expect(saveButton().disabled).toBe(true);
    act(() => typeInto(input('quiet-end'), '07:00'));
    await submit();
    expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' });
  });

  it('clears quiet hours by sending both as null', async () => {
    const onSave = render(prefs({ quiet_hours_start: '22:00', quiet_hours_end: '07:00' }));
    act(() => byText<HTMLButtonElement>('button', 'Clear').click());
    expect(input('quiet-start').value).toBe('');
    await submit();
    expect(onSave).toHaveBeenCalledWith({ quiet_hours_start: null, quiet_hours_end: null });
  });

  it('rejects quiet hours that start and end together', () => {
    render(prefs());
    act(() => typeInto(input('quiet-start'), '09:00'));
    act(() => typeInto(input('quiet-end'), '09:00'));
    expect(document.body.textContent).toContain("can't start and end at the same time");
    expect(saveButton().disabled).toBe(true);
  });

  it('saves a new default reminder from the presets', async () => {
    const onSave = render(prefs());
    act(() => typeInto(select('default-reminder-label'), '1440'));
    await submit();
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
    await submit();
    expect(onSave).not.toHaveBeenCalled();
    act(() => typeInto(unit, 'minutes'));
    act(() => typeInto(amount, '45'));
    await submit();
    expect(onSave).toHaveBeenCalledWith({ default_reminder_minutes: 45 });
  });

  it('shows an error and keeps the draft when saving fails', async () => {
    const onSave = render(prefs(), vi.fn().mockRejectedValue(new Error('offline')));
    act(() => switchFor('Morning summary').click());
    await submit();
    expect(onSave).toHaveBeenCalledOnce();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Couldn't save your notification settings");
    expect(switchFor('Morning summary').getAttribute('aria-checked')).toBe('false');
    expect(saveButton().disabled).toBe(false);
  });

  it('lists a type this build has no label for', () => {
    render(prefs({ types: { ...prefs().types, mood_check_in: true } }));
    expect(switchFor('Mood check in')).toBeTruthy();
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
