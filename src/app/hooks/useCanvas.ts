'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  fetchCanvasAnnouncements,
  fetchCanvasAssignments,
  fetchCanvasClasses,
  fetchCanvasConnection,
  fetchCanvasModules,
  fetchCanvasOverview,
  fetchCanvasPanelCourses,
  updateCanvasHiddenCourses,
} from '@/app/lib/backend-api';
import { canvasView } from '@/app/components/settings/CanvasIntegrationSection';
import { canvasCan } from '@/app/utils/canvas';
import type {
  CanvasAnnouncements,
  CanvasAssignments,
  CanvasClasses,
  CanvasConnection,
  CanvasCourses,
  CanvasModules,
  CanvasOverview,
} from '@/app/types/canvas';

/** How long after a manual refresh the next one is allowed; the backend won't refetch sooner anyway. */
export const CANVAS_REFRESH_COOLDOWN_MS = 30 * 1000;

/**
 * What the panel shows: a skeleton, the not-connected prompt, "Reconnect
 * Canvas", an error with Retry, or the data.
 */
export type CanvasPanelStatus = 'loading' | 'not-connected' | 'reconnect' | 'error' | 'ready';

const READ_ERROR_MESSAGES: Record<string, string> = {
  canvas_busy: 'Canvas is busy right now and kanso has nothing saved to show yet. Try again in a minute.',
  canvas_unavailable: "Canvas isn't responding right now. Try again in a few minutes.",
  canvas_not_configured: "Canvas isn't available yet. Try again later.",
  canvas_not_canvas: "kanso couldn't reach Canvas at your school's address.",
  canvas_forbidden: "Canvas wouldn't share this with kanso. Your school may limit what tokens can do.",
  canvas_course_hidden: "This course is unticked under Courses to show in Settings.",
  canvas_course_not_found: "Canvas doesn't list this course anymore.",
  canvas_not_supported: "The Canvas calendar feed doesn't include this. It needs an access token.",
};

export interface CanvasFailure {
  status: 'not-connected' | 'reconnect' | 'error';
  message: string;
}

/** The panel state for a failed Canvas read, from the error code the backend sent. */
export function canvasReadFailure(err: unknown): CanvasFailure {
  const detail = err instanceof ApiError ? err.detail : null;
  if (detail === 'canvas_not_connected') return { status: 'not-connected', message: "Canvas isn't connected." };
  if (detail === 'canvas_token_invalid') return { status: 'reconnect', message: 'Canvas rejected the token.' };
  if (detail === 'canvas_feed_invalid') return { status: 'reconnect', message: 'Canvas stopped serving the calendar feed.' };
  if (detail && Object.hasOwn(READ_ERROR_MESSAGES, detail)) return { status: 'error', message: READ_ERROR_MESSAGES[detail] };
  if (err instanceof ApiError && err.status === 429) {
    return { status: 'error', message: 'Too many Canvas requests. Try again in a minute.' };
  }
  return { status: 'error', message: "Couldn't load Canvas. Try again in a moment." };
}

interface UseCanvasOptions {
  /** Demo sandboxes read the backend's sample data and never see connect prompts. */
  isDemo: boolean;
  /** Bumped by the parent (e.g. when Settings closes) to reload the connection and data. */
  syncToken?: number;
}

/**
 * The Canvas panel's data: the masked connection, then the overview of
 * everything Canvas has coming (Upcoming narrows it to 7 days itself, and the
 * Classes tab counts from it), the classes (hidden ones too) and the course
 * list with grades, with the announcements loaded the first time their tab
 * opens. Everything comes through the backend's Canvas proxy. A calendar
 * feed has no courses or announcements, so `courses` stays null; its classes
 * are the courses its due dates belong to. `classes` stays null when the
 * backend can't list them, and the panel finds them in the due dates.
 */
