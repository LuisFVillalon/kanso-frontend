'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { useToast } from '@/app/context/ToastContext';
import { useAppShell } from '@/app/context/AppShellContext';
import { BaseTaskForm, Tag, Task, TaskView } from '@/app/types/task';
import { useTasksContext } from '@/app/context/TasksContext';
import { useTagsContext } from '@/app/context/TagsContext';
import { useHabitsContext } from '@/app/context/HabitsContext';
import { useNotesContext } from '@/app/context/NotesContext';
import { useSplitPanel } from '@/app/hooks/useSplitPanel';
import { toggleById } from '@/app/hooks/useTaskHandlers';
import { DEFAULT_TASK_VIEW, isTaskView, useTaskFiltering } from '@/app/hooks/useTaskFiltering';
import { usePersistedPref } from '@/app/hooks/usePersistedPref';
import { useMountTransition } from '@/app/hooks/useMountTransition';
import { useCanvasAddToTasks } from '@/app/hooks/useCanvasAddToTasks';
import { useCanvasTaskSync } from '@/app/hooks/useCanvasTaskSync';
import { useCanvasConnected } from '@/app/hooks/useCanvasConnected';
import { useCanvasTabHidden } from '@/app/hooks/useCanvasTabHidden';
import { Note } from '@/app/types/notes';
import { taskToEditForm } from '@/app/utils/taskUtils';
import DragHandle from '@/app/components/common/DragHandle';
import ProfileAvatar from '@/app/components/common/ProfileAvatar';
import HeaderSearch from '@/app/components/common/HeaderSearch';
import TasksPanel from '@/app/components/task/TasksPanel';
import type { TaskFormData } from '@/app/components/task/TaskFormFields';
import NotesPanel, { isNoteOrder, type NoteOrder } from '@/app/components/notes/NotesPanel';
import CanvasPanel from '@/app/components/canvas/CanvasPanel';
import PanelCarousel, {
  DEFAULT_HOME_PANELS, PANEL_ORDER, isHomePanels, isPanelKey, isPanelOrder, type HomePanels, type PanelCarouselHandle, type PanelKey,
} from '@/app/components/common/PanelCarousel';
import CalendarAndStats from '@/app/components/layout/CalendarAndStats';
import WidgetsArea from '@/app/components/layout/WidgetsArea';
import TaskDebriefPanel from '@/app/components/task/TaskDebriefPanel';
import PeriodMoodCheckins from '@/app/components/mood/PeriodMoodCheckins';
import { DayClosedMoodReminder, DayMoodCheckinModal, daySummaryFrom } from '@/app/components/mood/DayMoodCheckin';
import { toLocalDateStr } from '@/app/utils/dateUtils';
import { checkinDayAt } from '@/app/utils/moodCheckinDay';
import PageSpinner from '@/app/components/common/PageSpinner';
import DoodleCanvas, { DoodleCanvasHandle } from '@/app/components/doodle/DoodleCanvas';
import DoodleToolbar from '@/app/components/doodle/DoodleToolbar';
import ModeSwitcher, { AppMode } from '@/app/components/common/ModeSwitcher';
import NotificationBell from '@/app/components/notifications/NotificationBell';
import KeyPressMoment, { DAY_COMPLETE_COPY, FOCUS_MODE_COPY, type KeyPress, type KeyPressPlacement } from '@/app/components/common/KeyPressMoment';
import { useDayComplete } from '@/app/hooks/useDayComplete';
import { DEFAULT_ACCENT, getStoredThemeColor } from '@/app/lib/theme';

