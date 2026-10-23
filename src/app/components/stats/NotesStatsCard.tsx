'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, CalendarDays, TrendingUp, Type, NotebookText, ChevronLeft, ChevronRight } from 'lucide-react';
import { Note } from '@/app/types/notes';
import { formatUpdatedDate, formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import { useNoteTimeTotalsForRange } from '@/app/hooks/useNoteTimeTotals';
import { TagStats } from '@/app/types/task';
import { CardShell } from './CardShell';
import { CategoryDonut } from './charts';
import TileTools from './TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

// Tiptap stores note content as HTML — strip tags to approximate word count.
const countWords = (html: string): number => {
  const text = html.replace(/<[^>]+>/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
};

interface CategoryLegendRowProps {
  label: string;
  count: number;
  color: string;
  // Formats the raw `count` for display — defaults to the number as-is
  // (tag/category counts); the time-breakdown legend passes
  // formatDurationShort so seconds render as "1h 20m" instead.
  formatValue?: (count: number) => string;
}

// A compact legend row — color dot, label, numeric count — paired with
// CategoryDonut so the exact per-category totals sit beside the chart
// that shows their relative share.
const CategoryLegendRow: React.FC<CategoryLegendRowProps> = ({ label, count, color, formatValue = String }) => (
  <div className="flex items-center gap-1">
    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
    <span className="text-xs sm:text-sm text-text-secondary truncate">{label}</span>
    <span className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--tm-text-primary)' }}>
      {formatValue(count)}
    </span>
  </div>
);

// Every note with any recorded time gets its own wedge, ranked by time
// spent. Shared by the this-week time-breakdown slide, the month totals and
// the compact tile's today donut — they differ only in which totals map they
// pass in. Each note's wedge takes its own first tag's color (same as its
// NoteRow dots and the By-Tag donut) so a note reads as the same color
// everywhere in the card; untagged notes fall back to the same neutral
// border color the tags donut uses for "Untagged".
const buildTimeCategories = (notes: Note[], totals: Record<number, number>) => {
  const timed = notes
    .map(n => ({ note: n, seconds: totals[n.id] ?? 0 }))
    .filter(t => t.seconds > 0)
    .sort((a, b) => b.seconds - a.seconds);
  return timed.map(t => ({
    label: t.note.title || 'Untitled',
    count: t.seconds,
    color: t.note.tags[0]?.color ?? (t.note.tags.length > 0 ? 'var(--tm-accent)' : 'var(--tm-border)'),
  }));
};

interface NoteRowProps {
  note: Note;
  metric: string;
  onOpen: (note: Note) => void;
}

// A note row that doubles as a nav link — clicking it opens the note in the
// full notes view (/notes?id=…). `metric` is whatever the active carousel
// slide wants shown on the right (last-updated time, word count, …).
const NoteRow: React.FC<NoteRowProps> = ({ note, metric, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(note)}
    title={`Open "${note.title || 'Untitled'}"`}
    className="w-full flex items-center gap-2 py-0.5 -mx-1.5 px-1.5 rounded-md text-left transition-colors hover:bg-surface-raised"
  >
    <span className="flex items-center gap-0.5 flex-shrink-0">
      {note.tags.length > 0 ? (
        note.tags.slice(0, 3).map(tag => (
          <span
            key={tag.id}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: tag.color ?? 'var(--tm-accent)' }}
            title={tag.name}
          />
        ))
      ) : (
        <FileText className="w-2.5 h-2.5 text-text-muted flex-shrink-0" />
      )}
    </span>
    <span className="flex-1 min-w-0 text-xs sm:text-sm font-medium truncate" style={{ color: 'var(--tm-text-primary)' }}>
      {note.title || 'Untitled'}
    </span>
    <span className="text-xs text-text-muted flex-shrink-0">{metric}</span>
  </button>
);

interface ActivityStatRowProps {
  icon: React.ReactNode;
  value: number;
  label: string;
}

// A left-aligned icon + value + label row, echoing CategoryLegendRow's flow
// so the "Writing Activity" list reads as part of the same left-aligned
// stack rather than a separate block of centered numbers.
const ActivityStatRow: React.FC<ActivityStatRowProps> = ({ icon, value, label }) => (
  <div className="flex items-center gap-1.5">
    <span className="flex-shrink-0" style={{ color: 'var(--tm-accent)' }}>{icon}</span>
    <span className="text-base font-bold leading-none flex-shrink-0" style={{ color: 'var(--tm-text-primary)' }}>
      {value}
    </span>
    <span className="text-xs sm:text-sm text-text-muted truncate">{label}</span>
  </div>
);

interface TimeBreakdownProps {
  categories: { label: string; count: number; color: string }[];
  totalSeconds: number;
  emptyMessage: string;
}

