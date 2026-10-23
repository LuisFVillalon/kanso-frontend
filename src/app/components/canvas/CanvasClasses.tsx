import React from 'react';
import { CalendarClock, Eye, EyeOff, Info, Library } from 'lucide-react';
import type { CanvasCourseSummary, CanvasItem } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import { dueLabel, dueWithin, formatNumber, splitEarlier, type CanvasClass } from '@/app/utils/canvas';
import type { CanvasRowAdd } from './CanvasItemRow';
import { TagPill } from './CanvasAddSheet';

/** The course's grade: letter and score, or "Hidden by instructor". */
export const CourseGrade: React.FC<{ course: CanvasCourseSummary }> = ({ course }) => {
  if (course.grades_hidden) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted whitespace-nowrap">
        <EyeOff className="w-3 h-3" /> Hidden by instructor
      </span>
    );
  }
  const score = course.period_score ?? course.current_score;
  const grade = course.period_grade ?? course.current_grade;
  if (score == null && !grade) return <span className="text-[11px] text-text-muted">No grade yet</span>;
  return (
    <span className="text-right">
      {grade && <span className="block text-lg font-bold leading-none text-text-primary">{grade}</span>}
      {score != null && <span className="block text-xs text-text-muted mt-0.5">{formatNumber(score)}%</span>}
    </span>
  );
};

export const GradeBar: React.FC<{ pct: number; color: string }> = ({ pct, color }) => (
  <div className="h-1 rounded-full mt-2 overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
    <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }} />
  </div>
);

/** The grade on a class card: letter, then score, or why there's none. */
const GradeLine: React.FC<{ course: CanvasCourseSummary }> = ({ course }) => {
  const score = course.period_score ?? course.current_score;
  const grade = course.period_grade ?? course.current_grade;
  let value: React.ReactNode;
  if (course.grades_hidden) value = <span className="text-text-muted">Hidden by instructor</span>;
  else if (score == null && !grade) value = <span className="text-text-muted">No grade yet</span>;
  else value = <>{grade && <b className="font-semibold text-text-primary">{grade}</b>}{score != null && <span className="text-text-muted">{formatNumber(score)}%</span>}</>;
  return <Line label="Grade">{value}</Line>;
};

const Line: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-text-secondary">
    <span className="text-text-muted min-w-[92px]">{label}</span>
    {children}
  </div>
);

/** What a class card offers for the tags its tasks start with; left out when Add to tasks isn't available. */
export interface ClassTagsControl {
  /** The tags the class's tasks start with: the user's choice, else the class's Canvas tag. */
  tagsOf: (c: CanvasClass) => Tag[];
  /** The user chose the class's tags ("Edit"), rather than taking its Canvas tag ("Choose your own"). */
  chosen: (c: CanvasClass) => boolean;
  onEdit: (c: CanvasClass) => void;
}

interface CanvasClassesProps {
  classes: CanvasClass[];
  /** The overview's items, for each class's counts and next due date. */
  items: CanvasItem[];
  colorOf: (courseId: number) => string;
  now: Date;
  addToTasks?: CanvasRowAdd;
  classTags?: ClassTagsControl;
  /** Opens Upcoming on everything coming for the class. */
  onSeeDueDates: (courseId: number) => void;
  /** Hides the class from the panel or shows it again; left out (a demo), the cards can't. */
  onToggleHidden?: (c: CanvasClass) => void;
  /** Opens a token course's modules, assignments and grades. */
  onOpenCourse?: (courseId: number) => void;
  /** A calendar feed: the classes come from the due dates Canvas lists. */
  feed: boolean;
}

const WORK = new Set<CanvasItem['kind']>(['assignment', 'quiz', 'discussion']);

/**
 * The user's classes, one card each: what's due this week and left this
 * term, how much is in their tasks, what's next, the tags its tasks start
 * with, and hiding it from the panel. A token's cards add the grade and the
 * course's modules and assignments.
 */
