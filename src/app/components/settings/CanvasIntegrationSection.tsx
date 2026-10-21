'use client';

/**
 * Settings → Canvas: connect the user's Canvas account with a
 * personal access token and the school's Canvas address, then see it masked
 * ("Connected · ends in …7Hq2"), test it, replace it, remove it, and pick
 * the courses the home page shows.
 *
 * The token only ever lives in the form's uncontrolled password input: it is
 * read from the DOM on submit, sent once to the backend (which checks it with
 * Canvas before storing it encrypted), and the input is cleared as soon as
 * Canvas accepts it. It never enters React state, storage or logs, and the
 * backend never sends it back.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle, Check, CircleAlert, CircleHelp, Clock, Eye, EyeOff, GraduationCap, KeyRound, Loader2,
  PlugZap, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import {
  ApiError,
  connectCanvas,
  describeError,
  fetchCanvasConnection,
  fetchCanvasCourses,
  removeCanvasConnection,
  testCanvasConnection,
  updateCanvasHiddenCourses,
} from '@/app/lib/backend-api';
import type { CanvasConnection, CanvasCourse, CanvasErrorCode } from '@/app/types/canvas';

/** How far ahead of the token's expiry Settings starts warning about it. */
export const EXPIRING_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const ERROR_MESSAGES: Record<CanvasErrorCode, string> = {
  canvas_url_invalid:
    "That isn't a Canvas address kanso can use. Enter your school's Canvas address, like school.instructure.com.",
  canvas_not_canvas:
    "kanso couldn't find a Canvas site at this address. Use the address you see when you open Canvas.",
  canvas_token_invalid:
    "Canvas didn't accept this token. It may be incomplete, expired, or deleted in Canvas. Copy it again or create a new one.",
  canvas_forbidden:
    "Canvas accepted the token but wouldn't share your account details. Your school may limit what tokens can do.",
  canvas_account_changed: 'This token belongs to a different Canvas account or school.',
  canvas_unavailable: "Canvas couldn't be reached right now. Try again in a few minutes.",
  canvas_not_connected: "Canvas isn't connected anymore.",
  canvas_not_configured: "Canvas isn't available yet. Nothing was saved, so try again later.",
};

/** The form field an error code points at; the rest show under the form. */
const ERROR_FIELDS: Partial<Record<CanvasErrorCode, 'url' | 'token'>> = {
  canvas_url_invalid: 'url',
  canvas_not_canvas: 'url',
  canvas_token_invalid: 'token',
};

/** The Canvas error code a failed request carried, or null for any other failure. */
export function canvasErrorCode(err: unknown): CanvasErrorCode | null {
  return err instanceof ApiError && Object.hasOwn(ERROR_MESSAGES, err.detail) ? (err.detail as CanvasErrorCode) : null;
}

/** A message for a failed Canvas request: the code's own wording, else the server's reason or `fallback`. */
export function canvasErrorMessage(err: unknown, fallback: string): string {
  const code = canvasErrorCode(err);
  return code ? ERROR_MESSAGES[code] : describeError(err, fallback);
}

export type CanvasView = 'not-connected' | 'active' | 'expiring' | 'error' | 'invalid';

const daysUntil = (iso: string, now: Date) => Math.ceil((new Date(iso).getTime() - now.getTime()) / DAY_MS);

const isExpired = (connection: CanvasConnection, now: Date) =>
  !!connection.token_expires_at && new Date(connection.token_expires_at) <= now;

