// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MoodCheckin } from '@/app/types/mood';

const api = vi.hoisted(() => ({
  saveMoodCheckin: vi.fn(),
  deleteMoodCheckin: vi.fn(),
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

  it('picks a mood from the 1–5 keys, but not while typing', async () => {
    await render();
    const note = document.body.querySelector('textarea')!;
    await act(async () => { note.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true })); });
    expect(saveButton().disabled).toBe(true);

    await act(async () => { saveButton().dispatchEvent(new KeyboardEvent('keydown', { key: '5', bubbles: true })); });
    expect(button('Great').getAttribute('aria-checked')).toBe('true');
    expect(saveButton().disabled).toBe(false);
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
