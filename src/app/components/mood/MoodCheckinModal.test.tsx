// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  saveMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
  renameMoodTag: vi.fn(),
  deleteMoodTag: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import MoodCheckinModal from './MoodCheckinModal';
import { onMoodMoment, type MoodMomentChange } from '@/app/utils/moodCheckinSync';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const day = new Date(2026, 9, 20);
const saved: MoodCheckin = {
  id: 7, period_kind: 'day', period_start: '2026-10-20', mood: 4, energy: null, stress: 2,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: ['Focused'],
  created_at: '2026-10-21T01:00:00Z', updated_at: '2026-10-21T01:00:00Z',
};

beforeEach(() => {
  api.saveMoodCheckin.mockResolvedValue(saved);
  api.fetchMoodTags.mockResolvedValue({ defaults: ['Slept well', 'Focused'], custom: ['Gym'] });
  api.renameMoodTag.mockResolvedValue({ renamed: 3 });
  api.deleteMoodTag.mockResolvedValue({ deleted: 2 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const render = async (props: Partial<React.ComponentProps<typeof MoodCheckinModal>> = {}) => {
  const onSaved = vi.fn();
  await act(async () => {
    root.render(<MoodCheckinModal date={day} existing={null} onClose={() => {}} onSaved={onSaved} {...props} />);
  });
  return { onSaved };
};

const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
const saveButton = () => button('Save check-in');
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };

describe('MoodCheckinModal', () => {
  it('keeps Save disabled until a mood is picked', async () => {
    await render();
    expect(saveButton().disabled).toBe(true);

    // Optional fields alone don't unlock it.
    await click(button('Steady'));
    await click(button('Focused'));
    expect(saveButton().disabled).toBe(true);
    await click(saveButton());
    expect(api.saveMoodCheckin).not.toHaveBeenCalled();

    await click(button('Good'));
    expect(button('Good').getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(false);
  });

  it('picks a mood from the 1–5 keys as soon as it opens, but not while typing', async () => {
    await render();
    const press = (key: string) => act(async () => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });

    await press('5');
    expect(button('Great').getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(false);

    document.body.querySelector('textarea')!.focus();
    await press('2');
    expect(button('Great').getAttribute('aria-checked')).toBe('true');
    expect(button('Low').getAttribute('aria-checked')).toBe('false');
  });

  it('saves a day check-in with only the fields the user filled', async () => {
    const { onSaved } = await render();
    await click(button('Good'));
    await click(button('Mild'));
    await click(button('Gym'));
    await click(saveButton());

    expect(api.saveMoodCheckin).toHaveBeenCalledWith({
      period_kind: 'day',
      period_start: '2026-10-20',
      mood: 4,
      energy: null,
      stress: 2,
      tags: ['Gym'],
      note: null,
    });
    expect(onSaved).toHaveBeenCalledWith(saved, null);
  });

  it('suggests moments from /get-mood-tags, not task tags', async () => {
    await render();
    expect(api.fetchMoodTags).toHaveBeenCalled();
    expect(button('Gym')).toBeDefined();
  });

  it('calls the check-in chips Moments, never tags', async () => {
    await render();
    expect(document.body.textContent).toContain('What was part of today?optionalPick your moments');
    expect(document.body.querySelector('[role="group"][aria-label="Moments"]')!.textContent).toContain('Gym');
    await click(button('Moment'));
    const input = document.body.querySelector<HTMLInputElement>('input[aria-label="New moment"]')!;
    expect(input.placeholder).toBe('New moment');
    expect(document.body.textContent).not.toMatch(/\btags?\b/i);
  });

  it('shows the error and stays open when saving fails', async () => {
    api.saveMoodCheckin.mockRejectedValueOnce(new Error('offline'));
    const { onSaved } = await render();
    await click(button('Okay'));
    await click(saveButton());
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("Couldn't save your check-in. Please try again.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(saveButton().disabled).toBe(false);
  });
});

describe('MoodCheckinModal for a week or month', () => {
  const inGroup = (group: string, name: string) =>
    [...document.body.querySelector(`[role="radiogroup"][aria-label="${group}"]`)!.querySelectorAll('button')]
      .find(b => b.textContent?.trim() === name || b.getAttribute('aria-label') === name)!;
  const type = async (el: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it('saves a week check-in on its Monday, whichever day it was opened from', async () => {
    await render({ kind: 'week', date: new Date(2026, 9, 25) }); // Sunday
    expect(document.body.textContent).toContain('Weekly check-in');
    expect(document.body.textContent).toContain('Week of Oct 19–25');

    await click(inGroup('How was your week overall?', 'Good'));
    await click(inGroup('Workload felt', 'Too much'));
    await type(document.body.querySelector<HTMLInputElement>('#mood-checkin-highlight')!, '  Shipped the portfolio  ');
    await click(button('Focused'));
    await click(saveButton());

    expect(api.saveMoodCheckin).toHaveBeenCalledWith({
      period_kind: 'week',
      period_start: '2026-10-19',
      mood: 4,
      workload: 2,
      highlight: 'Shipped the portfolio',
      tags: ['Focused'],
      note: null,
    });
  });

  it('saves a month check-in on the 1st, with no day or week fields', async () => {
    await render({ kind: 'month', date: new Date(2026, 9, 31) });
    expect(document.body.textContent).toContain('October 2026');
    expect(api.fetchMoodTags).not.toHaveBeenCalled();
    expect(document.body.querySelector('[aria-label="Energy"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="Workload felt"]')).toBeNull();

    await click(inGroup('How was October?', 'Okay'));
    await click(inGroup('Progress on what matters to you', 'A lot'));
    await type(document.body.querySelector<HTMLInputElement>('#mood-checkin-word')!, 'Momentum');
    await click(saveButton());

    expect(api.saveMoodCheckin).toHaveBeenCalledWith({
      period_kind: 'month',
      period_start: '2026-10-01',
      mood: 3,
      progress: 5,
      word: 'Momentum',
      note: null,
      tags: [],
    });
  });

  it('suggests a mood from the days but never picks it', async () => {
    await render({ kind: 'week', date: new Date(2026, 9, 25), periodSummary: { average: 3.7, logged: 6, days: 7, tasksDone: 23 } });
    expect(document.body.textContent).toContain('Your days averaged Good (3.7)');
    expect(document.body.textContent).toContain('6 of 7 days logged');
    expect(saveButton().disabled).toBe(true);
    expect(inGroup('How was your week overall?', 'Good').getAttribute('aria-checked')).toBe('false');

    const suggestion = [...document.body.querySelectorAll('p button')].find(b => b.textContent === 'Good')!;
    await click(suggestion);
    expect(inGroup('How was your week overall?', 'Good').getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(false);
  });

  it('keeps the fields its form leaves out when editing', async () => {
    const existing: MoodCheckin = { ...saved, period_kind: 'week', period_start: '2026-10-19', stress: null, workload: 1, highlight: 'Hike', note: 'kept', tags: ['Outdoors'] };
    await render({ kind: 'week', date: new Date(2026, 9, 19), existing });
    await click(button('Save changes'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ period_start: '2026-10-19', workload: 1, highlight: 'Hike', note: 'kept', tags: ['Outdoors'] }));
  });
});

describe('MoodCheckinModal moments: edit and delete', () => {
  const moments = () =>
    [...document.body.querySelectorAll('[role="group"][aria-label="Moments"] button[aria-pressed]')].map(b => b.textContent?.trim());
  const momentInput = (name: string) => document.body.querySelector<HTMLInputElement>(`input[aria-label="Rename moment ${name}"]`)!;
  const type = async (el: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const key = async (el: Element, k: string) => {
    await act(async () => { el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true })); });
  };
  let changes: MoodMomentChange[];
  let unsubscribe: () => void;
  beforeEach(() => { changes = []; unsubscribe = onMoodMoment(c => changes.push(c)); });
  afterEach(() => unsubscribe());

  it('gives every moment an Edit and a Delete, shown on hover or focus', async () => {
    await render();
    for (const name of ['Slept well', 'Focused', 'Gym']) {
      expect(button(`Edit moment ${name}`).className).toContain('mood-moment-action');
      expect(button(`Delete moment ${name}`).closest('.mood-moment')).not.toBeNull();
    }
  });

  it('shows every moment\'s Edit and Delete behind Edit moments, for touch screens', async () => {
    await render();
    const group = document.body.querySelector('[role="group"][aria-label="Moments"]')!;
    expect(group.classList.contains('is-managing')).toBe(false);
    await click(button('Edit moments'));
    expect(group.classList.contains('is-managing')).toBe(true);
    await click(button('Done'));
    expect(group.classList.contains('is-managing')).toBe(false);
  });

  it('renames a moment everywhere, in place, and keeps it picked', async () => {
    const existing: MoodCheckin = { ...saved, tags: ['Gym', 'Focused'] };
    const { onSaved } = await render({ existing });
    await click(button('Edit moment Gym'));
    const input = momentInput('Gym');
    expect(input.value).toBe('Gym');
    await type(input, '  Lifting  ');
    await click(button('Save moment'));

    expect(api.renameMoodTag).toHaveBeenCalledWith('Gym', 'Lifting');
    expect(moments()).toEqual(['Slept well', 'Focused', 'Lifting']);
    expect(button('Lifting').getAttribute('aria-pressed')).toBe('true');
    expect(changes).toEqual([{ from: 'Gym', to: 'Lifting' }]);

    await click(button('Save changes'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Lifting', 'Focused'] }));
    // Undo restores the check-in as it now stands on the server, not the old moment name.
    expect(onSaved).toHaveBeenCalledWith(saved, { ...existing, tags: ['Lifting', 'Focused'] });
  });

  it('merges a moment renamed to one that already exists', async () => {
    await render({ existing: { ...saved, tags: ['Gym', 'Focused'] } });
    await click(button('Edit moment Gym'));
    await type(momentInput('Gym'), 'focused');
    await key(momentInput('Gym'), 'Enter');
    expect(api.renameMoodTag).toHaveBeenCalledWith('Gym', 'focused');
    expect(moments()).toEqual(['Slept well', 'Focused']);
  });

  it('cancels a rename with Cancel or Escape without calling the API or closing the form', async () => {
    const onClose = vi.fn();
    await render({ onClose });
    await click(button('Edit moment Gym'));
    await type(momentInput('Gym'), 'Lifting');
    await click(button('Cancel renaming'));
    expect(moments()).toContain('Gym');

    await click(button('Edit moment Gym'));
    await key(momentInput('Gym'), 'Escape');
    expect(momentInput('Gym')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(api.renameMoodTag).not.toHaveBeenCalled();
  });

  it('keeps the rename open with an error when it fails', async () => {
    api.renameMoodTag.mockRejectedValueOnce(new Error('offline'));
    await render();
    await click(button('Edit moment Gym'));
    await type(momentInput('Gym'), 'Lifting');
    await click(button('Save moment'));
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("Couldn't rename that moment. Please try again.");
    expect(momentInput('Gym').value).toBe('Lifting');
    expect(moments()).toEqual(['Slept well', 'Focused']);
  });

  it('deletes a moment from every check-in after a confirm', async () => {
    const existing: MoodCheckin = { ...saved, tags: ['Gym', 'Focused'] };
    await render({ existing });
    await click(button('Delete moment Focused'));
    expect(api.deleteMoodTag).not.toHaveBeenCalled();
    expect(document.body.querySelector('[role="alertdialog"]')!.textContent).toContain('It comes off all your past check-ins');

    await click(button('Delete moment'));
    expect(api.deleteMoodTag).toHaveBeenCalledWith('Focused');
    expect(moments()).toEqual(['Slept well', 'Gym']);
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    expect(changes).toEqual([{ from: 'Focused', to: null }]);

    await click(button('Save changes'));
    expect(api.saveMoodCheckin).toHaveBeenCalledWith(expect.objectContaining({ tags: ['Gym'] }));
  });

  it('keeps the moment when the delete is cancelled or fails', async () => {
    await render();
    await click(button('Delete moment Gym'));
    await click(button('Keep it'));
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();

    api.deleteMoodTag.mockRejectedValueOnce(new Error('offline'));
    await click(button('Delete moment Gym'));
    await click(button('Delete moment'));
    expect(document.body.querySelector('[role="alert"]')?.textContent).toBe("Couldn't delete that moment. Please try again.");
    expect(moments()).toContain('Gym');
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