/** Which state Settings shows for a connection. */
export function canvasView(connection: CanvasConnection, now: Date): CanvasView {
  if (!connection.connected) return 'not-connected';
  if (connection.status === 'invalid') return 'invalid';
  if (connection.status === 'error') return 'error';
  // Past its date the backend already reports "invalid"; this covers the clock passing it while open.
  if (isExpired(connection, now)) return 'invalid';
  const expires = connection.token_expires_at;
  return expires && daysUntil(expires, now) <= EXPIRING_SOON_DAYS ? 'expiring' : 'active';
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

const relativeDays = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`);

/** The headline on the connection card, e.g. "Connected · ends in …7Hq2". */
export function canvasStatusLine(connection: CanvasConnection, now: Date): string {
  const endsIn = `Connected · ends in …${connection.token_last4 ?? ''}`;
  switch (canvasView(connection, now)) {
    case 'invalid':
      return isExpired(connection, now) ? 'Not syncing · the token expired' : 'Not syncing · Canvas rejected the token';
    case 'error':
      return `${endsIn} · couldn't reach Canvas`;
    case 'expiring':
      return `${endsIn} · expires ${relativeDays(daysUntil(connection.token_expires_at!, now))}`;
    default:
      return endsIn;
  }
}

const NOT_CONNECTED: CanvasConnection = {
  connected: false,
  status: null,
  base_url: null,
  token_last4: null,
  canvas_user_id: null,
  canvas_user_name: null,
  token_expires_at: null,
  hidden_course_ids: [],
  created_at: null,
  updated_at: null,
  last_synced_at: null,
  last_error_at: null,
};

const hostOf = (baseUrl: string | null) => (baseUrl ?? '').replace(/^https:\/\//, '');

type Notice = { tone: 'success' | 'error'; text: string };

// ── Small pieces ─────────────────────────────────────────────────────────────

const Banner: React.FC<{ tone: 'warning' | 'danger'; icon: React.ElementType; children: React.ReactNode }> = ({
  tone,
  icon: Icon,
  children,
}) => (
  <div
    className="flex gap-2 items-start rounded-lg px-3 py-2.5 text-sm"
    style={{ backgroundColor: `var(--tm-${tone}-subtle)`, color: 'var(--tm-text-primary)' }}
  >
    <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: `var(--tm-${tone})` }} />
    <div>{children}</div>
  </div>
);

const SecurityNote = () => (
  <div
    className="flex gap-2 items-start rounded-lg px-3 py-2.5 text-xs"
    style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
  >
    <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--tm-text-muted)' }} />
    <p>
      Your token is encrypted and stored on kanso&apos;s server, and it&apos;s never sent back to your browser. A
      Canvas token can do anything you can do in Canvas, but kanso only uses it to read. You can revoke it at any
      time in Canvas under <strong className="font-semibold">Approved Integrations</strong>.
    </p>
  </div>
);

const HowToGetToken: React.FC<{ open: boolean }> = ({ open }) => (
  <details
    open={open}
    className="rounded-lg border text-sm"
    style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface)' }}
  >
    <summary className="flex items-center gap-2 px-3 py-2.5 font-semibold cursor-pointer text-text-primary">
      <CircleHelp className="w-3.5 h-3.5" />
      How do I get a Canvas token?
    </summary>
    <ol className="list-decimal pl-9 pr-3 pb-3 space-y-1" style={{ color: 'var(--tm-text-secondary)' }}>
      <li>Open Canvas and go to <strong className="text-text-primary">Account → Settings</strong>.</li>
      <li>
        Scroll to <strong className="text-text-primary">Approved Integrations</strong> and press{' '}
        <strong className="text-text-primary">+ New Access Token</strong>.
      </li>
      <li>
        For <strong className="text-text-primary">Purpose</strong>, type kanso. Pick an expiration date (Canvas
        requires one for students, usually 90 days at most).
      </li>
      <li>Press <strong className="text-text-primary">Generate Token</strong> and copy it right away. Canvas shows it only once.</li>
      <li>Paste it below. kanso checks it with Canvas before saving.</li>
    </ol>
    <p
      className="mx-3 mb-3 px-2.5 py-2 rounded-md text-xs"
      style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
    >
      No <strong>+ New Access Token</strong> button? Your school has turned off student tokens, so kanso can&apos;t
      connect this way.
    </p>
  </details>
);

const FieldError: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => (
  <p id={id} className="flex items-start gap-1 text-xs mt-1" style={{ color: 'var(--tm-danger)' }}>
    <CircleAlert className="w-3 h-3 mt-0.5 shrink-0" />
    <span>{children}</span>
  </p>
);

