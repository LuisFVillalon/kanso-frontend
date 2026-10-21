// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  saveMoodCheckin: vi.fn(),
  fetchMoodTags: vi.fn(),
}));
vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));

import MoodCheckinModal from './MoodCheckinModal';

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

  it('opens with the face tapped on the nudge already picked', async () => {
    await render({ initialMood: 2 });
    expect(button('Low').getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(false);
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

  it('suggests mood tags from /get-mood-tags, not task tags', async () => {
    await render();
    expect(api.fetchMoodTags).toHaveBeenCalled();
    expect(button('Gym')).toBeDefined();
  });

  it('shows the error and stays open when saving fails', async () => {
    api.saveMoodCheckin.mockRejectedValueOnce(new Error('offline'));
    const { onSaved } = await render({ initialMood: 3 });
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
