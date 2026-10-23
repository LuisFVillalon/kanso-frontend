'use client';

/**
 * The home page's Canvas panel: what's due over the next 7 days or
 * everything coming, the user's classes (with a token, each with its grade
 * and opening its modules, assignments and grades) and announcements, read
 * through the backend's Canvas proxy (hooks/useCanvas.ts). Add to tasks opens
 * a tag picker (CanvasAddSheet) that starts with the class's tags. It also
 * covers every state the connection can be in: not connected, the first
 * load, a rejected or expired token or a rejected feed link (reconnect), a
 * token expiring soon, Canvas busy or down (older saved data, dimmed), and
 * no active courses. Demo sandboxes see the backend's read-only sample data
 * and no connect prompts.
 *
 * A calendar feed connection has due dates only, so the panel shows Upcoming
 * and Classes (found in the due dates) and simply leaves out what only a
 * token can show.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock, CalendarSync, CircleX, ClockAlert, CloudOff, ExternalLink, GraduationCap, KeyRound, Library,
  Loader2, Megaphone, Plug, PlugZap, RefreshCw, type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '@/app/context/ToastContext';
import { useCanvas } from '@/app/hooks/useCanvas';
import type { CanvasAddToTasks } from '@/app/hooks/useCanvasAddToTasks';
import { useCanvasCourseTags } from '@/app/hooks/useCanvasCourseTags';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import { canvasView } from '@/app/components/settings/CanvasIntegrationSection';
import {
  canvasCan, canvasClasses, canvasConnectionType, courseColor, formatShortDate, formatTime, syncedLabel, type CanvasClass,
} from '@/app/utils/canvas';
import { canvasClassTag, rememberCanvasCourseLabels, rememberedCourseLabel } from '@/app/utils/canvasTasks';
import type { CanvasCapability, CanvasItem, CanvasRange } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import type { CanvasRowAdd, CourseLookup } from './CanvasItemRow';
import CanvasUpcoming from './CanvasUpcoming';
import CanvasClasses from './CanvasClasses';
import CanvasCourseDetail from './CanvasCourseDetail';
import CanvasAnnouncements from './CanvasAnnouncements';
import CanvasAddSheet from './CanvasAddSheet';

type Tab = 'upcoming' | 'classes' | 'announcements';

const TABS: { key: Tab; label: string; icon: LucideIcon; needs: CanvasCapability }[] = [
  { key: 'upcoming', label: 'Upcoming', icon: CalendarClock, needs: 'upcoming' },
  { key: 'classes', label: 'Classes', icon: Library, needs: 'upcoming' },
  { key: 'announcements', label: 'Announcements', icon: Megaphone, needs: 'announcements' },
];

const RANGE_KEY = 'tm-canvas-range';
const isRange = (v: unknown): v is CanvasRange => v === 'week' || v === 'all';

/** The tag picker's job: adding an item to tasks, or choosing a class's tags. */
type Sheet =
  | { mode: 'add'; item: CanvasItem; classLabel: string | null; courseId: number | null }
  | { mode: 'class'; item: null; classLabel: string; courseId: number };

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const DAY_MS = 24 * 60 * 60 * 1000;
// "Synced N min ago" moves on without a refetch.
const CLOCK_TICK_MS = 30 * 1000;

const hostOf = (baseUrl: string | null) => (baseUrl ?? '').replace(/^https:\/\//, '');

const Banner: React.FC<{
  tone: 'warning' | 'info';
  icon: LucideIcon;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ tone, icon: Icon, action, children }) => (
  <div
    role="status"
    className="flex gap-2 items-start px-3 py-2 mb-2.5 rounded-[10px] text-xs text-text-primary"
    style={{ backgroundColor: tone === 'warning' ? 'var(--tm-warning-subtle)' : 'var(--tm-accent-subtle)' }}
  >
    <Icon className="w-3.5 h-3.5 shrink-0 mt-px" style={{ color: tone === 'warning' ? 'var(--tm-warning)' : 'var(--tm-accent)' }} />
    <div className="flex-1 min-w-0">{children}</div>
    {action}
  </div>
);

