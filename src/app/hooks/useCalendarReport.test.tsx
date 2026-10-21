// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarActivity } from '@/app/types/activity';
import { periodContaining } from '@/app/utils/calendarReport';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({ fetchCalendarActivity: vi.fn() }));

vi.mock('@/app/lib/backend-api', () => ({ fetchCalendarActivity: mocks.fetchCalendarActivity }));
vi.mock('@/app/context/HabitsContext', () => ({ useHabitsContext: () => ({ habits: [] }) }));

import { useCalendarReport } from './useCalendarReport';

const emptyActivity = (start: string, end: string): CalendarActivity => ({
  start_date: start,
  end_date: end,
  scheduled_tasks: [],
  completed_tasks: [],
  note_sessions: [],
  habit_completions: [],
});

const Probe: React.FC = () => {
  useCalendarReport(periodContaining('month', new Date(2026, 9, 21)));
  return null;
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  mocks.fetchCalendarActivity.mockReset().mockImplementation(async (start: string, end: string) => emptyActivity(start, end));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('useCalendarReport', () => {
  it('asks for archived items too, so reports count them', async () => {
    await act(async () => root.render(<Probe />));
    expect(mocks.fetchCalendarActivity).toHaveBeenCalledWith('2026-10-01', '2026-10-31', { includeArchived: true });
  });
});