// ── Connect / replace / reconnect form ──────────────────────────────────────

type FormMode = 'connect' | 'replace' | 'reconnect';

interface FormProps {
  mode: FormMode;
  defaultUrl: string;
  onSubmit: (baseUrl: string, token: string, allowAccountChange: boolean) => Promise<void>;
  onCancel?: () => void;
}

const SUBMIT_LABEL: Record<FormMode, string> = {
  connect: 'Connect',
  replace: 'Check & replace',
  reconnect: 'Reconnect Canvas',
};

const CanvasTokenForm: React.FC<FormProps> = ({ mode, defaultUrl, onSubmit, onCancel }) => {
  // Uncontrolled on purpose: the token stays in the input, never in state.
  const tokenRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(defaultUrl);
  const [showToken, setShowToken] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<{ field: 'url' | 'token' | null; message: string } | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);

  const submit = async (allowAccountChange: boolean) => {
    const input = tokenRef.current;
    if (!input) return;
    if (!url.trim()) {
      setError({ field: 'url', message: "Enter your school's Canvas address." });
      return;
    }
    if (!input.value.trim()) {
      setError({ field: 'token', message: 'Paste the access token from Canvas.' });
      return;
    }
    setChecking(true);
    setError(null);
    setConfirmSwitch(false);
    try {
      await onSubmit(url.trim(), input.value.trim(), allowAccountChange);
      input.value = '';
    } catch (err) {
      const code = canvasErrorCode(err);
      if (code === 'canvas_account_changed') {
        setConfirmSwitch(true);
      } else {
        setError({
          field: (code && ERROR_FIELDS[code]) ?? null,
          message: canvasErrorMessage(err, "Couldn't connect Canvas. Please try again."),
        });
      }
    } finally {
      setChecking(false);
    }
  };

  const urlError = error?.field === 'url' ? error.message : null;
  const tokenError = error?.field === 'token' ? error.message : null;
  const formError = error && !error.field ? error.message : null;

  return (
    <form
      onSubmit={e => { e.preventDefault(); void submit(false); }}
      className="space-y-4"
      aria-label={mode === 'connect' ? 'Connect Canvas' : SUBMIT_LABEL[mode]}
    >
      <div>
        <label htmlFor="canvas-url" className="block text-xs font-medium text-text-muted mb-1">Canvas address</label>
        <input
          id="canvas-url"
          type="text"
          inputMode="url"
          value={url}
          onChange={e => { setUrl(e.target.value); setError(null); setConfirmSwitch(false); }}
          placeholder="https://yourschool.instructure.com"
          autoComplete="url"
          spellCheck={false}
          disabled={checking}
          aria-invalid={!!urlError}
          aria-describedby={urlError ? 'canvas-url-error' : 'canvas-url-help'}
          className="input-field w-full text-sm"
          style={urlError ? { borderColor: 'var(--tm-danger)' } : undefined}
        />
        {urlError ? (
          <FieldError id="canvas-url-error">{urlError}</FieldError>
        ) : (
          <p id="canvas-url-help" className="text-xs text-text-muted mt-1">
            The address you see when you open Canvas. Custom school domains work too.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="canvas-token" className="block text-xs font-medium text-text-muted mb-1">Access token</label>
        <div className="relative">
          <input
            id="canvas-token"
            ref={tokenRef}
            type={showToken ? 'text' : 'password'}
            defaultValue=""
            onChange={() => { setError(null); setConfirmSwitch(false); }}
            placeholder="Paste the token from Canvas"
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            disabled={checking}
            aria-invalid={!!tokenError}
            aria-describedby={tokenError ? 'canvas-token-error' : undefined}
            className="input-field w-full text-sm pr-10"
            style={tokenError ? { borderColor: 'var(--tm-danger)' } : undefined}
          />
          <button
            type="button"
            onClick={() => setShowToken(s => !s)}
            aria-label={showToken ? 'Hide token' : 'Show token'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-primary"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {tokenError && <FieldError id="canvas-token-error">{tokenError}</FieldError>}
      </div>

      {formError && (
        <p role="alert" className="text-sm rounded-md px-3 py-2" style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}>
          {formError}
        </p>
      )}

      {confirmSwitch && (
        <div role="alert" className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--tm-warning)', backgroundColor: 'var(--tm-warning-subtle)' }}>
          <p className="text-sm text-text-primary">
            <strong className="font-semibold">{ERROR_MESSAGES.canvas_account_changed}</strong> Switch kanso to it? Your
            &ldquo;Courses to show&rdquo; choices will reset.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void submit(true)} className="btn btn-primary text-xs py-1.5">
              Switch account
            </button>
            <button type="button" onClick={() => setConfirmSwitch(false)} className="btn btn-outline text-xs py-1.5">
              Keep current account
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={checking} className="btn btn-primary text-sm py-2 disabled:opacity-60">
          {checking
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking with Canvas…</>
            : <><PlugZap className="w-4 h-4" /> {SUBMIT_LABEL[mode]}</>}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={checking} className="btn btn-outline text-sm py-2">
            Cancel
          </button>
        )}
      </div>
      <p className="text-xs text-text-muted">
        {mode === 'connect'
          ? 'kanso saves the token only after Canvas accepts it.'
          : 'If Canvas rejects the new token, nothing is saved and your current connection stays as it is.'}
      </p>
    </form>
  );
};

