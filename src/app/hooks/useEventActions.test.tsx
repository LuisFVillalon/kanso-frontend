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
});