const TaskManager: React.FC = () => {
  const { isDemo, dataUserId } = useAuth();
  const showToast = useToast();
  const shell = useAppShell();
  const doodleCanvasRef = useRef<DoodleCanvasHandle>(null);
  const [doodleColor, setDoodleColor] = useState(() => getStoredThemeColor() ?? DEFAULT_ACCENT);
  const [doodleErasing, setDoodleErasing] = useState(false);

  const { profile, loaded: profileLoaded, saveProfile } = shell.profileState;
  const { calendarSettings, loading: calendarSettingsLoading } = shell.calendarSettingsState;
  const [mode, setMode] = usePersistedPref<AppMode>(
    'tm-app-mode',
    'normal',
    (c): c is AppMode => c === 'normal' || c === 'focus' || c === 'doodle',
    profile.appMode as AppMode | null,
    next => { saveProfile({ ...profile, appMode: next }); },
  );
  // The home-page panels on a wide screen (see PanelCarousel); Tasks + Notes until the user switches.
  const [homePanels, setHomePanels] = usePersistedPref<HomePanels>(
    'tm-home-panels',
    DEFAULT_HOME_PANELS,
    isHomePanels,
    profile.homePanels as HomePanels | null,
    next => { saveProfile({ ...profile, homePanels: next }); },
  );
  // The one panel a phone shows, remembered on this device so it leaves the wide screen's alone.
  const [phonePanel, setPhonePanel] = usePersistedPref<PanelKey>(`tm-home-phone-panel:${dataUserId ?? 'guest'}`, 'tasks', isPanelKey);
  // The last split on a wide screen, which a panel shown alone goes back to; remembered on this device.
  const [homeSplit, setHomeSplit] = usePersistedPref<HomePanels>(`tm-home-split:${dataUserId ?? 'guest'}`, DEFAULT_HOME_PANELS, isHomePanels);
  // The order the panels sit in, on a wide screen and a phone alike; remembered on this device.
  const [panelOrder, setPanelOrder] = usePersistedPref<PanelKey[]>(`tm-home-panel-order:${dataUserId ?? 'guest'}`, [...PANEL_ORDER], isPanelOrder);
  const carouselRef = useRef<PanelCarouselHandle>(null);
  const focusMode = mode === 'focus';
  const doodleMode = mode === 'doodle';

  // Delay unmounting these mode-gated sections so they can play a fade
  // transition on the way out instead of vanishing instantly.
  const showMainContent = useMountTransition(!doodleMode);
  const showDebriefPanels = useMountTransition(!doodleMode && !focusMode);
  const showDoodleToolbar = useMountTransition(doodleMode);

  const { tasks, isLoading, toggleComplete, completeWithLinked, deleteTask, archiveTask, addTask, updateTask, refreshTasks, pendingTaskIds, completionSyncToken } = useTasksContext();
  // Tasks added from Canvas: synced on load and on a Canvas panel refresh.
  const canvasTaskSync = useCanvasTaskSync({ enabled: !isLoading && !isDemo, tasks, refreshTasks });
  // The Canvas panel is only offered with Canvas connected. Until the first
  // check answers, saved panels that include it keep it, so it doesn't flicker away.
  const canvasConnected = useCanvasConnected({ isDemo, syncToken: shell.settingsClosedToken });
  const homePanelKeys: PanelKey[] = (canvasConnected ?? homePanels.includes('canvas'))
    ? ['tasks', 'notes', 'canvas']
    : ['tasks', 'notes'];
  // Without Canvas connected, a "+ Canvas" tab offers it until the user closes it.
  const [canvasTabHidden, setCanvasTabHidden] = useCanvasTabHidden(dataUserId);
  const hideCanvasTab = () => {
    setCanvasTabHidden(true);
    showToast('Canvas tab closed. You can bring it back in Settings → Canvas.', 'info', {
      label: 'Undo',
      onClick: () => setCanvasTabHidden(false),
    });
  };

  // The key-press moment: plays when checking off a task settles today's
  // plan, and when the user switches into focus mode.
  const [keyPress, setKeyPress] = useState<KeyPress | null>(null);
  const playKeyPress = useCallback((message: string, placement: KeyPressPlacement) => {
    setKeyPress(prev => ({ id: (prev?.id ?? 0) + 1, message, placement }));
  }, []);
  const clearKeyPress = useCallback(() => setKeyPress(null), []);
  const playDayComplete = useCallback(() => playKeyPress(DAY_COMPLETE_COPY, 'overlay'), [playKeyPress]);
  useDayComplete(tasks, isLoading, playDayComplete);
  const handleModeChange = (next: AppMode) => {
    if (next === 'focus' && mode !== 'focus') playKeyPress(FOCUS_MODE_COPY, 'header');
    setMode(next);
  };
  const { tags, tagsLoading } = useTagsContext();

  // The Tasks list's view: which tasks, sorted by what, which way.
  const [taskView, setTaskView] = usePersistedPref<TaskView>('tm-task-view', DEFAULT_TASK_VIEW, isTaskView);
  const [noteOrder, setNoteOrder] = usePersistedPref<NoteOrder>('tm-notes-order', 'newest', isNoteOrder);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const toggleSelectedTag = (tag: Tag) => setSelectedTags(prev => toggleById(prev, tag));
  // An archived or deleted tag leaves `tags`, and the filter with it.
  if (!tagsLoading && selectedTags.some(t => !tags.some(tag => tag.id === t.id))) {
    setSelectedTags(selectedTags.filter(t => tags.some(tag => tag.id === t.id)));
  }

  // "Show it" on a task the filters hide: clear them all so every task shows.
  const showAllTasks = () => {
    setTaskView({ ...taskView, show: 'all', topLevelOnly: false });
    setSearchTerm('');
    setSelectedTags([]);
  };

  // The "+ Linked task" form under a card: creates a fully specified task under it.
  const createLinkedTask = (parent: Task, form: TaskFormData) =>
    addTask({ id: 0, created_date: '', ...form, parent_task_id: parent.id } as BaseTaskForm);

  const updatePriority = async (taskId: number, priority: number | null) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    await updateTask(taskId, taskToEditForm(task, { priority }));
  };

  const occupiedPriorityLevels = useMemo(
    () => tasks.filter(t => !t.completed && t.priority != null).map(t => t.priority as number),
    [tasks],
  );
  const activeTaskCount = useMemo(() => tasks.filter(t => !t.completed).length, [tasks]);
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  );

  const [now, setNow] = useState<Date>(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const currentTimeLabel = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const {
    panelWidths,
    dividersMovable,
    panelHeightPx,
    splitContainerRef,
    panelAreaRef,
    handleDividerPointerDown,
    handleHeightSplitterPointerDown,
  } = useSplitPanel(!isLoading && !tagsLoading && showMainContent);

  const openNotifiedTask = (taskId: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (task) shell.openEditTask(task);
    else showToast('That task is no longer in your list.', 'info');
  };

  // "Already in your tasks" from the Canvas panel: bring Tasks on screen and open the task.
  const showCanvasTask = (taskId: number) => {
    carouselRef.current?.show('tasks');
    openNotifiedTask(taskId);
  };
  const canvasAddToTasks = useCanvasAddToTasks(showCanvasTask);

  const openNotifiedHabits = (habitIds: number[]) => {
    if (habitIds.length === 1) shell.openHabitHistory(habitIds[0]);
    else shell.openManageHabits();
  };

  // The day a mood notification opened the check-in form for.
  const [moodCheckinDate, setMoodCheckinDate] = useState<string | null>(null);
  const closeMoodCheckin = useCallback(() => setMoodCheckinDate(null), []);
  const openMoodCheckin = (date?: string) =>
    setMoodCheckinDate(date ?? toLocalDateStr(checkinDayAt(new Date(), profile.dayStartTime, profile.shutoffTime, profile.dayWindows)));

  const { visibleTasks, stats } = useTaskFiltering(tasks, taskView, searchTerm, selectedTags);

  const {
    habits, habitsLoading, toggle: toggleHabit, pendingHabitIds, syncToken: habitSyncToken,
  } = useHabitsContext();

  const {
    notes: allNotes, isLoading: notesLoading, deleteNote, archiveNote, updateNote, discardDraft, pendingNoteIds,
    archiveSyncToken: noteArchiveSyncToken,
  } = useNotesContext();
  // Only the id is held in state; the note itself is derived live from
  // allNotes on every render so edits (title/content debounce, tag toggles)
  // always flow straight through — no separate copy to fall out of sync or
  // go stale mid-save.
  const [noteEditorOverlayId, setNoteEditorOverlayIdRaw] = useState<number | null>(null);
  const noteEditorOverlay = useMemo(
    () => (noteEditorOverlayId !== null ? allNotes.find(n => n.id === noteEditorOverlayId) ?? null : null),
    [noteEditorOverlayId, allNotes],
  );
  // Wraps setNoteEditorOverlayId so switching away from (or closing) an
  // untouched draft note removes it instead of leaving a phantom
  // "Untitled Note" behind in the list.
  const setNoteEditorOverlay = useCallback((next: Note | null) => {
    setNoteEditorOverlayIdRaw(prevId => {
      if (prevId !== null && prevId !== next?.id) discardDraft(prevId);
      return next?.id ?? null;
    });
  }, [discardDraft]);

  // A note made from the New menu or N opens here, in the Notes panel.
  const { registerNoteOpener } = shell;
  useEffect(() => {
    registerNoteOpener(note => {
      setNoteEditorOverlay(note);
      carouselRef.current?.show('notes');
    });
    return () => registerNoteOpener(null);
  }, [registerNoteOpener, setNoteEditorOverlay]);

  const handleArchiveNote = (id: number) => {
    // Close the overlay first so the note can't pop back open if it's
    // restored later while its id is still held here.
    if (noteEditorOverlayId === id) setNoteEditorOverlay(null);
    archiveNote(id);
  };

  const noteTags = useMemo(() => {
    const map: Record<number, { name: string; color: string; count: number }> = {};
    allNotes.forEach(note => {
      note.tags?.forEach(tag => {
        if (!map[tag.id]) map[tag.id] = { name: tag.name, color: tag.color, count: 0 };
        map[tag.id].count += 1;
      });
    });
    return Object.values(map);
  }, [allNotes]);

  const filteredNotes = useMemo(() => {
    const lower = searchTerm.trim().toLowerCase();
    const matching = allNotes.filter(note => {
      const matchesSearch =
        !lower ||
        note.title.toLowerCase().includes(lower) ||
        note.content.replace(/<[^>]+>/g, '').toLowerCase().includes(lower);

      const matchesTags =
        selectedTags.length === 0 ||
        (note.tags ?? []).some(noteTag =>
          selectedTags.some(selected => selected.id === noteTag.id)
        );

      return matchesSearch && matchesTags;
    });

    // Notes always sort by edit recency, independent of the Tasks list's
    // sort. noteOrder is its own piece of state, toggled from the Notes
    // panel, so it never touches the task view (default: newest first).
    const dir = noteOrder === 'oldest' ? 1 : -1;
    return [...matching].sort(
      (a, b) => (new Date(a.updated_date).getTime() - new Date(b.updated_date).getTime()) * dir,
    );
  }, [allNotes, searchTerm, selectedTags, noteOrder]);

  const renderHomePanel = (key: PanelKey, { widthPct }: { widthPct: number }) => {
    if (key === 'tasks') {
      return (
        <TasksPanel
          tags={tags}
          tasks={visibleTasks}
          allTasks={tasks}
          onToggleComplete={toggleComplete}
          onCompleteWithLinked={completeWithLinked}
          onDeleteTask={deleteTask}
          onArchiveTask={archiveTask}
          onUpdatePriority={updatePriority}
          onEditTask={shell.openEditTask}
          onCreateLinkedTask={createLinkedTask}
          onShowAll={showAllTasks}
          activeTaskCount={activeTaskCount}
          occupiedPriorities={occupiedPriorityLevels}
          compact={widthPct < 40}
          heightPx={panelHeightPx}
          pendingTaskIds={pendingTaskIds}
          canvasSubmitted={{ shows: canvasTaskSync.showsSubmitted, onNotYet: canvasTaskSync.dismiss }}
          view={taskView}
          onViewChange={setTaskView}
          selectedTags={selectedTags}
          onToggleTag={toggleSelectedTag}
          onClearTags={() => setSelectedTags([])}
        />
      );
    }
    if (key === 'notes') {
      return (
        <NotesPanel
          notes={filteredNotes}
          tags={tags}
          noteEditorOverlay={noteEditorOverlay}
          onUpdateNote={updateNote}
          onDeleteNote={deleteNote}
          onArchiveNote={handleArchiveNote}
          onEditorChange={setNoteEditorOverlay}
          heightPx={panelHeightPx}
          isLoading={notesLoading}
          pendingNoteIds={pendingNoteIds}
          tagFilter={selectedTags}
          onToggleTag={toggleSelectedTag}
          onClearTags={() => setSelectedTags([])}
          profile={profile}
          onSaveProfile={saveProfile}
          noteOrder={noteOrder}
          onNoteOrderChange={setNoteOrder}
        />
      );
    }
    return (
      <CanvasPanel
        heightPx={panelHeightPx}
        onOpenSettings={() => shell.openSettings('canvas')}
        syncToken={shell.settingsClosedToken}
        addToTasks={isDemo ? undefined : canvasAddToTasks}
        onRefresh={isDemo ? undefined : () => void canvasTaskSync.sync(true)}
      />
    );
  };

  if (isLoading || tagsLoading) return <PageSpinner size="lg" />;

  return (
    <>
    {/*
     * DoodleCanvas renders first so DOM order keeps it visually behind
     * everything else here. pointer-events-none while doodling lets clicks
     * fall through this whole wrapper to it — otherwise this min-h-screen
     * box (which covers the full viewport regardless of how little content
     * it holds) would win hit-testing and swallow the clicks itself.
     * The header opts back into pointer-events-auto so it stays usable
     * while doodle mode hides everything else (the app nav sits outside
     * this wrapper, in AppShell).
     */}
    <div className={`relative min-h-screen ${doodleMode ? 'pointer-events-none' : ''}`}>
      <DoodleCanvas ref={doodleCanvasRef} active={doodleMode} color={doodleColor} isErasing={doodleErasing} />

        <div className="max-w-[1600px] mx-auto px-2 sm:px-3 md:px-4 lg:px-6 pt-0 pb-4 sm:pb-6 lg:pb-10">

          {/*
            Header — pointer-events-auto so the mode switcher stays usable
            while doodling. Also needs relative + a z-index: DoodleCanvas is
            position:fixed, which (per spec) always opens its own stacking
            context even at z-index:auto, so it otherwise outranks this
            plain non-positioned div regardless of DOM order and would
            swallow clicks meant for the mode switcher.
          */}
        <div className="relative z-10 pointer-events-auto flex flex-wrap xl:flex-nowrap justify-between items-end gap-2 xl:gap-4 pb-2 sm:pb-3 mb-2 sm:mb-3 mt-2 sm:mt-3 border-b border-border-subtle">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[0.6875rem] sm:text-xs font-semibold uppercase tracking-wide whitespace-nowrap text-text-muted">
              <span className="min-w-0 truncate">{todayLabel}</span>
              <span aria-hidden="true" className="text-text-muted/50">&middot;</span>
              <span>{currentTimeLabel}</span>
            </p>
            <h1 className="flex items-center gap-2 sm:gap-3 text-xl sm:text-2xl lg:text-3xl text-text-primary">
              <ProfileAvatar avatar={profile.avatar} name={profile.name} size={32} />
              <span className="min-w-0 truncate">Welcome back{profile.name ? `, ${profile.name}` : ''}</span>
            </h1>
          </div>
          {/* Centre slot for the focus moment: it always keeps room for the
              key-only card beside the greeting (a long greeting truncates
              instead), and the negative margin cancels its extra gap. Below
              xl the controls wrap onto their own full-width row. */}
          <div className="@container relative flex-1 min-w-15 -ml-2 xl:-ml-4 self-stretch">
            <KeyPressMoment moment={keyPress} placement="header" onDone={clearKeyPress} />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto xl:flex-shrink-0">
            {showDoodleToolbar && (
              <div className={doodleMode ? 'animate-fade-in' : 'animate-fade-out'}>
                <DoodleToolbar
                  color={doodleColor}
                  onColorChange={setDoodleColor}
                  isErasing={doodleErasing}
                  onToggleErase={() => setDoodleErasing(prev => !prev)}
                  onClear={() => doodleCanvasRef.current?.clear()}
                />
              </div>
            )}
            <HeaderSearch value={searchTerm} onChange={setSearchTerm} className="flex-1 min-w-0 sm:max-w-sm xl:flex-none xl:w-60" />
            <NotificationBell onOpenTask={openNotifiedTask} onOpenHabits={openNotifiedHabits} onOpenMoodCheckin={openMoodCheckin} />
            <ModeSwitcher mode={mode} onChange={handleModeChange} className="flex-shrink-0" />
          </div>
        </div>

        {showMainContent && (
          <div className={doodleMode ? 'animate-fade-out' : 'animate-fade-in'}>
            {showDebriefPanels && (
              <div className={!doodleMode && !focusMode ? 'animate-fade-in' : 'animate-fade-out'}>
                <PeriodMoodCheckins profile={profile} profileLoaded={profileLoaded} tasks={tasks} />

                <DayClosedMoodReminder profile={profile} profileLoaded={profileLoaded} tasks={tasks} habits={habits} />

                <TaskDebriefPanel profile={profile} profileLoaded={profileLoaded} onSaveProfile={saveProfile} tasks={tasks} habits={habits} completionSyncToken={completionSyncToken + noteArchiveSyncToken + habitSyncToken}
                  onArchiveTask={archiveTask}
                  onDeleteTask={deleteTask}
                  onUpdateTask={updateTask}
                />

                <WidgetsArea
                  widgets={
                    <CalendarAndStats
                      habits={habits}
                      onToggleHabit={toggleHabit}
                      onCreateHabit={shell.openManageHabits}
                      pendingHabitIds={pendingHabitIds}
                      habitsLoading={habitsLoading}
                      stats={stats}
                      allNotes={allNotes}
                      noteTags={noteTags}
                      profile={profile}
                      onSaveProfile={saveProfile}
                      calendarSettings={calendarSettings}
                      calendarSettingsLoading={calendarSettingsLoading}
                    />
                  }
                />
              </div>
            )}

            {/* Tasks, Notes & Canvas — tabs over the resizable split */}
            <div ref={panelAreaRef} className="space-y-4">
              <PanelCarousel
                ref={carouselRef}
                value={homePanels}
                onChange={setHomePanels}
                splitValue={homeSplit}
                onSplitChange={setHomeSplit}
                order={panelOrder}
                onOrderChange={setPanelOrder}
                phoneValue={phonePanel}
                onPhoneChange={setPhonePanel}
                available={homePanelKeys}
                onConnectCanvas={canvasConnected === false && !canvasTabHidden ? () => shell.openSettings('canvas') : undefined}
                onHideCanvasTab={hideCanvasTab}
                panelWidths={panelWidths}
                dividersMovable={dividersMovable}
                splitRef={splitContainerRef}
                onDividerPointerDown={handleDividerPointerDown}
                renderPanel={renderHomePanel}
              />

              <DragHandle onPointerDown={handleHeightSplitterPointerDown} orientation="row" alwaysVisible />
            </div>
          </div>
        )}
      </div>
    </div>

      {moodCheckinDate && (
        <DayMoodCheckinModal
          key={moodCheckinDate}
          date={moodCheckinDate}
          summary={daySummaryFrom(moodCheckinDate, tasks, habits)}
          onClose={closeMoodCheckin}
        />
      )}

      <KeyPressMoment moment={keyPress} placement="overlay" onDone={clearKeyPress} />
    </>
  );
};

export default TaskManager;