// ── Connection card ─────────────────────────────────────────────────────────

const DOT_COLOR: Record<CanvasView, string> = {
  'not-connected': 'var(--tm-text-muted)',
  active: 'var(--tm-success)',
  expiring: 'var(--tm-warning)',
  error: 'var(--tm-warning)',
  invalid: 'var(--tm-danger)',
};

const ConnectionCard: React.FC<{ connection: CanvasConnection; now: Date }> = ({ connection, now }) => {
  const view = canvasView(connection, now);
  const expires = connection.token_expires_at;
  let expiresText: React.ReactNode = null;
  if (expires) {
    const days = daysUntil(expires, now);
    expiresText = isExpired(connection, now)
      ? <span style={{ color: 'var(--tm-danger)' }}>Expired {formatDate(expires)}</span>
      : view === 'expiring'
        ? <span style={{ color: 'var(--tm-warning)' }}>{formatDate(expires)} ({relativeDays(days)})</span>
        : `${formatDate(expires)} (${relativeDays(days)})`;
  }

  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface)' }}>
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: DOT_COLOR[view], boxShadow: `0 0 0 3px color-mix(in srgb, ${DOT_COLOR[view]} 20%, transparent)` }}
        />
        <p className="text-sm font-semibold text-text-primary" data-testid="canvas-status">{canvasStatusLine(connection, now)}</p>
        <GraduationCap className="w-4 h-4 ml-auto shrink-0 text-text-muted" />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1.5 mt-3 text-sm">
        <dt className="text-text-muted">School</dt>
        <dd className="min-w-0 break-words text-text-primary">{hostOf(connection.base_url)}</dd>
        {connection.canvas_user_name && <>
          <dt className="text-text-muted">Canvas account</dt>
          <dd className="min-w-0 break-words text-text-primary">{connection.canvas_user_name}</dd>
        </>}
        <dt className="text-text-muted">Token</dt>
        <dd className="text-text-primary">
          <span className="font-mono text-xs">•••• •••• {connection.token_last4}</span>
          {connection.created_at && <span className="text-text-muted"> · added {formatDate(connection.created_at)}</span>}
        </dd>
        {expiresText && <>
          <dt className="text-text-muted">Expires</dt>
          <dd className="text-text-primary">{expiresText}</dd>
        </>}
        {connection.last_synced_at && <>
          <dt className="text-text-muted">Last sync</dt>
          <dd className="text-text-primary">{formatDateTime(connection.last_synced_at)}</dd>
        </>}
      </dl>
    </div>
  );
};

