import React from 'react';
import { Award, CalendarDays, CalendarRange } from 'lucide-react';
import type { CanvasItem, CanvasOverview, CanvasRange } from '@/app/types/canvas';
import {
  dueWithin, formatShortDate, groupByDay, groupByWeek, type CanvasClass, type CanvasDayGroup,
} from '@/app/utils/canvas';
import { addDays } from '@/app/utils/weekLayout';
import CanvasItemRow, { type CanvasRowAdd, type CourseLookup } from './CanvasItemRow';

export const SectionLabel: React.FC<{ icon: React.ElementType; children: React.ReactNode }> = ({ icon: Icon, children }) => (
  <div className="flex items-center gap-1.5 mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
    <Icon className="w-3 h-3" />
    {children}
  </div>
);

const SlippedDot: React.FC<{ className?: string }> = () => (
  <span aria-hidden className="flex items-center justify-center w-3 h-3">
    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--tm-slipped-dot)' }} />
  </span>
);

const RANGES: { value: CanvasRange; label: string }[] = [
  { value: 'week', label: '7 days' },
  { value: 'all', label: 'All upcoming' },
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

interface CanvasUpcomingProps {
  overview: CanvasOverview;
  course: CourseLookup;
  now: Date;
  addToTasks?: CanvasRowAdd;
  range: CanvasRange;
  onRangeChange: (range: CanvasRange) => void;
  /** The classes shown in the panel (hidden ones left out), for the filter chips. */
  classes: CanvasClass[];
  /** The class the list is narrowed to, or null for all of them. */
  classFilter: number | null;
  onClassFilterChange: (courseId: number | null) => void;
  /** Set when every class is hidden: opens the Classes tab to show them again. */
  onShowHiddenClasses?: () => void;
}

/**
 * Missing work, what's due over the next 7 days by day or everything Canvas
 * has coming by week, and recently graded work, for every class or just one.
 */
const CanvasUpcoming: React.FC<CanvasUpcomingProps> = ({
  overview, course, now, addToTasks, range, onRangeChange, classes, classFilter, onClassFilterChange, onShowHiddenClasses,
}) => {
  const inClass = (items: CanvasItem[]) => (classFilter == null ? items : items.filter(i => i.course_id === classFilter));
  const ahead = overview.upcoming;
  const inRange = (items: CanvasItem[]) => (range === 'week' ? dueWithin(items, now, 7) : items);
  const shown = inClass(inRange(ahead));
  const missing = inClass(overview.missing);
  const graded = inClass(overview.recently_graded);
  const filtered = classFilter != null ? classes.find(c => c.id === classFilter) ?? null : null;
  const forClass = filtered ? ` for ${filtered.label}` : '';
  const notInTasks = (items: CanvasItem[]) => items.filter(i => addToTasks?.stateOf(i)?.kind === 'add').length;
  const lastDue = [...shown].reverse().find(i => i.due_at)?.due_at ?? null;
  const nextLater = range === 'week' ? inClass(ahead).find(i => !shown.includes(i)) ?? null : null;

  const row = (item: CanvasItem) => (
    <CanvasItemRow key={`${item.kind}-${item.id}`} item={item} course={course} now={now} addToTasks={addToTasks} />
  );
  const days = (groups: CanvasDayGroup[]) => groups.map(day => (
    <div key={day.key} className="mb-2">
      <div className="flex gap-1.5 items-baseline mt-3 mb-1.5 text-xs font-semibold text-text-secondary">
        <span className="text-text-primary">{day.label}</span>
        <span>{day.date}</span>
      </div>
      <div className="space-y-1.5">{day.items.map(item => row(item))}</div>
    </div>
  ));

  return (
    <div className="space-y-4">
      <div
        className="sticky -top-3 z-[2] -mx-3.5 -mt-3 px-3.5 pt-2.5 pb-2 border-b border-border-subtle"
        style={{ backgroundColor: 'var(--tm-surface)' }}
        data-testid="canvas-range-bar"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <div role="group" aria-label="How far ahead" className="inline-flex p-0.5 gap-0.5 rounded-[9px]" style={{ backgroundColor: 'var(--tm-slipped-subtle)' }}>
            {RANGES.map(r => (
              <button
                key={r.value}
                type="button"
                aria-pressed={range === r.value}
                onClick={() => onRangeChange(r.value)}
                className={`px-2.5 py-1 rounded-[7px] text-xs whitespace-nowrap transition-colors ${
                  range === r.value
                    ? 'bg-surface-raised text-text-primary font-semibold shadow-sm'
                    : 'font-medium text-text-secondary hover:text-text-primary'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-text-muted whitespace-nowrap">
            {range === 'week'
              ? `${formatShortDate(now.toISOString())} – ${formatShortDate(addDays(now, 6).toISOString())}`
              : lastDue && `Through ${formatShortDate(lastDue)}`}
          </span>
        </div>
        {classes.length > 1 && (
          <div role="group" aria-label="Filter by class" className="flex gap-1.5 overflow-x-auto overscroll-x-contain pt-2 pb-0.5" style={{ scrollbarWidth: 'none' }}>
            <ClassChip pressed={classFilter == null} onClick={() => onClassFilterChange(null)}>All classes</ClassChip>
            {classes.map(c => {
              const { color } = course(c.id);
              const count = inRange(ahead).filter(i => i.course_id === c.id).length;
              return (
                <ClassChip key={c.id} pressed={classFilter === c.id} onClick={() => onClassFilterChange(c.id)}>
                  <span aria-hidden className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
                  {c.label}
                  <span className="text-[10.5px] font-bold text-text-muted">{count}</span>
                </ClassChip>
              );
            })}
          </div>
        )}
      </div>

      {missing.length > 0 && (
        <section>
          {/* Missed work, said gently: a pencil box with an amber dot, never red. */}
          <SectionLabel icon={SlippedDot}>Slipped</SectionLabel>
          <div
            className="space-y-1.5 rounded-xl p-2.5 border border-border"
            style={{ backgroundColor: 'var(--tm-slipped-subtle)' }}
          >
            <p className="text-xs text-text-secondary px-0.5 pb-0.5">
              {missing.length === 1
                ? 'One thing slipped. Start with this one.'
                : `${missing.length} things slipped. Start with this one.`}
            </p>
            {missing.map(item => row(item))}
          </div>
        </section>
      )}

      <section>
        {range === 'week' && <SectionLabel icon={CalendarRange}>Next 7 days</SectionLabel>}
        {shown.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-2.5 px-5 py-7">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-muted)' }}>
              <CalendarDays className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">
              {onShowHiddenClasses
                ? 'Every class is hidden'
                : range === 'week' ? `Nothing${forClass} due in the next 7 days` : `Nothing${forClass} due ahead`}
            </h3>
            <p className="text-[13px] text-text-secondary max-w-[340px]">
              {onShowHiddenClasses
                ? "Their due dates are left out of Upcoming. Show a class again from the Classes tab."
                : range === 'week'
                  ? 'Try All upcoming to look further ahead.'
                  : "Canvas has nothing coming up on your calendar. New due dates show up here as soon as they're posted."}
            </p>
            {onShowHiddenClasses ? (
              <button type="button" onClick={onShowHiddenClasses} className="btn btn-outline">Show classes</button>
            ) : nextLater?.due_at && (
              <button type="button" onClick={() => onRangeChange('all')} className="btn btn-outline">
                Next up: {nextLater.title} · {formatShortDate(nextLater.due_at)}
              </button>
            )}
          </div>
        ) : range === 'week' ? (
          days(groupByDay(shown, now))
        ) : (
          <>
            {groupByWeek(shown, now).map((week, i) => {
              const left = notInTasks(week.days.flatMap(d => d.items));
              return (
                <div key={week.key}>
                  {week.month && <h3 className={`font-display text-[19px] text-text-primary ${i > 0 ? 'mt-6' : ''}`}>{week.month}</h3>}
                  <div className="flex items-baseline gap-2 mt-4 pb-1 border-b border-border-subtle">
                    <b className="text-[13px] font-semibold text-text-primary">{week.label}</b>
                    {week.span && <span className="text-xs text-text-muted">{week.span}</span>}
                    <span className="ml-auto text-[11px] font-semibold text-text-muted whitespace-nowrap">
                      {plural(week.count, 'item')}{left > 0 ? ` · ${left} not in tasks` : ''}
                    </span>
                  </div>
                  {days(week.days)}
                </div>
              );
            })}
            <p className="text-xs text-text-muted text-center mt-5">
              That&apos;s everything on your Canvas calendar{forClass}. Instructors may still add more.
            </p>
          </>
        )}
      </section>

      {graded.length > 0 && (
        <section>
          <SectionLabel icon={Award}>Recently graded</SectionLabel>
          <div className="space-y-1.5">
            {graded.map(item => (
              <CanvasItemRow key={`${item.kind}-${item.id}`} item={item} course={course} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const ClassChip: React.FC<{ pressed: boolean; onClick: () => void; children: React.ReactNode }> = ({ pressed, onClick, children }) => (
  <button
    type="button"
    aria-pressed={pressed}
    onClick={onClick}
    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs whitespace-nowrap transition-colors"
    style={pressed
      ? { borderColor: 'var(--tm-accent)', backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)', fontWeight: 600 }
      : { borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)', fontWeight: 500 }}
  >
    {children}
  </button>
);

export default CanvasUpcoming;
