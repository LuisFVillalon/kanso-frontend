'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Loader2, RotateCw } from 'lucide-react';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useToast } from '@/app/context/ToastContext';
import { useWeekActivity } from '@/app/hooks/useWeekActivity';
import type { BaseTaskForm, LinkedTaskRef, Tag, Task } from '@/app/types/task';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import NewTaskModal from '@/app/components/task/NewTaskModal';
import EditTaskModal from '@/app/components/task/EditTaskModal';
import HabitHistoryModal from '@/app/components/habit/HabitHistoryModal';
import { DEFAULT_DAY_START } from '@/app/lib/restDays';
import { formatDateRange, toLocalDateStr } from '@/app/utils/dateUtils';
import { applyNewTaskForm, taskToEditForm } from '@/app/utils/taskUtils';
import {
  addDays,
  buildWeekEvents,
  minutesToTimeStr,
  parseTimeToMinutes,
  startOfWeek,
  weekDays,
} from '@/app/utils/weekLayout';
import WeekGrid, { WEEK_LEGEND } from './WeekGrid';

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

/** The user's day start (Settings → Profile), cached locally by useProfile. */
const readDayStartMinutes = (): number => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem('tm_day_start_time');
  } catch {
    // storage blocked — fall back to the default
  }
  return parseTimeToMinutes(stored ?? DEFAULT_DAY_START) ?? parseTimeToMinutes(DEFAULT_DAY_START)!;
};

/** The current time, refreshed every minute for the now-line. */
const useMinuteClock = (): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
};

const toggleById = (tags: Tag[], tag: Tag): Tag[] =>
  tags.some(t => t.id === tag.id) ? tags.filter(t => t.id !== tag.id) : [...tags, tag];

/**
 * Google Calendar–style week: planned tasks, completions, note sessions and
 * habit completions for one Monday–Sunday week, with prev/next/Today
 * navigation. Clicking an empty slot opens the New Task modal prefilled with
 * that day and time; clicking an item opens it (task edit modal, the note,
 * or the habit's history).
 *
 * Planned tasks come from TasksContext rather than the activity response's
 * scheduled_tasks, so a task created or edited here moves on the grid the
 * moment the save succeeds, without waiting on a refetch. Completions, note
 * sessions and habit completions come from GET /get-calendar-activity.
 */
const WeekView: React.FC = () => {
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

  const days = useMemo(() => weekDays(weekStart), [weekStart]);
  const todayStr = toLocalDateStr(now);
  const todayIndex = days.findIndex(d => toLocalDateStr(d) === todayStr);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Open near the current time on this week, at the user's day start otherwise.
  const scrollToMinutes = todayIndex >= 0 ? Math.max(0, nowMinutes - 90) : readDayStartMinutes();

  const { timed, allDay } = useMemo(() => buildWeekEvents({
    weekStart,
    scheduledTasks: tasks,
    completedTasks: activity?.completed_tasks ?? [],
    noteSessions: activity?.note_sessions ?? [],
    habitCompletions: activity?.habit_completions ?? [],
  }), [weekStart, tasks, activity]);

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

  const openNewTaskAt = (day: Date, minutes: number | null) => {
    setNewTask({
      ...emptyTaskForm(),
      due_date: toLocalDateStr(day),
      due_time: minutes === null ? '' : minutesToTimeStr(minutes),
    });
    setShowNewTask(true);
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

  const handleToggleHabitDate = async (habitId: number, date: string) => {
    await toggleHabitDate(habitId, date);
    refetch();
  };

  return (
    <div className="flex flex-col gap-3">
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
        <h2 className="text-base sm:text-lg font-semibold text-text-primary" aria-live="polite">
          {formatDateRange(days[0], days[6])}, {days[6].getFullYear()}
        </h2>
        {loading && <Loader2 className="w-4 h-4 animate-spin text-text-muted" aria-label="Loading week activity" />}

        <ul className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
          {WEEK_LEGEND.map(({ label, bg, edge }) => (
            <li key={label} className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span aria-hidden className="w-3 h-3 rounded-sm" style={{ backgroundColor: bg, borderLeft: `3px solid ${edge}` }} />
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
          Couldn&rsquo;t load this week&rsquo;s completions, note sessions and habits.
          <button type="button" onClick={refetch} className="inline-flex items-center gap-1 font-semibold hover:underline">
            <RotateCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      <WeekGrid
        days={days}
        timed={timed}
        allDay={allDay}
        todayIndex={todayIndex >= 0 ? todayIndex : null}
        nowMinutes={nowMinutes}
        scrollToMinutes={scrollToMinutes}
        scrollKey={scrollKey}
        canOpenTask={id => taskIds.has(id)}
        canOpenHabit={id => habitIds.has(id)}
        onCreateAt={openNewTaskAt}
        onOpenTask={openTask}
        onOpenNote={noteId => router.push(`/notes?id=${noteId}`)}
        onOpenHabit={setHistoryHabitId}
      />

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
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={occupiedPriorityLevels}
        allTasks={tasks}
      />

      <HabitHistoryModal
        habit={historyHabit}
        onClose={() => setHistoryHabitId(null)}
        onToggleDate={handleToggleHabitDate}
      />
    </div>
  );
};

export default WeekView;