// ── Courses to show ─────────────────────────────────────────────────────────

const CoursesToShow: React.FC<{
  courses: CanvasCourse[];
  hidden: number[];
  disabled: boolean;
  onToggle: (courseId: number) => void;
}> = ({ courses, hidden, disabled, onToggle }) => (
  <fieldset>
    <legend className="text-xs font-medium text-text-muted mb-1">Courses to show</legend>
    {courses.length === 0 ? (
      <p className="text-sm text-text-secondary">Canvas didn&apos;t list any active courses for your account.</p>
    ) : (
      <>
        <p className="text-xs text-text-muted mb-1.5">Hide courses you don&apos;t need on the home page, like trainings or sandboxes.</p>
        <div className="grid gap-0.5">
          {courses.map(course => (
            <label
              key={course.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-[var(--tm-surface-raised)]"
            >
              <input
                type="checkbox"
                checked={!hidden.includes(course.id)}
                disabled={disabled}
                onChange={() => onToggle(course.id)}
                style={{ accentColor: 'var(--tm-accent)' }}
              />
              {course.course_code && <span className="font-semibold text-text-primary">{course.course_code}</span>}
              <span className="min-w-0 truncate text-text-secondary">{course.name}</span>
            </label>
          ))}
        </div>
      </>
    )}
  </fieldset>
);

// ── Section ─────────────────────────────────────────────────────────────────

interface Props {
  /** Demo sandboxes can't connect Canvas (the backend refuses them with 403). */
  isDemo: boolean;
}

type Mode = 'view' | 'replace' | 'remove';

const CanvasIntegrationSection: React.FC<Props> = ({ isDemo }) => {
  const [connection, setConnection] = useState<CanvasConnection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [busy, setBusy] = useState<'test' | 'remove' | 'courses' | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [courses, setCourses] = useState<{ key: string; list: CanvasCourse[] } | null>(null);

  const load = useCallback(() => fetchCanvasConnection().then(setConnection, (err: unknown) => {
    if (err instanceof ApiError && err.status === 403) {
      setUnavailable(describeError(err, "Canvas isn't available for this account."));
    } else {
      setLoadError(canvasErrorMessage(err, "Couldn't load your Canvas connection."));
    }
  }), []);

  useEffect(() => {
    if (!isDemo) void load();
  }, [isDemo, load]);

  // The course list comes from Canvas through the backend; until that route
  // answers (or while the token is rejected), "Courses to show" stays hidden.
  const coursesKey = connection?.connected && connection.status !== 'invalid'
    ? `${connection.base_url}#${connection.canvas_user_id}`
    : null;
  useEffect(() => {
    if (!coursesKey) return;
    let cancelled = false;
    fetchCanvasCourses().then(
      list => { if (!cancelled) setCourses({ key: coursesKey, list }); },
      () => { if (!cancelled) setCourses(null); },
    );
    return () => { cancelled = true; };
  }, [coursesKey]);
  const visibleCourses = courses && courses.key === coursesKey ? courses.list : null;

  const handleConnect = async (baseUrl: string, token: string, allowAccountChange: boolean) => {
    const next = await connectCanvas(baseUrl, token, allowAccountChange);
    setConnection(next);
    setMode('view');
    setNotice({ tone: 'success', text: next.canvas_user_name ? `Canvas connected as ${next.canvas_user_name}.` : 'Canvas connected.' });
  };

  const handleTest = async () => {
    setBusy('test');
    setNotice(null);
    try {
      const next = await testCanvasConnection();
      setConnection(next);
      if (next.status === 'active') setNotice({ tone: 'success', text: 'Canvas accepted the token. Checked just now.' });
    } catch (err) {
      const code = canvasErrorCode(err);
      setNotice({ tone: 'error', text: canvasErrorMessage(err, "Couldn't test the connection. Please try again.") });
      if (code === 'canvas_not_connected') setConnection(NOT_CONNECTED);
      // The backend records the failed check; reload to show it.
      else if (code === 'canvas_unavailable') void load();
    } finally {
      setBusy(null);
    }
  };

  const handleRemove = async () => {
    setBusy('remove');
    setNotice(null);
    try {
      await removeCanvasConnection();
      setConnection(NOT_CONNECTED);
      setMode('view');
      setNotice({ tone: 'success', text: 'Canvas removed. The token was deleted from kanso.' });
    } catch (err) {
      setNotice({ tone: 'error', text: canvasErrorMessage(err, "Couldn't remove Canvas. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const handleToggleCourse = async (courseId: number) => {
    if (!connection) return;
    const previous = connection;
    const hidden = previous.hidden_course_ids.includes(courseId)
      ? previous.hidden_course_ids.filter(id => id !== courseId)
      : [...previous.hidden_course_ids, courseId].sort((a, b) => a - b);
    setConnection({ ...previous, hidden_course_ids: hidden });
    setBusy('courses');
    setNotice(null);
    try {
      setConnection(await updateCanvasHiddenCourses(hidden));
    } catch (err) {
      setConnection(canvasErrorCode(err) === 'canvas_not_connected' ? NOT_CONNECTED : previous);
      setNotice({ tone: 'error', text: canvasErrorMessage(err, "Couldn't save your course choices. Please try again.") });
    } finally {
      setBusy(null);
    }
  };

  const intro = (
    <div className="flex items-center gap-2" style={{ color: 'var(--tm-text-secondary)' }}>
      <GraduationCap className="w-4 h-4 shrink-0" />
      <p className="text-sm">Connect Canvas to see your classes, due dates and grades in kanso.</p>
    </div>
  );

  if (isDemo || unavailable) {
    return (
      <div className="space-y-4">
        {intro}
        <Banner tone="warning" icon={AlertTriangle}>
          <p className="font-semibold">
            {isDemo ? 'Canvas isn\'t available in the demo.' : 'Canvas isn\'t available for this account.'}
          </p>
          <p className="text-text-secondary">
            {isDemo
              ? 'Connecting Canvas stores your access token, so it needs your own kanso account. Create one to connect Canvas.'
              : unavailable}
          </p>
        </Banner>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        {intro}
        <div className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
          <p role="alert">{loadError}</p>
          <button
            type="button"
            onClick={() => { setLoadError(null); void load(); }}
            className="mt-1 font-medium hover:underline"
            style={{ color: 'var(--tm-accent)' }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!connection) {
    return (
      <div className="flex justify-center py-6" style={{ color: 'var(--tm-text-muted)' }}>
        <Loader2 className="w-5 h-5 animate-spin" aria-label="Loading Canvas connection" />
      </div>
    );
  }

  const now = new Date();
  const view = canvasView(connection, now);
  const noticeEl = notice && (
    <p
      role={notice.tone === 'error' ? 'alert' : 'status'}
      className="flex items-start gap-1.5 text-sm rounded-md px-3 py-2"
      style={notice.tone === 'error'
        ? { backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }
        : { backgroundColor: 'var(--tm-success-subtle)', color: 'var(--tm-text-primary)' }}
    >
      {notice.tone === 'success' && <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-success)' }} />}
      <span>{notice.text}</span>
    </p>
  );

  if (view === 'not-connected') {
    return (
      <div className="space-y-4">
        {intro}
        {noticeEl}
        <HowToGetToken open />
        <CanvasTokenForm mode="connect" defaultUrl="" onSubmit={handleConnect} />
        <SecurityNote />
      </div>
    );
  }

  const removeConfirm = (
    <div
      className="rounded-xl border p-3.5 space-y-3"
      style={{ borderColor: 'color-mix(in srgb, var(--tm-danger) 35%, transparent)', backgroundColor: 'var(--tm-danger-subtle)' }}
    >
      <div>
        <p className="text-sm font-semibold text-text-primary">Remove Canvas?</p>
        <p className="text-sm text-text-secondary mt-1">
          kanso permanently deletes your token right away. Nothing goes to Recently deleted. To stop the token working
          everywhere, also delete it in Canvas under Approved Integrations.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void handleRemove()}
          disabled={busy !== null}
          className="btn text-sm py-2 text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--tm-danger)' }}
        >
          {busy === 'remove' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Remove permanently
        </button>
        <button type="button" onClick={() => setMode('view')} disabled={busy === 'remove'} className="btn btn-outline text-sm py-2">
          Cancel
        </button>
      </div>
    </div>
  );

  const removeButton = (label: string) => (
    <button
      type="button"
      onClick={() => { setNotice(null); setMode('remove'); }}
      className="btn text-sm py-2 ml-auto hover:bg-[var(--tm-danger-subtle)]"
      style={{ color: 'var(--tm-danger)' }}
    >
      <Trash2 className="w-4 h-4" /> {label}
    </button>
  );

  if (view === 'invalid') {
    const rejectedOn = connection.last_error_at ? ` on ${formatDate(connection.last_error_at)}` : '';
    return (
      <div className="space-y-4">
        {noticeEl}
        <Banner tone="danger" icon={KeyRound}>
          <p>
            <strong className="font-semibold">
              {isExpired(connection, now) ? 'Your Canvas token expired.' : `Canvas stopped accepting your token${rejectedOn}.`}
            </strong>{' '}
            It expired or was deleted in Canvas. Paste a new token to reconnect. Your course choices are kept.
          </p>
        </Banner>
        <ConnectionCard connection={connection} now={now} />
        {mode === 'remove' ? removeConfirm : <>
          <h3 className="text-xs font-medium text-text-muted">Reconnect Canvas</h3>
          <HowToGetToken open={false} />
          <CanvasTokenForm mode="reconnect" defaultUrl={connection.base_url ?? ''} onSubmit={handleConnect} />
          <div className="flex">{removeButton('Remove instead')}</div>
        </>}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {noticeEl}
      {view === 'expiring' && (
        <Banner tone="warning" icon={Clock}>
          <p>
            <strong className="font-semibold">Your token expires {formatDate(connection.token_expires_at!)}.</strong>{' '}
            Many schools cap student tokens at about 90 days, so make a new one and replace it before then.
          </p>
        </Banner>
      )}
      {view === 'error' && (
        <Banner tone="warning" icon={AlertTriangle}>
          <p>
            <strong className="font-semibold">kanso couldn&apos;t reach Canvas the last time it checked.</strong>{' '}
            Your token is still saved. Press Test to try again.
          </p>
        </Banner>
      )}
      <ConnectionCard connection={connection} now={now} />

      {mode === 'remove' && removeConfirm}
      {mode === 'replace' && <>
        <h3 className="text-xs font-medium text-text-muted">Replace token</h3>
        <p className="text-sm text-text-secondary">Paste a new token. kanso checks it with Canvas before swapping it in.</p>
        <HowToGetToken open={false} />
        <CanvasTokenForm
          mode="replace"
          defaultUrl={connection.base_url ?? ''}
          onSubmit={handleConnect}
          onCancel={() => setMode('view')}
        />
      </>}
      {mode === 'view' && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void handleTest()} disabled={busy !== null} className="btn btn-secondary text-sm py-2 disabled:opacity-60">
            {busy === 'test' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {busy === 'test' ? 'Testing…' : 'Test'}
          </button>
          <button
            type="button"
            onClick={() => { setNotice(null); setMode('replace'); }}
            className={`btn text-sm py-2 ${view === 'expiring' ? 'btn-primary' : 'btn-outline'}`}
          >
            <KeyRound className="w-4 h-4" /> Replace
          </button>
          {removeButton('Remove')}
        </div>
      )}

      {visibleCourses && (
        <CoursesToShow
          courses={visibleCourses}
          hidden={connection.hidden_course_ids}
          disabled={busy !== null}
          onToggle={courseId => void handleToggleCourse(courseId)}
        />
      )}
      <SecurityNote />
    </div>
  );
};

export default CanvasIntegrationSection;
