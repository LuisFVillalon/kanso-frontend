'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { createWorkBlock, deleteWorkBlock, describeError, fetchCalendarActivity, updateWorkBlock } from '@/app/lib/backend-api';
import { notifyWorkBlocksChanged } from '@/app/hooks/useWorkBlocksVersion';
import { blockSpan } from '@/app/hooks/useSlotPlanner';
import type { WorkBlock } from '@/app/types/workBlock';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { hhmm } from '@/app/utils/slotLabels';
import { workBlockBody } from '@/app/utils/workBlockPlans';

/** The Focus tile's lengths, in minutes. */
export const FOCUS_PRESETS = [25, 50, 90] as const;
export const DEFAULT_FOCUS_MINUTES = 25;
/** A session on a task this long or longer is saved as a work block. */
export const MIN_SAVED_MINUTES = 5;
/** How long "Saved 25m to … · Undo" stays up. */
export const SAVED_NOTICE_MS = 10_000;

export const FOCUS_TIMER_KEY = 'tm-focus-timer';
export const FOCUS_LOG_KEY = 'tm-focus-log';

const MINUTE = 60_000;

/**
 * The timer as stored, so a reload or another tab picks it up where it is.
 * Idle: `startedAt` is null. Running: `resumedAt` is set. Paused: `pausedAt`
 * is set. Done (ran to zero): `savedAt` is set and it reads 00:00 until the
 * next start.
 */
export interface FocusTimerState {
  taskId: number | null;
  /** True once a task (or No task) was picked; false while `taskId` is still the default. */
  taskPicked: boolean;
  minutes: number;
  /** When the session began (ms). */
  startedAt: number | null;
  /** When the current running stretch began (ms); null unless running. */
  resumedAt: number | null;
  /** Run time before the current stretch. */
  elapsedBeforePauseMs: number;
  pausedAt: number | null;
  /** When the finished session was recorded, so it is recorded once (across tabs too). */
  savedAt: number | null;
}

/** One finished session in today's tally. */
export interface FocusSession {
  taskId: number | null;
  /** Start and end as ms timestamps. */
  start: number;
  end: number;
  /** Time actually run (pauses left out). */
  ms: number;
}

interface FocusLog {
  date: string;
  sessions: FocusSession[];
}

export type FocusPhase = 'idle' | 'running' | 'paused' | 'done';

/** What the last save did, for its notice and Undo. */
export interface FocusSaved {
  taskId: number;
  minutes: number;
  block: WorkBlock;
  /** The block's times before it was extended; null when the save made a new block. */
  previous: { date: string; start_time: string; end_time: string } | null;
}

const idleState = (minutes = DEFAULT_FOCUS_MINUTES, taskId: number | null = null, taskPicked = false): FocusTimerState => ({
  taskId, taskPicked, minutes, startedAt: null, resumedAt: null, elapsedBeforePauseMs: 0, pausedAt: null, savedAt: null,
});

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => (isNum(v) ? v : null);

/** The stored timer, or an idle one when there's none (or storage can't be read). */
export function readFocusState(): FocusTimerState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOCUS_TIMER_KEY) ?? 'null');
    if (!raw || typeof raw !== 'object') return idleState();
    const minutes = isNum(raw.minutes) && raw.minutes > 0 ? raw.minutes : DEFAULT_FOCUS_MINUTES;
    return {
      taskId: numOrNull(raw.taskId),
      taskPicked: raw.taskPicked === true,
      minutes,
      startedAt: numOrNull(raw.startedAt),
      resumedAt: numOrNull(raw.resumedAt),
      elapsedBeforePauseMs: isNum(raw.elapsedBeforePauseMs) ? raw.elapsedBeforePauseMs : 0,
      pausedAt: numOrNull(raw.pausedAt),
      savedAt: numOrNull(raw.savedAt),
    };
  } catch {
    return idleState();
  }
}

/** Whether a timer is stored at all; false when storage can't be read. */
function hasStoredState(): boolean {
  try {
    return window.localStorage.getItem(FOCUS_TIMER_KEY) != null;
  } catch {
    return false;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // No storage (private window, blocked site data): the timer still runs on this page.
  }
}

/** Today's tally; an older day's starts over. */
export function readFocusLog(today: string): FocusSession[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FOCUS_LOG_KEY) ?? 'null') as FocusLog | null;
    if (!raw || raw.date !== today || !Array.isArray(raw.sessions)) return [];
    return raw.sessions.filter(s => s && isNum(s.start) && isNum(s.end));
  } catch {
    return [];
  }
}

export const focusPhase = (s: FocusTimerState): FocusPhase =>
  s.startedAt == null ? 'idle' : s.savedAt != null ? 'done' : s.resumedAt != null ? 'running' : 'paused';

/** Run time so far. */
export const focusElapsedMs = (s: FocusTimerState, now: number): number =>
  s.elapsedBeforePauseMs + (s.resumedAt != null && s.savedAt == null ? Math.max(0, now - s.resumedAt) : 0);