// Layout for the this-week time-breakdown slide — same
// "By Tag" structure (total + scrollable legend grid on the left, donut
// flush right) so switching slides never jumps in shape or donut size.
const TimeBreakdownSlide: React.FC<TimeBreakdownProps> = ({ categories, totalSeconds, emptyMessage }) => (
  categories.length > 0 ? (
    <div className="flex items-center gap-4">
      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl sm:text-2xl lg:text-3xl font-bold leading-none" style={{ color: 'var(--tm-accent)' }}>
            {formatDurationShort(totalSeconds)}
          </span>
          <span className="text-xs sm:text-sm text-text-muted font-medium">total time spent</span>
        </div>
        <div className="overflow-x-auto scrollbar-custom pb-1" style={{ maxWidth: '100%' }}>
          <div
            className="grid gap-x-3 gap-y-1"
            style={{ gridTemplateRows: 'repeat(3, auto)', gridAutoFlow: 'column', gridAutoColumns: 'max-content' }}
          >
            {categories.map(c => (
              <CategoryLegendRow key={c.label} label={c.label} count={c.count} color={c.color} formatValue={formatDurationShort} />
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center flex-shrink-0">
        <CategoryDonut categories={categories} formatValue={formatDurationShort} />
      </div>
    </div>
  ) : (
    <p className="text-xs sm:text-sm text-text-muted italic py-2 text-center">{emptyMessage}</p>
  )
);

interface NoteCarouselSlide {
  key: string;
  label: string;
  content: React.ReactNode;
}

interface NoteCarouselProps {
  slides: NoteCarouselSlide[];
}

// A tiny dot/arrow carousel that swaps between a few note-derived stats
// inside a fixed-height footer, so the card doesn't reflow between slides.
const NoteCarousel: React.FC<NoteCarouselProps> = ({ slides }) => {
  const [index, setIndex] = React.useState(0);
  const active = slides[Math.min(index, slides.length - 1)];
  const go = (delta: number) => setIndex(prev => (prev + delta + slides.length) % slides.length);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {active.label}
        </span>
        {slides.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous stat"
              className="p-1 rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {slides.map((s, i) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Show ${s.label}`}
                  className="w-1.5 h-1.5 rounded-full transition-colors"
                  style={{ backgroundColor: i === index ? 'var(--tm-accent)' : 'var(--tm-border)' }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next stat"
              className="p-1 rounded text-text-muted transition-colors hover:bg-surface-raised hover:text-text-primary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center gap-0.5" style={{ minHeight: '5rem' }}>
        {active.content}
      </div>
    </div>
  );
};

// ── Shared derived stats — used by both the compact tile and the overlay ────

const useNotesStats = (notes: Note[], noteTags: TagStats[]) => {
  const noteCount = notes.length;
  const taggedCount = notes.filter(n => n.tags.length > 0).length;
  const untaggedCount = Math.max(noteCount - taggedCount, 0);

  const categories = [
    ...noteTags.map(t => ({
      label: t.name,
      count: t.count,
      color: t.color ?? 'var(--tm-accent)',
      // Tag stats carry no id, so match notes back to their tag by name —
      // tag names are unique per user, same assumption the count aggregation
      // above already makes.
      items: notes.filter(n => n.tags.some(tag => tag.name === t.name)).map(n => n.title || 'Untitled'),
    })),
    ...(untaggedCount > 0 ? [{
      label: 'Untagged',
      count: untaggedCount,
      color: 'var(--tm-border)',
      items: notes.filter(n => n.tags.length === 0).map(n => n.title || 'Untitled'),
    }] : []),
  ].sort((a, b) => b.count - a.count);

  const recentNotes = [...notes].sort((a, b) => new Date(b.updated_date).getTime() - new Date(a.updated_date).getTime()).slice(0, 3);
  const longestNotes = [...notes].sort((a, b) => countWords(b.content) - countWords(a.content)).slice(0, 3);

  // This week, Monday–Sunday, in local time — same bucketing TasksStatsCard
  // uses for its weekly ring. fetchNoteTimeSpentForRange sends our UTC offset
  // so the server buckets sessions by our local day, not ended_at's UTC
  // calendar date — evening sessions stay in the day they happened.
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sun .. 6 = Sat
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const weekTimeTotals = useNoteTimeTotalsForRange(toLocalDateStr(monday), toLocalDateStr(sunday));
  const weekTimeCategories = buildTimeCategories(notes, weekTimeTotals);
  const weekTotalTimeSpent = weekTimeCategories.reduce((sum, c) => sum + c.count, 0);

  const todayStr = toLocalDateStr(now);
  const todayTimeTotals = useNoteTimeTotalsForRange(todayStr, todayStr);

  // Current calendar month and year, local time — same day-boundary
  // approximation the week bucketing above uses.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthTimeTotals = useNoteTimeTotalsForRange(toLocalDateStr(monthStart), toLocalDateStr(monthEnd));
  const monthTimeCategories = buildTimeCategories(notes, monthTimeTotals);
  const monthTotalTimeSpent = monthTimeCategories.reduce((sum, c) => sum + c.count, 0);

  const notesWorkedOnToday = [...notes]
    .filter(n => (todayTimeTotals[n.id] ?? 0) > 0)
    .sort((a, b) => (todayTimeTotals[b.id] ?? 0) - (todayTimeTotals[a.id] ?? 0));
  const mostTimeSpentTodayNotes = notesWorkedOnToday.slice(0, 3);

  // The compact tile's donut — one wedge per note worked on today, sized by
  // the time spent on that note today, so each wedge's percentage is that
  // individual note's share of today's note activity (not a per-tag split).
  // Wedge color follows the note's first tag, same as everywhere else in the
  // card. buildTimeCategories already does exactly this given a totals map.
  const todayNoteCategories = buildTimeCategories(notes, todayTimeTotals);
  // Summed over `notes` rather than every key in the totals map, so a note
  // archived since the totals were fetched stops counting immediately.
  const todayTotalTimeSpent = todayNoteCategories.reduce((sum, c) => sum + c.count, 0);
  // Distinct tag names on the notes worked on today, most-used first — the
  // compact tile lists just these names (no counts) beside the donut.
  const todayTagCount = new Map<string, { color: string; count: number }>();
  for (const n of notesWorkedOnToday) {
    for (const tag of n.tags) {
      const existing = todayTagCount.get(tag.name);
      if (existing) existing.count += 1;
      else todayTagCount.set(tag.name, { color: tag.color ?? 'var(--tm-accent)', count: 1 });
    }
  }
  const todayTagNames = Array.from(todayTagCount.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, { color }]) => ({ name, color }));

  // Reuses the same Monday–Sunday / calendar-month boundaries as the
  // week and month time totals above, so "this week"/"this month" mean the same
  // thing everywhere in the card instead of a separate rolling 7/30-day cut.
  // `monday`/`monthStart` are start-of-day timestamps, so the upper bounds
  // below are exclusive start-of-next-period, not the last day's midnight.
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const activityStats = {
    createdThisWeek: notes.filter(n => {
      const created = new Date(n.created_date).getTime();
      return created >= monday.getTime() && created < nextMonday.getTime();
    }).length,
    createdThisMonth: notes.filter(n => {
      const created = new Date(n.created_date).getTime();
      return created >= monthStart.getTime() && created < nextMonthStart.getTime();
    }).length,
    avgWords: noteCount > 0 ? Math.round(notes.reduce((sum, n) => sum + countWords(n.content), 0) / noteCount) : 0,
  };

  return {
    noteCount, categories, recentNotes, longestNotes,
    weekTimeCategories, weekTotalTimeSpent,
    todayTimeTotals, todayTotalTimeSpent, monthTimeCategories, monthTotalTimeSpent,
    mostTimeSpentTodayNotes, activityStats,
    notesWorkedOnTodayCount: notesWorkedOnToday.length,
    todayNoteCategories, todayTagNames,
  };
};

// ── Overlay (today's full carousels, unchanged) ──────────────────────────────

interface NotesOverlayProps {
  notes: Note[];
  noteTags: TagStats[];
}

export const NotesOverlay: React.FC<NotesOverlayProps> = ({ notes, noteTags }) => {
  const router = useRouter();
  const openNote = (note: Note) => router.push(`/notes?id=${note.id}`);
  const stats = useNotesStats(notes, noteTags);

  if (stats.noteCount === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-3 text-center">
        <FileText className="w-5 h-5 text-text-muted" strokeWidth={1.5} />
        <p className="text-xs sm:text-sm text-text-muted">No notes yet — jot something down.</p>
      </div>
    );
  }

  const topSlides: NoteCarouselSlide[] = [
    {
      key: 'by-tag',
      label: 'Amount of Notes by Tag',
      content: (
        <div className="flex items-center gap-4">
          <div className="flex flex-col gap-1.5 min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl sm:text-2xl lg:text-3xl font-bold leading-none" style={{ color: 'var(--tm-accent)' }}>
                {stats.noteCount}
              </span>
              <span className="text-xs sm:text-sm text-text-muted font-medium">
                {stats.noteCount === 1 ? 'note total' : 'notes total'}
              </span>
            </div>
            {stats.categories.length > 0 && (
              <div className="overflow-x-auto scrollbar-custom pb-1" style={{ maxWidth: '100%' }}>
                <div
                  className="grid gap-x-3 gap-y-1"
                  style={{ gridTemplateRows: 'repeat(3, auto)', gridAutoFlow: 'column', gridAutoColumns: 'max-content' }}
                >
                  {stats.categories.map(c => (
                    <CategoryLegendRow key={c.label} label={c.label} count={c.count} color={c.color} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-center flex-shrink-0">
            {stats.categories.length > 0 && <CategoryDonut categories={stats.categories} />}
          </div>
        </div>
      ),
    },
    {
      key: 'time-breakdown-week',
      label: "This Week's Time Breakdown",
      content: (
        <TimeBreakdownSlide
          categories={stats.weekTimeCategories}
          totalSeconds={stats.weekTotalTimeSpent}
          emptyMessage="No notes worked on this week yet"
        />
      ),
    },
  ];

  const slides: NoteCarouselSlide[] = [
    {
      key: 'recent',
      label: 'Recently Updated',
      content: stats.recentNotes.length > 0
        ? stats.recentNotes.map(note => (
            <NoteRow key={note.id} note={note} metric={formatUpdatedDate(note.updated_date)} onOpen={openNote} />
          ))
        : <p className="text-xs sm:text-sm text-text-muted italic py-2 text-center">Nothing edited yet</p>,
    },
    {
      key: 'longest',
      label: 'Longest Notes',
      content: stats.longestNotes.length > 0
        ? stats.longestNotes.map(note => (
            <NoteRow key={note.id} note={note} metric={`${countWords(note.content)} words`} onOpen={openNote} />
          ))
        : <p className="text-xs sm:text-sm text-text-muted italic py-2 text-center">Write more to see rankings</p>,
    },
    {
      key: 'time-spent-today',
      label: 'Most Time Spent Today',
      content: stats.mostTimeSpentTodayNotes.length > 0
        ? stats.mostTimeSpentTodayNotes.map(note => (
            <NoteRow key={note.id} note={note} metric={formatDurationShort(stats.todayTimeTotals[note.id] ?? 0)} onOpen={openNote} />
          ))
        : <p className="text-xs sm:text-sm text-text-muted italic py-2 text-center">No notes worked on today yet</p>,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <NoteCarousel slides={topSlides} />
      <div className="grid grid-cols-[3fr_2fr] gap-x-4 gap-y-3">
        <div className="min-w-0">
          <NoteCarousel slides={slides} />
        </div>
        <div className="flex flex-col gap-1.5 pl-4 border-l" style={{ borderColor: 'var(--tm-border)' }}>
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Writing Activity
          </span>
          <div className="flex flex-col gap-1">
            <ActivityStatRow icon={<TrendingUp className="w-3 h-3" />} value={stats.activityStats.createdThisWeek} label="notes created this week" />
            <ActivityStatRow icon={<CalendarDays className="w-3 h-3" />} value={stats.activityStats.createdThisMonth} label="notes created this month" />
            <ActivityStatRow icon={<Type className="w-3 h-3" />} value={stats.activityStats.avgWords} label="avg words per note" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Compact tile ──────────────────────────────────────────────────────────────

interface NotesStatsCardProps {
  notes: Note[];
  noteTags: TagStats[];
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

const NotesStatsCard: React.FC<NotesStatsCardProps> = ({ notes, noteTags, onExpand, dragHandleProps }) => {
  const stats = useNotesStats(notes, noteTags);
  const todayTagNames = useMemo(() => stats.todayTagNames.slice(0, 6), [stats.todayTagNames]);

  return (
    <CardShell
      compact
      icon={<NotebookText className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header="Notes"
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      {stats.noteCount === 0 ? (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 text-center">
          <FileText className="w-4 h-4 text-text-muted" strokeWidth={1.5} />
          <p className="text-[11px] text-text-muted">No notes yet.</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex items-center gap-4">
          <div className="flex flex-col items-start gap-2 flex-1 min-w-0">
            <div className="flex flex-col gap-0.5 flex-shrink-0">
              <span className="text-[26px] font-bold leading-none" style={{ color: 'var(--tm-accent)' }}>
                {formatDurationShort(stats.todayTotalTimeSpent)}
              </span>
              <span className="text-[10px] font-medium text-text-muted whitespace-nowrap">
                spent on notes today
              </span>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-3 gap-y-0.5 self-start">
              {todayTagNames.length > 0 ? (
                todayTagNames.map(({ name, color }) => (
                  <div key={name} className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[11px] text-text-secondary truncate min-w-0">{name}</span>
                  </div>
                ))
              ) : (
                <span className="text-[11px] text-text-muted col-span-2">
                  {stats.notesWorkedOnTodayCount > 0 ? 'No tags on today’s notes' : 'No notes worked on today'}
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0">
            {stats.todayNoteCategories.length > 0 && (
              <CategoryDonut
                categories={stats.todayNoteCategories}
                size={76}
                strokeWidth={9}
                formatValue={formatDurationShort}
              />
            )}
          </div>
        </div>
      )}
    </CardShell>
  );
};

export default NotesStatsCard;