const CanvasClasses: React.FC<CanvasClassesProps> = ({
  classes, items, colorOf, now, addToTasks, classTags, onSeeDueDates, onToggleHidden, onOpenCourse, feed,
}) => {
  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center text-center gap-2.5 px-5 py-8">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-muted)' }}>
          <Library className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-text-primary">No classes on your calendar</h3>
        <p className="text-[13px] text-text-secondary max-w-[340px]">
          {feed
            ? "kanso finds your classes in the due dates Canvas lists. Once next term's courses post work, they show up here on their own."
            : "Canvas doesn't list you in any current courses."}
        </p>
      </div>
    );
  }

  const { ahead } = splitEarlier(items, now);
  const terms = [...new Set(classes.map(c => c.term).filter(Boolean))];
  const personal = ahead.filter(i => i.course_id == null).length;

  return (
    <section>
      <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        <Library className="w-3 h-3" />
        {terms.length === 1 ? `${terms[0]} · ` : ''}
        {classes.length} {classes.length === 1 ? 'class' : 'classes'}
      </div>
      {classes.map(c => {
        const color = colorOf(c.id);
        const work = ahead.filter(i => i.course_id === c.id && WORK.has(i.kind));
        const week = dueWithin(work, now, 7).length;
        const inTasks = items.filter(i => i.course_id === c.id && addToTasks?.stateOf(i)?.kind === 'added').length;
        const next = ahead.find(i => i.course_id === c.id && i.due_at);
        const tags = classTags?.tagsOf(c) ?? [];
        return (
          <div
            key={c.id}
            className={`mt-2.5 p-3 rounded-xl border border-border bg-surface ${c.hidden ? 'opacity-60' : ''}`}
            data-testid="canvas-class-card"
          >
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center text-[10px] font-extrabold tracking-wide"
                style={{ backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)`, color }}
              >
                {c.label.split(/\s+/)[0].slice(0, 4)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text-primary truncate">{c.label}</div>
                {(c.name || c.term) && (
                  <div className="text-xs text-text-muted truncate">{[c.name, c.term].filter(Boolean).join(' · ')}</div>
                )}
              </div>
              {onToggleHidden && (
                <button
                  type="button"
                  onClick={() => onToggleHidden(c)}
                  aria-pressed={!c.hidden}
                  aria-label={`${c.hidden ? 'Show' : 'Hide'} ${c.label}`}
                  title={c.hidden ? 'Show this class in the panel' : 'Hide this class from the panel'}
                  className="btn btn-ghost p-1 text-text-muted hover:text-text-primary"
                >
                  {c.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            {c.hidden ? (
              <p className="mt-2 text-xs text-text-muted">Hidden from Upcoming. Tap the eye to show it again.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 mt-2.5 text-xs text-text-secondary">
                  <span><b className="font-semibold text-text-primary">{week}</b> due this week</span>
                  <span><b className="font-semibold text-text-primary">{work.length}</b> left this term</span>
                  {addToTasks && <span><b className="font-semibold text-text-primary">{inTasks}</b> in your tasks</span>}
                </div>
                {next?.due_at && (
                  <Line label="Next">
                    <span className="min-w-0"><b className="font-semibold text-text-primary">{next.title}</b> · {dueLabel(next.due_at, now)}</span>
                  </Line>
                )}
                {c.course && <GradeLine course={c.course} />}
                {classTags && (
                  <Line label="Tags for tasks">
                    {tags.length > 0
                      ? tags.map(t => <TagPill key={`${t.id}-${t.name}`} tag={t} small canvas={t.name.trim().toLowerCase() === c.label.trim().toLowerCase()} />)
                      : <span className="text-text-muted">No tags</span>}
                    <button type="button" onClick={() => classTags.onEdit(c)} className="font-medium text-accent hover:underline">
                      {classTags.chosen(c) ? 'Edit' : 'Choose your own'}
                    </button>
                  </Line>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  <button
                    type="button"
                    onClick={() => onSeeDueDates(c.id)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] border border-border bg-surface-raised text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
                  >
                    <CalendarClock className="w-3 h-3" />See its due dates
                  </button>
                  {c.course && onOpenCourse && (
                    <button
                      type="button"
                      onClick={() => onOpenCourse(c.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[7px] border border-border bg-surface-raised text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:text-accent"
                    >
                      <Library className="w-3 h-3" />Modules &amp; assignments
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}
      {feed && (
        <p className="flex gap-1.5 items-start mt-4 pt-3 border-t border-border-subtle text-xs text-text-muted">
          <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Don&apos;t see a class? A class shows up once it has something on your Canvas calendar.
            {personal > 0 && ` ${personal === 1 ? '1 event' : `${personal} events`} on your own calendar ${personal === 1 ? "isn't" : "aren't"} tied to a class.`}
          </span>
        </p>
      )}
    </section>
  );
};

export default CanvasClasses;