/** Time left: the full length while idle, none once done. */
export function focusRemainingMs(s: FocusTimerState, now: number): number {
  const total = s.minutes * MINUTE;
  if (s.startedAt == null) return total;
  if (s.savedAt != null) return 0;
  return Math.max(0, total - focusElapsedMs(s, now));
}

/** Local minutes from midnight of a timestamp. */
const localMinutes = (ms: number) => {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

/**
 * Saves a focus session on a task as a work block for its real span (today,
 * minute precision): extends a same-task block today that overlaps it, or
 * makes a new one. Returns what it did, for Undo.
 */
export async function saveFocusBlock(taskId: number, start: number, end: number): Promise<Omit<FocusSaved, 'minutes'>> {
  const date = toLocalDateStr(new Date(start));
  // Times go to the nearest minute (the API takes "HH:MM"); a session past
  // midnight ends with the day it started on.
  const s = Math.min(24 * 60 - 1, Math.round(localMinutes(start)));
  const sameDay = toLocalDateStr(new Date(end)) === date;
  const e = Math.max(s + 1, sameDay ? Math.round(localMinutes(end)) : 24 * 60);
  const activity = await fetchCalendarActivity(date, date);
  const overlap = (activity.work_blocks ?? []).find(b => {
    if (b.task_id !== taskId || b.date !== date) return false;
    const span = blockSpan(b);
    return span.start < e && s < span.end;
  });
  if (overlap) {
    const span = blockSpan(overlap);
    const block = await updateWorkBlock(overlap.id, {
      date,
      start_time: hhmm(Math.min(span.start, s)),
      end_time: hhmm(Math.max(span.end, e)),
    });
    return { taskId, block, previous: { date: overlap.date, start_time: overlap.start_time.slice(0, 5), end_time: overlap.end_time.slice(0, 5) } };
  }
  const block = await createWorkBlock(workBlockBody({ taskId }, { date, start: s, end: e }));
  return { taskId, block, previous: null };
}


// ── One timer per tab ─────────────────────────────────────────────────────────
//
// The tile and its overlay read the same timer, so it lives here once rather
// than in each component; other tabs reach it through storage.

interface FocusStore {
  state: FocusTimerState;
  sessions: FocusSession[];
  saved: FocusSaved | null;
  error: string | null;
}

const SERVER_STORE: FocusStore = { state: idleState(), sessions: [], saved: null, error: null };
let store: FocusStore = SERVER_STORE;
let hydrated = false;
let savedTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const today = () => toLocalDateStr(new Date());

function setStore(patch: Partial<FocusStore>) {
  store = { ...store, ...patch };
  listeners.forEach(l => l());
}

function commit(state: FocusTimerState) {
  writeJson(FOCUS_TIMER_KEY, state);
  setStore({ state });
}

function onStorage(e: StorageEvent) {
  if (e.key === FOCUS_TIMER_KEY) setStore({ state: readFocusState() });
  else if (e.key === FOCUS_LOG_KEY) setStore({ sessions: readFocusLog(today()) });
}

function subscribe(listener: () => void) {
  if (!hydrated) {
    hydrated = true;
    store = { ...store, state: readFocusState(), sessions: readFocusLog(today()) };
    window.addEventListener('storage', onStorage);
  }
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

const getSnapshot = () => store;
const getServerSnapshot = () => SERVER_STORE;

/** Forgets the in-memory timer, as a reload would. For tests. */
export function resetFocusTimerForTests() {
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = null;
  if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  hydrated = false;
  store = SERVER_STORE;
  listeners.clear();
}

function showSaved(saved: FocusSaved | null) {
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = saved ? setTimeout(() => { savedTimer = null; setStore({ saved: null }); }, SAVED_NOTICE_MS) : null;
  setStore({ saved });
}

/** Puts a finished session in today's tally and, when it counts, on the calendar. */
async function record(session: FocusSession) {
  if (session.ms >= MINUTE) {
    const date = toLocalDateStr(new Date(session.start));
    const sessions = [...readFocusLogOr(date, store.sessions), session];
    writeJson(FOCUS_LOG_KEY, { date, sessions });
    setStore({ sessions });
  }
  if (session.taskId == null || session.ms < MIN_SAVED_MINUTES * MINUTE) return;
  setStore({ error: null });
  try {
    const result = await saveFocusBlock(session.taskId, session.start, session.end);
    showSaved({ ...result, minutes: Math.round(session.ms / MINUTE) });
  } catch (err) {
    console.error('[useFocusTimer] Saving the session failed:', err);
    setStore({ error: describeError(err, "Couldn't save that session to your calendar.") });
  } finally {
    notifyWorkBlocksChanged();
  }
}

/** Today's tally from storage, or (without storage) the one in memory. */
function readFocusLogOr(date: string, inMemory: FocusSession[]): FocusSession[] {
  try {
    if (window.localStorage.getItem(FOCUS_LOG_KEY) != null) return readFocusLog(date);
  } catch {
    // fall through to memory
  }
  return inMemory.filter(s => toLocalDateStr(new Date(s.start)) === date);
}

/**
 * Ends the current session at `at`: Stop (`toIdle`) or running out. The
 * session is claimed in storage before it is recorded, so only one tab (and
 * one of this tab's views) records it.
 */
function finish(at: number, toIdle: boolean) {
  const s = store.state;
  if (s.startedAt == null || s.savedAt != null) return;
  if (hasStoredState()) {
    const stored = readFocusState();
    // Another tab already stopped it, recorded it, or started another.
    if (stored.startedAt !== s.startedAt || stored.savedAt != null) {
      setStore({ state: stored });
      return;
    }
  }
  const total = s.minutes * MINUTE;
  const ran = Math.min(total, focusElapsedMs(s, at));
  // Ran out: it ended the moment it reached zero, not when this tab noticed.
  const end = s.resumedAt != null && ran >= total ? s.resumedAt + (total - s.elapsedBeforePauseMs) : s.pausedAt ?? at;
  commit(toIdle ? idleState(s.minutes, s.taskId, s.taskPicked) : { ...s, resumedAt: null, pausedAt: null, elapsedBeforePauseMs: ran, savedAt: at });
  void record({ taskId: s.taskId, start: s.startedAt, end, ms: ran });
}

const actions = {
  start(taskId: number | null) {
    const t = Date.now();
    commit({ ...idleState(store.state.minutes, taskId, store.state.taskPicked), startedAt: t, resumedAt: t });
  },
  pause() {
    const s = store.state;
    if (focusPhase(s) !== 'running') return;
    const t = Date.now();
    if (focusRemainingMs(s, t) <= 0) { finish(t, false); return; }
    commit({ ...s, elapsedBeforePauseMs: focusElapsedMs(s, t), resumedAt: null, pausedAt: t });
  },
  resume() {
    const s = store.state;
    if (focusPhase(s) !== 'paused') return;
    commit({ ...s, resumedAt: Date.now(), pausedAt: null });
  },
  stop() {
    const s = store.state;
    const phase = focusPhase(s);
    if (phase === 'idle') return;
    if (phase === 'done') { commit(idleState(s.minutes, s.taskId, s.taskPicked)); return; }
    finish(Date.now(), true);
  },
  setMinutes(minutes: number) {
    const s = store.state;
    const phase = focusPhase(s);
    if (phase === 'running' || phase === 'paused') return;
    commit(idleState(minutes, s.taskId, s.taskPicked));
  },
  setTaskId(taskId: number | null) {
    const s = store.state;
    commit(focusPhase(s) === 'done' ? idleState(s.minutes, taskId, true) : { ...s, taskId, taskPicked: true });
  },
  undo() {
    const last = store.saved;
    if (!last) return;
    showSaved(null);
    setStore({ error: null });
    const run = last.previous
      ? updateWorkBlock(last.block.id, last.previous).then(() => undefined)
      : deleteWorkBlock(last.block.id);
    run
      .catch(err => {
        console.error('[useFocusTimer] Undoing the save failed:', err);
        setStore({ error: describeError(err, "Couldn't undo that. Please try again.") });
      })
      .finally(() => notifyWorkBlocksChanged());
  },
  dismissSaved() {
    showSaved(null);
  },
};

export interface FocusTimer {
  phase: FocusPhase;
  taskId: number | null;
  /** Whether `taskId` was picked (No task included) rather than left to the default. */
  taskPicked: boolean;
  minutes: number;
  remainingMs: number;
  totalMs: number;
  /** Today's finished sessions, oldest first. */
  sessions: FocusSession[];
  saved: FocusSaved | null;
  error: string | null;
  start: (taskId: number | null) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  /** Changes the length; only while idle or done. */
  setMinutes: (minutes: number) => void;
  /** Picks which task the session is for, shared by every view and tab. */
  setTaskId: (taskId: number | null) => void;
  undo: () => void;
  dismissSaved: () => void;
}

/**
 * The Focus tile's timer. The time left is worked out from the clock and the
 * stored state every time, so it carries on across reloads, other tabs follow
 * along through the `storage` event, and a session that ran out while the tab
 * was hidden is recorded once when it comes back. A finished session goes in
 * today's tally; one on a task that ran MIN_SAVED_MINUTES or more is also
 * saved as a work block.
 */
export function useFocusTimer(): FocusTimer {
  const { state, sessions, saved, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [now, setNow] = useState(() => Date.now());

  // Tick while running, and catch up as soon as a hidden tab comes back.
  const running = focusPhase(state) === 'running';
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      const s = store.state;
      if (focusPhase(s) === 'running' && focusRemainingMs(s, t) <= 0) finish(t, false);
    };
    tick();
    const id = setInterval(tick, 1000);
    const onVisible = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  // Today's tally starts over at midnight.
  const tallyDate = sessions[0] ? toLocalDateStr(new Date(sessions[0].start)) : null;
  const todaysSessions = tallyDate && tallyDate !== toLocalDateStr(new Date(now)) ? [] : sessions;

  return {
    phase: focusPhase(state),
    taskId: state.taskId,
    taskPicked: state.taskPicked,
    minutes: state.minutes,
    remainingMs: focusRemainingMs(state, running ? Math.max(now, state.resumedAt ?? 0) : now),
    totalMs: state.minutes * MINUTE,
    sessions: todaysSessions,
    saved,
    error,
    ...actions,
  };
}