const EmptyState: React.FC<{
  icon: LucideIcon;
  tone?: 'danger';
  title: string;
  children: React.ReactNode;
}> = ({ icon: Icon, tone, title, children }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2.5 px-6 py-8">
    <div
      className="w-12 h-12 rounded-xl flex items-center justify-center"
      style={tone === 'danger'
        ? { backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }
        : { backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-muted)' }}
    >
      <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-base font-semibold text-text-primary">{title}</h3>
    {children}
  </div>
);

const Skeleton: React.FC = () => (
  <div className="flex-1 px-3.5 py-3" aria-label="Loading Canvas" aria-busy="true">
    <div className="h-3 w-2/5 mb-2.5 rounded-lg animate-shimmer" />
    {[0, 1, 2, 3].map(i => (
      <div key={i} className="flex gap-2.5 mb-2.5">
        <div className="w-7 h-7 rounded-lg animate-shimmer" />
        <div className="flex-1">
          <div className="h-3 w-3/4 mb-1.5 rounded-lg animate-shimmer" />
          <div className="h-2.5 w-[45%] rounded-lg animate-shimmer" />
        </div>
      </div>
    ))}
    <div className="h-3 w-[30%] mt-4 mb-2.5 rounded-lg animate-shimmer" />
    {[0, 1].map(i => <div key={i} className="h-16 mb-2 rounded-xl animate-shimmer" />)}
  </div>
);

interface CanvasPanelProps {
  /** User-adjustable panel height in px, shared with Tasks and Notes. */
  heightPx?: number | null;
  /** Opens Settings on the Canvas page, where Canvas is connected. */
  onOpenSettings: () => void;
  /** Bumped by the parent to reload, e.g. after Settings closes. */
  syncToken?: number;
  /** "Add to tasks" on Upcoming and course assignment rows, through the tag picker; left out, the rows offer nothing. */
  addToTasks?: CanvasAddToTasks;
  /** Called when the user refreshes the panel, so tasks added from Canvas sync too. */
  onRefresh?: () => void;
}

const CanvasPanel: React.FC<CanvasPanelProps> = ({ heightPx, onOpenSettings, syncToken, addToTasks, onRefresh }) => {
  const { isDemo } = useAuth();
  const showToast = useToast();
  const canvas = useCanvas({ isDemo, syncToken });
  const { status, connection, overview, courses, announcements, loadAnnouncements } = canvas;
  const [selectedTab, setTab] = useState<Tab>('upcoming');
  const [openCourseId, setOpenCourseId] = useState<number | null>(null);
  const [range, setRange] = usePersistedPref<CanvasRange>(RANGE_KEY, 'all', isRange);
  const [classFilter, setClassFilter] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  // Demo sandboxes read the sample data a token would.
  const can = (capability: CanvasCapability) => isDemo || !connection || canvasCan(connection, capability);
  const feed = !isDemo && !!connection?.connected && canvasConnectionType(connection) === 'feed';
  const tabs = TABS.filter(t => can(t.needs));
  const withCourses = can('courses');
  // A tab the connection lost (a token swapped for the feed) falls back to Upcoming.
  const tab = tabs.some(t => t.key === selectedTab) ? selectedTab : 'upcoming';
  const adding = can('link_tasks') ? addToTasks : undefined;
  const courseTags = useCanvasCourseTags(!!adding && status === 'ready');

  // Task cards added from Canvas name their course from these; the feed has
  // no course list, only each item's course code, which fills in courses a
  // token's list never named but doesn't replace their codes.
  useEffect(() => {
    if (courses) {
      rememberCanvasCourseLabels(courses.courses);
    } else if (feed && overview) {
      rememberCanvasCourseLabels([
        ...(canvas.classes?.classes ?? []).map(c => ({ id: c.id, name: c.code, course_code: null })),
        ...[...overview.missing, ...overview.upcoming].flatMap(i =>
          i.course_id != null && i.course_name ? [{ id: i.course_id, name: i.course_name, course_code: null }] : []),
      ], { onlyNew: true });
    }
  }, [courses, feed, overview, canvas.classes]);

  const refresh = () => {
    void canvas.refresh();
    onRefresh?.();
  };

  const classes: CanvasClass[] = useMemo(() => canvasClasses({
    summaries: canvas.classes?.classes ?? null,
    courses: courses?.courses ?? null,
    items: [...(overview?.missing ?? []), ...(overview?.upcoming ?? [])],
    hiddenIds: isDemo ? [] : connection?.hidden_course_ids ?? [],
    labelOf: rememberedCourseLabel,
  }), [canvas.classes, courses, overview, isDemo, connection]);
  const shownClasses = classes.filter(c => !c.hidden);
  const noClasses = !!courses && courses.courses.length === 0 && classes.length === 0;
  // Classes take their colors by their place in the class list, hidden ones last.
  const courseIds = useMemo(() => classes.map(c => c.id), [classes]);
  const lookup: CourseLookup = useCallback(courseId => {
    const found = classes.find(c => c.id === courseId);
    return { label: found?.label ?? null, color: courseColor(courseId, courseIds) };
  }, [classes, courseIds]);
  // A class hidden (or gone) while the list is narrowed to it shows every class again.
  const filter = classFilter != null && shownClasses.some(c => c.id === classFilter) ? classFilter : null;

  const openTab = (next: Tab) => {
    setTab(next);
    setOpenCourseId(null);
    if (next === 'announcements') loadAnnouncements();
  };

  // ── Add to tasks, through the tag picker ──
  /** The tags a class's tasks start with: the user's choice, else the class's Canvas tag. */
  const startingTags = (courseId: number | null, classLabel: string | null): { tags: Tag[]; chosen: boolean } => {
    const chosen = courseId != null ? courseTags.tagsOf(courseId) : null;
    if (chosen) return { tags: chosen, chosen: true };
    const tag = canvasClassTag(classLabel, adding?.tags ?? []);
    return { tags: tag ? [tag] : [], chosen: false };
  };
  const rowAdd: CanvasRowAdd | undefined = adding && {
    stateOf: adding.stateOf,
    open: (item, classLabel) => setSheet({ mode: 'add', item, classLabel, courseId: item.course_id }),
  };

  /** New tags (id 0) become real ones, so a class's choice can name them by id; null if one couldn't be made. */
  const createNewTags = async (tags: Tag[]): Promise<Tag[] | null> => {
    const made: Tag[] = [];
    for (const tag of tags) {
      const existing = tag.id === 0 ? adding!.tags.find(t => sameName(t.name, tag.name)) : tag;
      const real = existing ?? await adding!.createTag({ name: tag.name, color: tag.color });
      if (!real) return null;
      made.push(real);
    }
    return made;
  };

  const confirmSheet = async (tags: Tag[], remember: boolean) => {
    if (!sheet || !adding) return;
    if (sheet.mode === 'add') {
      const created = await adding.add(sheet.item, tags);
      if (created && sheet.courseId != null) {
        const hadChoice = !!courseTags.tagsOf(sheet.courseId);
        // The backend made any new tag with the task; the class's choice names them as it did.
        if (remember && tags.length) {
          const saved = tags.map(t => created.tags.find(c => sameName(c.name, t.name)) ?? t).filter(t => t.id !== 0);
          await courseTags.save(sheet.courseId, saved);
        } else if (!remember && hadChoice) {
          await courseTags.save(sheet.courseId, []);
        }
      }
      setSheet(null);
      return;
    }
    const made = await createNewTags(tags);
    if (!made) return;
    if (await courseTags.save(sheet.courseId, made)) {
      showToast(`${sheet.classLabel} tasks will start with ${made.map(t => t.name).join(', ')}.`, 'success');
      setSheet(null);
    }
  };

  const toggleHidden = async (c: CanvasClass) => {
    if (!(await canvas.setClassHidden(c.id, !c.hidden))) {
      showToast(c.hidden ? `Couldn't show ${c.label} again. Please try again.` : `Couldn't hide ${c.label}. Please try again.`);
    }
  };

  const seeDueDates = (courseId: number) => {
    setClassFilter(courseId);
    setRange('all');
    setTab('upcoming');
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  const view = connection ? canvasView(connection, now) : null;
  const expired = !!connection?.token_expires_at && new Date(connection.token_expires_at) <= now;
  const stale = !!(overview?.stale || courses?.stale || (tab === 'announcements' && announcements?.stale));
  const busy = !!(overview?.busy || courses?.busy || (tab === 'announcements' && announcements?.busy));
  const unread = announcements?.announcements.filter(a => a.read === false).length ?? 0;

  const host = isDemo ? 'Sample data · read-only' : status === 'not-connected' ? 'Not connected' : hostOf(connection?.base_url ?? null);

  let sync: React.ReactNode = null;
  if (status === 'loading' || canvas.refreshing) {
    sync = <><Loader2 className="w-3 h-3 animate-spin" />Syncing…</>;
  } else if (status === 'reconnect') {
    sync = <><CircleX className="w-3 h-3" />Sync stopped</>;
  } else if (status === 'ready' && overview) {
    sync = stale
      ? <><CloudOff className="w-3 h-3" />Last synced {formatTime(overview.fetched_at)}</>
      : syncedLabel(overview.fetched_at, now);
  }

  const refreshButton = (label: string, className: string) => (
    <button
      type="button"
      onClick={refresh}
      disabled={!canvas.canRefresh}
      title={canvas.canRefresh ? 'Fetch the latest from Canvas' : 'Just refreshed. You can refresh again in a moment.'}
      className={className}
    >
      {label}
    </button>
  );

  let body: React.ReactNode;
  if (status === 'loading') {
    body = <Skeleton />;
  } else if (status === 'not-connected') {
    body = (
      <EmptyState icon={GraduationCap} title="See your classes next to your tasks">
        <p className="text-[13px] text-text-secondary max-w-[340px]">
          Connect Canvas to see what&apos;s due and add it to your tasks. Your Canvas calendar feed link takes a
          minute to copy and needs no approval from your school.
        </p>
        <button type="button" onClick={onOpenSettings} className="btn btn-primary">
          <Plug className="w-4 h-4" />Connect Canvas
        </button>
        <p className="text-xs text-text-muted">kanso only reads from Canvas. It never submits or changes anything.</p>
      </EmptyState>
    );
  } else if (status === 'reconnect' && feed) {
    const rejectedOn = connection?.last_error_at ? ` on ${formatShortDate(connection.last_error_at)}` : '';
    body = (
      <EmptyState icon={CalendarSync} tone="danger" title="Your Canvas calendar feed stopped working">
        <p className="text-[13px] text-text-secondary max-w-[340px]">
          Canvas stopped serving the feed link{rejectedOn}. Copy the current link from Canvas under Calendar, then
          Calendar Feed, and paste it in to pick up where you left off.
        </p>
        <button type="button" onClick={onOpenSettings} className="btn btn-primary">
          <PlugZap className="w-4 h-4" />Reconnect Canvas
        </button>
      </EmptyState>
    );
  } else if (status === 'reconnect') {
    const rejectedOn = connection?.last_error_at ? ` on ${formatShortDate(connection.last_error_at)}` : '';
    body = (
      <EmptyState icon={KeyRound} tone="danger" title="Your Canvas token stopped working">
        <p className="text-[13px] text-text-secondary max-w-[340px]">
          {expired
            ? `The token expired on ${formatShortDate(connection!.token_expires_at!)}.`
            : `Canvas rejected the token${rejectedOn}. It probably expired or was deleted in Canvas.`}
          {' '}Create a new one and paste it in to pick up where you left off.
        </p>
        <button type="button" onClick={onOpenSettings} className="btn btn-primary">
          <PlugZap className="w-4 h-4" />Reconnect Canvas
        </button>
      </EmptyState>
    );
  } else if (status === 'error' || !overview || (withCourses && !courses)) {
    body = (
      <EmptyState icon={CloudOff} title="Canvas couldn't load">
        <p className="text-[13px] text-text-secondary max-w-[340px]">{canvas.error}</p>
        {refreshButton('Retry', 'btn btn-outline')}
      </EmptyState>
    );
  } else if (noClasses) {
    body = (
      <EmptyState icon={Library} title="No active courses">
        <p className="text-[13px] text-text-secondary max-w-[340px]">
          Canvas doesn&apos;t list you in any current courses. Once next term&apos;s courses are published, they&apos;ll show up here on their own.
        </p>
      </EmptyState>
    );
  } else {
    let content: React.ReactNode;
    if (tab === 'upcoming') {
      content = (
        <CanvasUpcoming
          overview={overview}
          course={lookup}
          now={now}
          addToTasks={rowAdd}
          range={range}
          onRangeChange={setRange}
          classes={shownClasses}
          classFilter={filter}
          onClassFilterChange={setClassFilter}
          onShowHiddenClasses={classes.length > 0 && shownClasses.length === 0 ? () => openTab('classes') : undefined}
        />
      );
    } else if (tab === 'classes') {
      const openCourse = openCourseId != null ? courses?.courses.find(c => c.id === openCourseId) ?? null : null;
      content = openCourse ? (
        <CanvasCourseDetail
          key={openCourse.id}
          course={openCourse}
          color={courseColor(openCourse.id, courseIds)}
          lookup={lookup}
          now={now}
          refreshNonce={canvas.refreshNonce}
          onFail={canvas.fail}
          onBack={() => setOpenCourseId(null)}
          addToTasks={rowAdd}
        />
      ) : (
        <CanvasClasses
          classes={classes}
          items={[...overview.missing, ...overview.upcoming]}
          colorOf={id => courseColor(id, courseIds)}
          now={now}
          addToTasks={rowAdd}
          classTags={adding && {
            tagsOf: c => startingTags(c.id, c.label).tags,
            chosen: c => startingTags(c.id, c.label).chosen,
            onEdit: c => setSheet({ mode: 'class', item: null, classLabel: c.label, courseId: c.id }),
          }}
          onSeeDueDates={seeDueDates}
          onToggleHidden={isDemo || !connection ? undefined : c => void toggleHidden(c)}
          onOpenCourse={can('courses') ? setOpenCourseId : undefined}
          feed={feed}
        />
      );
    } else if (announcements) {
      content = <CanvasAnnouncements announcements={announcements.announcements} course={lookup} />;
    } else if (canvas.announcementsError) {
      content = (
        <div className="text-sm text-text-secondary space-y-2">
          <p>{canvas.announcementsError}</p>
          <button type="button" onClick={loadAnnouncements} className="btn btn-outline">Retry</button>
        </div>
      );
    } else {
      content = (
        <div className="space-y-2" aria-label="Loading">
          {[0, 1, 2].map(i => <div key={i} className="h-16 rounded-[10px] animate-shimmer" />)}
        </div>
      );
    }
    const days = view === 'expiring' ? Math.ceil((new Date(connection!.token_expires_at!).getTime() - now.getTime()) / DAY_MS) : 0;
    body = (
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 pt-3 pb-4 scrollbar-custom">
        {view === 'expiring' && (
          <Banner
            tone="info"
            icon={ClockAlert}
            action={<button type="button" onClick={onOpenSettings} className="btn btn-secondary px-2 py-1 text-xs">Replace</button>}
          >
            <b className="font-semibold">Your Canvas token expires {days <= 1 ? 'within a day' : `in ${days} days`}</b>
            {' '}({formatShortDate(connection!.token_expires_at!)}). Make a new one before then so Canvas keeps syncing.
          </Banner>
        )}
        {stale && (
          <Banner tone="warning" icon={CloudOff} action={refreshButton('Retry', 'btn btn-outline px-2 py-1 text-xs')}>
            <b className="font-semibold">{busy ? 'Canvas is busy right now.' : "Canvas isn't responding right now."}</b>
            {' '}Showing what kanso saved at {formatTime(overview.fetched_at)}.
          </Banner>
        )}
        {canvas.refreshError && !stale && (
          <Banner tone="warning" icon={CloudOff}>
            <b className="font-semibold">Couldn&apos;t refresh.</b> {canvas.refreshError}
          </Banner>
        )}
        <div className={stale ? 'opacity-60 saturate-[.6]' : undefined}>{content}</div>
      </div>
    );
  }

  const showTabs = tabs.length > 1 && (isDemo || !!connection)
    && (status === 'loading' || (status === 'ready' && (!withCourses || (!!courses && !noClasses))));

  return (
    <div
      data-canvas-status={status}
      className="card-glass relative flex flex-col overflow-hidden h-[50vh] lg:h-[600px]"
      data-panel-body
      style={heightPx ? { height: `${heightPx}px` } : undefined}
    >
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5 border-b border-border-subtle">
        <GraduationCap className="w-4 h-4 shrink-0 text-text-secondary" />
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Canvas</span>
        <span className="text-xs text-text-muted truncate min-w-0">{host}</span>
        <span className="ml-auto flex items-center gap-1 text-[11px] text-text-muted whitespace-nowrap" data-testid="canvas-sync">
          {sync}
        </span>
        {status === 'ready' && (
          <button
            type="button"
            onClick={refresh}
            disabled={!canvas.canRefresh}
            aria-label="Refresh Canvas"
            title={canvas.canRefresh ? 'Fetch the latest from Canvas' : 'Just refreshed. You can refresh again in a moment.'}
            className="btn btn-ghost p-1 text-text-muted hover:text-text-primary disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${canvas.refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
        {!isDemo && connection?.base_url && status !== 'not-connected' && (
          <a
            href={connection.base_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Canvas"
            title="Open Canvas"
            className="btn btn-ghost p-1 text-text-muted hover:text-text-primary"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {showTabs && (
        <div role="tablist" aria-label="Canvas" className="flex gap-1 px-3.5 py-2 border-b border-border-subtle overflow-x-auto overscroll-x-contain scrollbar-custom">
          {tabs.map(({ key, label, icon: Icon }) => {
            const selected = tab === key;
            const count = key === 'upcoming' ? overview?.missing.length ?? 0 : key === 'announcements' ? unread : 0;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={status !== 'ready'}
                onClick={() => openTab(key)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors duration-150 hover:bg-surface-raised"
                style={selected
                  ? { backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }
                  : { color: 'var(--tm-text-secondary)' }}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {count > 0 && (
                  <span
                    className="text-[10px] font-bold px-1.5 rounded-full"
                    style={key === 'upcoming'
                      ? { backgroundColor: 'var(--tm-slipped-subtle)', color: 'var(--tm-slipped-text)' }
                      : { backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
                    aria-label={key === 'upcoming' ? `${count} slipped` : `${count} unread`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {body}

      {sheet && adding && status === 'ready' && (() => {
        const start = startingTags(sheet.courseId, sheet.classLabel);
        return (
          <CanvasAddSheet
            key={sheet.mode === 'add' ? `item-${sheet.item.kind}-${sheet.item.id}` : `class-${sheet.courseId}`}
            mode={sheet.mode}
            item={sheet.item}
            classLabel={sheet.classLabel}
            tags={adding.tags}
            initial={start.tags}
            fromDefaults={start.chosen}
            canRemember={sheet.courseId != null}
            now={now}
            onClose={() => setSheet(null)}
            onConfirm={confirmSheet}
          />
        );
      })()}
    </div>
  );
};

export default CanvasPanel;
