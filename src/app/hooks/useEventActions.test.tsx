// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventOccurrence } from '@/app/types/event';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const api = vi.hoisted(() => ({
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  fetchEvent: vi.fn(),
  restoreEvent: vi.fn(),
  setEventArchived: vi.fn(),
  updateEvent: vi.fn(),
  updateGoogleEventTags: vi.fn(),
}));
const showToast = vi.hoisted(() => vi.fn());

vi.mock('@/app/lib/backend-api', () => ({ ...api, describeError: (_: unknown, fallback: string) => fallback }));
vi.mock('@/app/context/ToastContext', () => ({ useToast: () => showToast }));

import { useEventActions } from './useEventActions';
import { useEventsVersion } from './useEventsVersion';

const occurrence = {
  event_id: 7, occurrence_date: '2026-10-23', title: 'CS 460 Lecture', date: '2026-10-23',
} as EventOccurrence;

let actions: ReturnType<typeof useEventActions>;
let version = 0;
const onChanged = vi.fn();
const record = (a: typeof actions, v: number) => { actions = a; version = v; };
const Probe: React.FC<{ onResult: typeof record }> = ({ onResult }) => {
  onResult(useEventActions(onChanged), useEventsVersion());
  return null;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe onResult={record} />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useEventActions', () => {
  it('tells the month calendars, brief and reports once a change is saved', async () => {
    api.setEventArchived.mockResolvedValue({ id: 7 });
    const before = version;
    await act(async () => { await actions.archive(occurrence, 'this'); });
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(version).toBe(before + 1);
  });

  it('tells no one when the change fails', async () => {
    api.deleteEvent.mockRejectedValue(new Error('offline'));
    const before = version;
    await act(async () => { await actions.remove(occurrence, 'all'); });
    expect(onChanged).not.toHaveBeenCalled();
    expect(version).toBe(before);
    expect(showToast).toHaveBeenCalledWith("Couldn't delete the event. Please try again.", 'error');
  });

  const imported = { ...occurrence, event_id: -7, source: 'google', repeating: true } as EventOccurrence;
  const undo = () => showToast.mock.calls.at(-1)![2].onClick();

  it('undoes a scoped delete of an imported event with the same scope', async () => {
    api.deleteEvent.mockResolvedValue({ id: -7 });
    api.restoreEvent.mockResolvedValue({ id: -7 });
    await act(async () => { await actions.remove(imported, 'following'); });
    await act(async () => { undo(); });
    expect(api.restoreEvent).toHaveBeenCalledWith(-7, '2026-10-23', 'following');
  });

  it('restores the instances of an imported event picked, naming them in the toast', async () => {
    api.setEventArchived.mockResolvedValue({ id: -7 });
    const restored: [string, string][] = [['this', 'Restored CS 460 Lecture for Fri, Oct 23.'], ['following', 'Restored CS 460 Lecture from Fri, Oct 23 on.'], ['all', 'Restored all CS 460 Lecture events.']];
    for (const [scope, message] of restored) {
      await act(async () => { await actions.restore(imported, scope as 'this' | 'following' | 'all'); });
      expect(api.setEventArchived).toHaveBeenLastCalledWith(-7, false, scope, '2026-10-23');
      expect(showToast).toHaveBeenLastCalledWith(message, 'success');
    }
    expect(api.fetchEvent).not.toHaveBeenCalled();
  });

  it('restores a one-off imported event on its own, and a kanso series whole, as before', async () => {
    api.setEventArchived.mockResolvedValue({ id: -7 });
    await act(async () => { await actions.restore({ ...imported, repeating: false }); });
    expect(api.setEventArchived).toHaveBeenLastCalledWith(-7, false, 'this', '2026-10-23');
    expect(showToast).toHaveBeenLastCalledWith('Restored CS 460 Lecture.', 'success');

    api.fetchEvent.mockResolvedValue({ archived_at: '2026-10-24T00:00:00Z' });
    await act(async () => { await actions.restore(occurrence); });
    expect(api.setEventArchived).toHaveBeenLastCalledWith(7, false, 'all');
    expect(showToast).toHaveBeenLastCalledWith('Restored CS 460 Lecture.', 'success');
  });

  it("sends a one-off imported event's tags without a scope", async () => {
    api.updateEvent.mockResolvedValue({});
    api.updateGoogleEventTags.mockResolvedValue(undefined);
    await act(async () => { await actions.update({ ...imported, repeating: false }, { title: 'Lecture', tags: [] }, 'all', [3]); });
    expect(api.updateGoogleEventTags).toHaveBeenCalledWith(-7, [3]);

    await act(async () => { await actions.update(imported, { tags: [] }, 'following', [3]); });
    expect(api.updateGoogleEventTags).toHaveBeenLastCalledWith(-7, [3], false, 'following');
  });

  it('refreshes when an imported event saved its details but not its tags', async () => {
    api.updateEvent.mockResolvedValue({});
    api.updateGoogleEventTags.mockRejectedValue(new Error('offline'));
    const before = version;
    let ok = true;
    await act(async () => { ok = await actions.update(imported, { title: 'Lecture', tags: [] }, 'this', [3]); });
    expect(ok).toBe(false);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(version).toBe(before + 1);
    expect(showToast).toHaveBeenCalledWith("Couldn't save the event. Please try again.", 'error');
  });
});