export function useCanvas({ isDemo, syncToken = 0 }: UseCanvasOptions) {
  const [status, setStatus] = useState<CanvasPanelStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<CanvasConnection | null>(null);
  const [overview, setOverview] = useState<CanvasOverview | null>(null);
  const [courses, setCourses] = useState<CanvasCourses | null>(null);
  const [classes, setClasses] = useState<CanvasClasses | null>(null);
  const [announcements, setAnnouncements] = useState<CanvasAnnouncements | null>(null);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);
  const [wantAnnouncements, setWantAnnouncements] = useState(false);
  // A refresh that failed while older data stays on screen.
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshBlocked, setRefreshBlocked] = useState(false);
  // Bumped on a manual refresh, so an open course refetches too.
  const [refreshNonce, setRefreshNonce] = useState(0);

  const latest = useRef(0);
  const hasData = useRef(false);
  const wantAnnouncementsRef = useRef(false);

  const fail = useCallback((err: unknown) => {
    const failure = canvasReadFailure(err);
    // Demo sandboxes have no connection to fix, so never prompt them to connect.
    if (isDemo && failure.status !== 'error') {
      setStatus('error');
      setError("Couldn't load the sample Canvas data. Try again in a moment.");
      return;
    }
    if (failure.status === 'error' && hasData.current) {
      setRefreshError(failure.message);
      return;
    }
    if (failure.status !== 'error') hasData.current = false;
    setStatus(failure.status);
    setError(failure.message);
  }, [isDemo]);

  const load = useCallback(async (refresh: boolean) => {
    const run = ++latest.current;
    try {
      // Demo sandboxes read the sample data a token would.
      let withCourses = true;
      let withClasses = true;
      let withAnnouncements = true;
      if (!isDemo) {
        const conn = await fetchCanvasConnection();
        if (run !== latest.current) return;
        setConnection(conn);
        if (!conn.connected || canvasView(conn, new Date()) === 'invalid') {
          hasData.current = false;
          setStatus(conn.connected ? 'reconnect' : 'not-connected');
          return;
        }
        withCourses = canvasCan(conn, 'courses');
        withClasses = canvasCan(conn, 'classes');
        withAnnouncements = canvasCan(conn, 'announcements');
      }
      const [nextOverview, nextCourses, nextClasses, nextAnnouncements] = await Promise.all([
        fetchCanvasOverview(refresh, 'all'),
        withCourses ? fetchCanvasPanelCourses(refresh) : Promise.resolve(null),
        // Without the class list, the panel finds the classes in the due dates.
        withClasses ? fetchCanvasClasses(refresh).catch(() => null) : Promise.resolve(null),
        // A failed announcements fetch keeps the ones on screen rather than failing the panel.
        withAnnouncements && wantAnnouncementsRef.current
          ? fetchCanvasAnnouncements(refresh).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (run !== latest.current) return;
      setOverview(nextOverview);
      setCourses(nextCourses);
      setClasses(nextClasses);
      if (nextAnnouncements) setAnnouncements(nextAnnouncements);
      hasData.current = true;
      setRefreshError(null);
      setError(null);
      setStatus('ready');
    } catch (err) {
      if (run === latest.current) fail(err);
    }
  }, [isDemo, fail]);

  // load only sets state once the backend answers, never synchronously.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(false); }, [load, syncToken]);

  // Announcements load the first time their tab opens, then with every reload.
  useEffect(() => {
    if (!wantAnnouncements || status !== 'ready' || announcements || announcementsError) return;
    if (!isDemo && !(connection && canvasCan(connection, 'announcements'))) return;
    let cancelled = false;
    fetchCanvasAnnouncements().then(
      result => { if (!cancelled) setAnnouncements(result); },
      err => {
        if (cancelled) return;
        const failure = canvasReadFailure(err);
        if (failure.status === 'error') setAnnouncementsError(failure.message);
        else fail(err);
      },
    );
    return () => { cancelled = true; };
  }, [wantAnnouncements, status, announcements, announcementsError, isDemo, connection, fail]);

  const loadAnnouncements = useCallback(() => {
    wantAnnouncementsRef.current = true;
    setAnnouncementsError(null);
    setWantAnnouncements(true);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing || refreshBlocked) return;
    setRefreshing(true);
    setRefreshBlocked(true);
    setRefreshNonce(n => n + 1);
    try {
      await load(true);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refreshBlocked, load]);

  /**
   * Hides a class from the panel or shows it again: saved to the connection
   * at once, then the data reloads without it (the backend leaves hidden
   * classes out). A failed save puts the old choice back; false then.
   */
  const setClassHidden = useCallback(async (courseId: number, hidden: boolean): Promise<boolean> => {
    if (!connection) return false;
    const previous = connection;
    const ids = hidden
      ? [...new Set([...previous.hidden_course_ids, courseId])].sort((a, b) => a - b)
      : previous.hidden_course_ids.filter(id => id !== courseId);
    setConnection({ ...previous, hidden_course_ids: ids });
    try {
      setConnection(await updateCanvasHiddenCourses(ids));
    } catch {
      setConnection(previous);
      return false;
    }
    await load(false);
    return true;
  }, [connection, load]);

  useEffect(() => {
    if (!refreshBlocked) return;
    const timer = setTimeout(() => setRefreshBlocked(false), CANVAS_REFRESH_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [refreshBlocked]);

  return {
    status,
    error,
    connection,
    overview,
    courses,
    classes,
    announcements,
    announcementsError,
    loadAnnouncements,
    refreshError,
    refreshing,
    canRefresh: !refreshing && !refreshBlocked,
    refresh,
    refreshNonce,
    setClassHidden,
    /** Reports a failed read from elsewhere in the panel (an open course), so a rejected token shows Reconnect. */
    fail,
  };
}

export type CanvasCourseView = 'modules' | 'assignments';

/**
 * One course's modules or assignments, fetched the first time each view is
 * opened. A rejected token is handed to `onFail` so the whole panel switches
 * to Reconnect; other failures stay inside the course.
 */
export function useCanvasCourse(
  courseId: number,
  view: CanvasCourseView,
  { onFail, refreshNonce }: { onFail: (err: unknown) => void; refreshNonce: number },
) {
  const [modules, setModules] = useState<CanvasModules | null>(null);
  const [assignments, setAssignments] = useState<CanvasAssignments | null>(null);
  const [errors, setErrors] = useState<Partial<Record<CanvasCourseView, string>>>({});
  const loadedNonce = useRef<Partial<Record<CanvasCourseView, number>>>({});

  useEffect(() => {
    const loaded = loadedNonce.current;
    // Fetched already, and no manual refresh since.
    if (loaded[view] === refreshNonce) return;
    const refresh = loaded[view] !== undefined;
    loaded[view] = refreshNonce;
    let cancelled = false;
    let settled = false;
    const request = view === 'modules'
      ? fetchCanvasModules(courseId, refresh).then(result => { if (!cancelled) setModules(result); })
      : fetchCanvasAssignments(courseId, refresh).then(result => { if (!cancelled) setAssignments(result); });
    request.then(
      () => {
        settled = true;
        if (!cancelled) setErrors(prev => ({ ...prev, [view]: undefined }));
      },
      err => {
        settled = true;
        if (cancelled) return;
        const failure = canvasReadFailure(err);
        if (failure.status === 'error') setErrors(prev => ({ ...prev, [view]: failure.message }));
        else onFail(err);
      },
    );
    return () => {
      cancelled = true;
      // A request cut short is fetched again next time rather than waited on.
      if (!settled) loaded[view] = undefined;
    };
  }, [courseId, view, refreshNonce, onFail]);

  return { modules, assignments, error: errors[view] ?? null };
}
