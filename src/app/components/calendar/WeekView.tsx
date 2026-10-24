'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, ChevronLeft, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useToast } from '@/app/context/ToastContext';
import { useAppShell } from '@/app/context/AppShellContext';
import { useWeekActivity } from '@/app/hooks/useWeekActivity';
import { occurrenceDayLabel, useEventActions } from '@/app/hooks/useEventActions';
import { fetchEvent } from '@/app/lib/backend-api';
import type { BaseTaskForm, LinkedTaskRef, Tag, Task } from '@/app/types/task';
import type { CalendarEvent, EditScope, EventOccurrence } from '@/app/types/event';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import NewTaskModal from '@/app/components/task/NewTaskModal';
import EditTaskModal from '@/app/components/task/EditTaskModal';
import HabitHistoryModal from '@/app/components/habit/HabitHistoryModal';
import EventCard from '@/app/components/event/EventCard';
import EventFormModal, { type EventFormContext } from '@/app/components/event/EventFormModal';
import EventScopeDialog, { type EventAction } from '@/app/components/event/EventScopeDialog';
import WeekQuickAdd, { type QuickAddDraft, type QuickAddValues } from '@/app/components/event/WeekQuickAdd';
import DragHandle from '@/app/components/common/DragHandle';
import { useResizableSplit } from '@/app/hooks/useResizableSplit';
import { DEFAULT_DAY_END, DEFAULT_DAY_START } from '@/app/lib/restDays';
import { formatDateRange, toLocalDateStr } from '@/app/utils/dateUtils';
import { applyNewTaskForm, taskToEditForm } from '@/app/utils/taskUtils';
import {
  allowedEditScopes,
  blankEventForm,
  editBody,
  editIsEmpty,
  eventFormEdit,
  eventFormFromOccurrence,
  eventFormToCreate,
  type EventFormValues,
} from '@/app/utils/events';
import {
  addDays,
  buildWeekEvents,
  type EventPlacement,
  minutesToTimeStr,
  parseTimeToMinutes,
  startOfWeek,
  weekDays,
  workDayMarks,
  type WindowMinutes,
} from '@/app/utils/weekLayout';
import WeekGrid, { WEEK_LEGEND } from './WeekGrid';

// Tallest a dragged week view gets, in px.
const MAX_HEIGHT_PX = 2400;
// Half the drag handle, so the view's bottom edge follows the pointer.
const HANDLE_HALF_PX = 4;

interface WeekViewProps {
  /** Fill the parent's height; the hour grid scrolls in whatever room the toolbar leaves. */
  fill?: boolean;
  /** The view's dragged height in px, or null for its default. It never gets shorter than the default. */
  heightPx?: number | null;
  /** Shows a drag handle under the grid; called with the new height as it's dragged. */
  onResize?: (heightPx: number) => void;
  /** Called when a drag ends. */
  onResizeEnd?: () => void;
}

const emptyTaskForm = (): BaseTaskForm => ({
  id: 0,
  title: '',
  description: '',
  priority: null,
  due_date: '',
  due_time: '',
  tags: [],
  category: null,
  estimated_time: null,
  reminder_minutes: null,
  created_date: '',
});

const toMinutesOr = (time: string, fallback: string): number =>
  parseTimeToMinutes(time) ?? parseTimeToMinutes(fallback)!;

/** The current time, refreshed every minute for the now-line. */
const useMinuteClock = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
};

/** "Oct 19–25, 2026"; a week spanning New Year names both years: "Dec 28, 2026 – Jan 3, 2027". */
const weekLabel = (start: Date, end: Date): string => {
  if (start.getFullYear() === end.getFullYear()) return `${formatDateRange(start, end)}, ${end.getFullYear()}`;
  const label = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${label(start)} – ${label(end)}`;
};

const toggleById = (tags: Tag[], tag: Tag): Tag[] =>
  tags.some(t => t.id === tag.id) ? tags.filter(t => t.id !== tag.id) : [...tags, tag];

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The event modal: a new event from a preset form, or an edit of one occurrence of a series. */
type EventFormState =
  | { mode: 'new'; initial: EventFormValues }
  | { mode: 'edit'; initial: EventFormValues; occurrence: EventOccurrence; series: CalendarEvent };

/** The open "which events?" question, and what to do with the answer. */
interface ScopeQuestion {
  action: EventAction;
  occurrence: EventOccurrence;
  repeating: boolean;
  allowed?: EditScope[];
  hint?: string;
  onConfirm: (scope: EditScope) => void;
  onCancel?: () => void;
}

/**
 * Google Calendar–style week: events, planned tasks, completions, note
 * sessions and habit completions for one Sunday–Saturday week, with
 * prev/next/Today navigation. Clicking an empty slot opens a quick-add set to
 * a task at that time, and dragging out a range opens it set to an event
 * there; either can switch, or open the full form. Clicking an event opens its
 * card (edit, archive, restore, delete, asking which occurrences for a
 * repeating one); clicking another item opens it (task edit modal, the note,
 * or the habit's history).
 *
 * Planned tasks come from TasksContext rather than the activity response's
 * scheduled_tasks, so a task created or edited here moves on the grid the
 * moment the save succeeds, without waiting on a refetch. Events,
 * completions, note sessions and habit completions come from GET
 * /get-calendar-activity, refetched after each event change.
 *
 * Each day shows the user's work schedule from Settings → Work day and rest
 * (rest days, and when the daily window opens and closes), read from the app
 * shell's profile so it follows changes there straight away.
 *
 * With `fill`, the view takes its parent's height and the hour grid scrolls in
 * whatever room the toolbar leaves. With `onResize`, a handle under the grid
 * drags the view taller; the parent keeps the height (`heightPx`).
 */
const WeekView: React.FC<WeekViewProps> = ({ fill = false, heightPx = null, onResize, onResizeEnd }) => {
  const router = useRouter();
  const showToast = useToast();
  const now = useMinuteClock();
  const { tasks, addTask, updateTask, saveLinkedTasks } = useTasksContext();
  const { tags } = useTagsContext();
  const { habits, toggleDate: toggleHabitDate } = useHabitsContext();

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const { activity, loading, error, refetch } = useWeekActivity(weekStart);

  const [scrollKey, setScrollKey] = useState(0);
  const [newTask, setNewTask] = useState<BaseTaskForm>(emptyTaskForm);
  const [showNewTask, setShowNewTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [historyHabitId, setHistoryHabitId] = useState<number | null>(null);
  const [quickAdd, setQuickAdd] = useState<{ draft: QuickAddDraft; anchor: DOMRect } | null>(null);
  const [card, setCard] = useState<{ event: EventPlacement; anchor: DOMRect } | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  const [eventForm, setEventForm] = useState<EventFormState | null>(null);
  const [scopeQuestion, setScopeQuestion] = useState<ScopeQuestion | null>(null);
  const eventActions = useEventActions(refetch);

  const rootRef = useRef<HTMLDivElement>(null);
  const handleResize = useCallback(
    (px: number) => onResize?.(Math.min(MAX_HEIGHT_PX, Math.max(0, Math.round(px + HANDLE_HALF_PX)))),
    [onResize],
  );
  const handleResizingChange = useCallback((resizing: boolean) => { if (!resizing) onResizeEnd?.(); }, [onResizeEnd]);
  const handleResizePointerDown = useResizableSplit(rootRef, {
    anchor: 'top',
    onResize: handleResize,
    onResizingChange: handleResizingChange,
  });

  const shell = useAppShell();
  const { dayStartTime, shutoffTime, restDays, dayWindows } = shell.profileState.profile;
  const dayStartMinutes = toMinutesOr(dayStartTime, DEFAULT_DAY_START);
  const dayEndMinutes = toMinutesOr(shutoffTime, DEFAULT_DAY_END);

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const windowOn = useCallback((weekday: number): WindowMinutes => {
    const own = dayWindows?.[String(weekday)];
    return own
      ? [toMinutesOr(own.start, DEFAULT_DAY_START), toMinutesOr(own.end, DEFAULT_DAY_END)]
      : [dayStartMinutes, dayEndMinutes];
  }, [dayWindows, dayStartMinutes, dayEndMinutes]);
  const workDays = useMemo(() => days.map(day => workDayMarks(day, restDays, windowOn)), [days, restDays, windowOn]);
  const todayStr = toLocalDateStr(now);
  // The current term, for "repeat until the end of term"; the placeholder (id 0) doesn't count.
  const settings = shell.calendarSettingsState?.calendarSettings;
  const term = settings?.id && settings.end_date && settings.end_date >= todayStr
    ? { title: settings.title, endDate: settings.end_date }
    : null;
  const todayIndex = days.findIndex(d => toLocalDateStr(d) === todayStr);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Open near the current time on this week, at the user's day start otherwise.
  const scrollToMinutes = todayIndex >= 0 ? Math.max(0, nowMinutes - 90) : dayStartMinutes;

  const { timed, allDay } = useMemo(() => buildWeekEvents({
    weekStart,
    scheduledTasks: tasks,
    completedTasks: activity?.completed_tasks ?? [],
    noteSessions: activity?.note_sessions ?? [],
    habitCompletions: activity?.habit_completions ?? [],
    events: activity?.events ?? [],
    now,
  }), [weekStart, tasks, activity, now]);

  const taskIds = useMemo(() => new Set(tasks.map(t => t.id)), [tasks]);
  const habitIds = useMemo(() => new Set(habits.map(h => h.id)), [habits]);
  const activeTaskCount = useMemo(() => tasks.filter(t => !t.completed).length, [tasks]);
  const occupiedPriorityLevels = useMemo(
    () => tasks.filter(t => !t.completed && t.priority != null).map(t => t.priority as number),
    [tasks],
  );
  const historyHabit = habits.find(h => h.id === historyHabitId) ?? null;

  const goToWeek = (offset: number) => setWeekStart(prev => addDays(prev, offset * 7));
  const goToToday = () => {
    setWeekStart(startOfWeek(new Date()));
    setScrollKey(k => k + 1);
  };

  const openNewTaskAt = (day: Date, minutes: number | null, fields: Partial<BaseTaskForm> = {}) => {
    setNewTask({
      ...emptyTaskForm(),
      due_date: toLocalDateStr(day),
      due_time: minutes === null ? '' : minutesToTimeStr(minutes),
      ...fields,
    });
    setShowNewTask(true);
  };

  // ── Events ──

  const events = useMemo(() => activity?.events ?? [], [activity]);
  const formContext = (editingId?: number): EventFormContext => ({
    restDays,
    windowOn,
    others: editingId === undefined ? events : events.filter(e => e.event_id !== editingId),
    term,
  });

  /** The new-event form for a range on `day`, with what a quick-add filled in. */
  const newEventForm = (day: Date, startMin: number, endMin: number, values?: Omit<QuickAddValues, 'kind'>) => blankEventForm({
    date: toLocalDateStr(day),
    startTime: minutesToTimeStr(startMin),
    endTime: minutesToTimeStr(endMin % (24 * 60)),
    title: values?.title ?? '',
    tags: values?.tags ?? [],
    repeat: values?.repeat ?? false,
    termEnd: term?.endDate ?? null,
  });

  const openNewEvent = () => {
    // Today on this week, else the week's first day; at the next full hour from now or the day's start.
    const day = todayIndex >= 0 ? days[todayIndex] : days[0];
    const start = todayIndex >= 0 ? Math.min(23 * 60, (now.getHours() + 1) * 60) : dayStartMinutes;
    setEventForm({ mode: 'new', initial: newEventForm(day, start, Math.min(24 * 60 - 1, start + 60)) });
  };

  const handleQuickAddSave = async (values: QuickAddValues): Promise<boolean> => {
    if (!quickAdd) return false;
    const { day, startMin, endMin } = quickAdd.draft;
    if (values.kind === 'task') {
      const task = await addTask({
        ...emptyTaskForm(),
        title: values.title.trim(),
        due_date: toLocalDateStr(day),
        due_time: minutesToTimeStr(startMin),
        estimated_time: (endMin - startMin) / 60,
        tags: values.tags,
      });
      return !!task;
    }
    const form = newEventForm(day, startMin, endMin, values);
    return eventActions.create(eventFormToCreate(form, browserTimeZone(), term?.endDate ?? null));
  };

  const handleQuickAddMore = (values: QuickAddValues) => {
    if (!quickAdd) return;
    const { day, startMin, endMin } = quickAdd.draft;
    setQuickAdd(null);
    if (values.kind === 'task') {
      openNewTaskAt(day, startMin, { title: values.title, tags: values.tags, estimated_time: (endMin - startMin) / 60 });
    } else {
      setEventForm({ mode: 'new', initial: newEventForm(day, startMin, endMin, values) });
    }
  };

  /** Asks which occurrences when the event repeats (or to confirm a delete), then runs `act` with the answer. */
  const withScope = (action: EventAction, o: EventOccurrence, act: (scope: EditScope) => void) => {
    const repeating = o.repeat_days.length > 0;
    if (!repeating && action !== 'delete') return act('all');
    setScopeQuestion({ action, occurrence: o, repeating, onConfirm: act });
  };

  const archiveOccurrence = (o: EventOccurrence) => withScope('archive', o, scope => { void eventActions.archive(o, scope); });
  const deleteOccurrence = (o: EventOccurrence) => withScope('delete', o, scope => { void eventActions.remove(o, scope); });

  const openEditForm = async (o: EventOccurrence) => {
    setCardBusy(true);
    try {
      const series = await fetchEvent(o.event_id);
      setCard(null);
      setEventForm({ mode: 'edit', initial: eventFormFromOccurrence(o, series, term?.endDate ?? null), occurrence: o, series });
    } catch (err) {
      console.error('[WeekView] Failed to load the event:', err);
      showToast("Couldn't open the event. Please try again.", 'error');
    } finally {
      setCardBusy(false);
    }
  };

  const handleEventFormSubmit = async (values: EventFormValues): Promise<boolean> => {
    if (!eventForm) return false;
    const termEnd = term?.endDate ?? null;
    if (eventForm.mode === 'new') return eventActions.create(eventFormToCreate(values, browserTimeZone(), termEnd));

    const { occurrence, series, initial } = eventForm;
    const edit = eventFormEdit(initial, values, termEnd);
    if (editIsEmpty(edit)) return true;
    const wasRepeating = series.repeat_days.length > 0;
    if (!wasRepeating) return eventActions.update(occurrence, editBody(edit, 'all', false, values), 'all');

    const allowed = allowedEditScopes(edit);
    if (allowed.length === 0) {
      showToast('Move this date or change how it repeats, one at a time.', 'info');
      return false;
    }
    return new Promise<boolean>(resolve => {
      setScopeQuestion({
        action: 'edit',
        occurrence,
        repeating: true,
        allowed,
        hint: allowed.length === 3 ? undefined : edit.date !== null
          ? 'A new date moves just this event. To move them all, change the days it repeats on.'
          : 'Changes to how it repeats, when it ends or its reminder apply to this and following events, or all of them.',
        onConfirm: scope => { void eventActions.update(occurrence, editBody(edit, scope, true, values), scope).then(resolve); },
        onCancel: () => resolve(false),
      });
    });
  };

  const handleCreateTask = async (e: React.FormEvent, linked?: LinkedTaskRef[], created?: Task) => {
    e.preventDefault();
    if (!newTask.title.trim()) {
      showToast('Give the task a title first.', 'info');
      return;
    }
    const task = created
      ? (await updateTask(created.id, applyNewTaskForm(created, newTask))) && created
      : await addTask(newTask);
    if (task) {
      if (linked) await saveLinkedTasks(task, linked);
      setShowNewTask(false);
      setNewTask(emptyTaskForm());
    }
  };

  const openTask = (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) setEditingTask(task);
  };

  const handleEditTask = async (e: React.FormEvent, linked?: LinkedTaskRef[]) => {
    e.preventDefault();
    if (!editingTask) return;
    if (!(await updateTask(editingTask.id, taskToEditForm(editingTask)))) return;
    if (linked) await saveLinkedTasks(editingTask, linked);
    setEditingTask(null);
  };

  // A linked task opened inside the edit modal; false leaves it open.
  const handleSaveLinkedTask = async (task: Task, linked?: LinkedTaskRef[]) => {
    if (!(await updateTask(task.id, taskToEditForm(task)))) return false;
    if (linked) await saveLinkedTasks(task, linked);
    return true;
  };

  const handleToggleHabitDate = async (habitId: number, date: string) => {
    await toggleHabitDate(habitId, date);
    refetch();
  };

  return (
    <div
      ref={rootRef}
      className={`flex flex-col gap-3 ${fill ? 'h-full min-h-0' : ''}`}
      style={heightPx === null ? undefined : { minHeight: heightPx }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => goToWeek(-1)} className="btn btn-ghost p-2" aria-label="Previous week" title="Previous week">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={goToToday} className="btn btn-secondary px-3 py-1.5 text-sm">
            Today
          </button>
          <button type="button" onClick={() => goToWeek(1)} className="btn btn-ghost p-2" aria-label="Next week" title="Next week">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <h2 className="text-base sm:text-lg text-text-primary" aria-live="polite">
          {weekLabel(days[0], days[6])}
        </h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-label="Loading week activity" />}
        <button type="button" onClick={openNewEvent} className="btn btn-primary ml-auto px-3 py-1.5 text-sm gap-1.5">
          <CalendarPlus className="w-4 h-4" /> New event
        </button>

        <ul className="basis-full flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
          {WEEK_LEGEND.map(({ label, swatch }) => (
            <li key={label} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span aria-hidden className="w-3 h-3 rounded-[3px] flex-shrink-0 box-border" style={swatch} />
              {label}
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)' }}
        >
          Couldn&rsquo;t load this week&rsquo;s events, completions, note sessions and habits.
          <button type="button" onClick={refetch} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RotateCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      <WeekGrid
        days={days}
        timed={timed}
        allDay={allDay}
        workDays={workDays}
        todayIndex={todayIndex >= 0 ? todayIndex : null}
        nowMinutes={nowMinutes}
        scrollToMinutes={scrollToMinutes}
        scrollKey={scrollKey}
        canOpenTask={id => taskIds.has(id)}
        canOpenHabit={id => habitIds.has(id)}
        onSlotClick={(day, minutes, anchor) => {
          setCard(null);
          setQuickAdd({ draft: { day, startMin: minutes, endMin: minutes + 30, kind: 'task' }, anchor });
        }}
        onAllDayClick={day => openNewTaskAt(day, null)}
        onDragCreate={(day, startMin, endMin, anchor) => {
          setCard(null);
          setQuickAdd({ draft: { day, startMin, endMin, kind: 'event' }, anchor });
        }}
        onOpenEvent={(event, anchor) => {
          setQuickAdd(null);
          setCard({ event, anchor });
        }}
        selection={quickAdd ? {
          dayIndex: days.findIndex(d => d.getTime() === quickAdd.draft.day.getTime()),
          startMin: quickAdd.draft.startMin,
          endMin: quickAdd.draft.endMin,
        } : null}
        onOpenTask={openTask}
        onOpenNote={noteId => router.push(`/notes?id=${noteId}`)}
        onOpenHabit={setHistoryHabitId}
        fill={fill}
      />

      {onResize && (
        <div className="-mt-2" title="Drag to make the calendar taller">
          <DragHandle onPointerDown={handleResizePointerDown} orientation="row" alwaysVisible />
        </div>
      )}

      <NewTaskModal
        isOpen={showNewTask}
        onClose={() => setShowNewTask(false)}
        newTask={newTask}
        onTaskChange={setNewTask}
        tags={tags}
        onToggleTag={tag => setNewTask(prev => ({ ...prev, tags: toggleById(prev.tags, tag) }))}
        onSubmit={handleCreateTask}
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={occupiedPriorityLevels}
        allTasks={tasks}
      />

      <EditTaskModal
        isOpen={editingTask !== null}
        task={editingTask}
        onClose={() => setEditingTask(null)}
        onTaskChange={(next: TaskFormData) => setEditingTask(prev => (prev ? { ...prev, ...next } as Task : prev))}
        tags={tags}
        onToggleTag={tag => setEditingTask(prev => (prev ? { ...prev, tags: toggleById(prev.tags, tag) } : prev))}
        onSubmit={handleEditTask}
        onSaveLinkedTask={handleSaveLinkedTask}
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={occupiedPriorityLevels}
        allTasks={tasks}
      />

      <HabitHistoryModal
        habit={historyHabit}
        onClose={() => setHistoryHabitId(null)}
        onToggleDate={handleToggleHabitDate}
      />

      {quickAdd && (
        <WeekQuickAdd
          key={`${quickAdd.draft.day.getTime()}-${quickAdd.draft.startMin}-${quickAdd.draft.endMin}-${quickAdd.draft.kind}`}
          draft={quickAdd.draft}
          anchor={quickAdd.anchor}
          tags={tags}
          termEnd={term?.endDate ?? null}
          onClose={() => setQuickAdd(null)}
          onSave={handleQuickAddSave}
          onMoreOptions={handleQuickAddMore}
        />
      )}

      {card && (
        <EventCard
          occurrence={card.event.occurrence}
          past={card.event.past}
          anchor={card.anchor}
          busy={cardBusy}
          onClose={() => setCard(null)}
          onEdit={() => { void openEditForm(card.event.occurrence); }}
          onArchive={() => { setCard(null); archiveOccurrence(card.event.occurrence); }}
          onRestore={() => { setCard(null); void eventActions.restore(card.event.occurrence); }}
          onDelete={() => { setCard(null); deleteOccurrence(card.event.occurrence); }}
        />
      )}

      {eventForm && (
        <EventFormModal
          mode={eventForm.mode}
          initial={eventForm.initial}
          tags={tags}
          context={formContext(eventForm.mode === 'edit' ? eventForm.occurrence.event_id : undefined)}
          onSubmit={handleEventFormSubmit}
          onClose={() => setEventForm(null)}
          onArchive={eventForm.mode === 'edit' ? () => { const o = eventForm.occurrence; setEventForm(null); archiveOccurrence(o); } : undefined}
          onDelete={eventForm.mode === 'edit' ? () => { const o = eventForm.occurrence; setEventForm(null); deleteOccurrence(o); } : undefined}
        />
      )}

      {scopeQuestion && (
        <EventScopeDialog
          action={scopeQuestion.action}
          title={scopeQuestion.occurrence.title}
          dateLabel={occurrenceDayLabel(scopeQuestion.occurrence)}
          repeating={scopeQuestion.repeating}
          allowed={scopeQuestion.allowed}
          hint={scopeQuestion.hint}
          onConfirm={scope => { setScopeQuestion(null); scopeQuestion.onConfirm(scope); }}
          onClose={() => { setScopeQuestion(null); scopeQuestion.onCancel?.(); }}
        />
      )}
    </div>
  );
};

export default WeekView;
