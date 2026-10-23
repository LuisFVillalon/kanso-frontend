import React, { useState } from 'react';
import {
  BadgeCheck, Check, ChevronLeft, ChevronRight, CircleCheck, CircleDashed, File, FileText, ListChecks, Lock,
  MessagesSquare, BookOpen, Link as LinkIcon, type LucideIcon,
} from 'lucide-react';
import type { CanvasAssignment, CanvasCourseSummary, CanvasModule, CanvasModuleItem } from '@/app/types/canvas';
import { useCanvasCourse, type CanvasCourseView } from '@/app/hooks/useCanvas';
import { formatNumber, formatShortDate, scoreLabel } from '@/app/utils/canvas';
import CanvasItemRow, { CanvasLink, CanvasStatusChip, type CanvasRowAdd, type CourseLookup } from './CanvasItemRow';
import { CourseGrade, GradeBar } from './CanvasClasses';

type CourseTab = CanvasCourseView | 'grades';

const COURSE_TABS: { key: CourseTab; label: string }[] = [
  { key: 'modules', label: 'Modules' },
  { key: 'assignments', label: 'Assignments & quizzes' },
  { key: 'grades', label: 'Grades' },
];

const MODULE_ITEM_ICONS: Record<string, LucideIcon> = {
  Assignment: FileText,
  Quiz: ListChecks,
  Discussion: MessagesSquare,
  Page: BookOpen,
  File,
  ExternalUrl: LinkIcon,
  ExternalTool: LinkIcon,
};

const REQUIREMENTS: Record<string, string> = {
  must_view: 'View',
  must_submit: 'Submit',
  must_contribute: 'Contribute',
  must_mark_done: 'Mark done',
};

const requirementLabel = (requirement: NonNullable<CanvasModuleItem['requirement']>) =>
  requirement.type === 'min_score'
    ? `Score ≥ ${requirement.min_score != null ? formatNumber(requirement.min_score) : '?'}`
    : REQUIREMENTS[requirement.type] ?? requirement.type.replace(/_/g, ' ');

const ModuleRow: React.FC<{ module: CanvasModule }> = ({ module }) => {
  const required = module.items.filter(item => item.requirement);
  const done = required.filter(item => item.requirement!.completed).length;
  const StateIcon = module.state === 'completed' ? CircleCheck : module.state === 'locked' ? Lock : CircleDashed;
  const progress = module.state === 'locked'
    ? module.unlock_at ? `Unlocks ${formatShortDate(module.unlock_at)}` : 'Locked'
    : required.length > 0 ? `${done}/${required.length} done` : null;
  return (
    <details className="group rounded-[10px] border border-border bg-surface overflow-hidden" open={module.state === 'started'}>
      <summary className="list-none [&::-webkit-details-marker]:hidden flex gap-2 items-center px-3 py-2.5 cursor-pointer text-[13px] font-semibold text-text-primary">
        <ChevronRight className="w-3.5 h-3.5 shrink-0 text-text-muted transition-transform duration-150 group-open:rotate-90" />
        <StateIcon
          className="w-3.5 h-3.5 shrink-0"
          style={{ color: module.state === 'completed' ? 'var(--tm-success)' : 'var(--tm-text-muted)' }}
        />
        <span className="min-w-0 truncate">{module.name}</span>
        {progress && <span className="ml-auto text-[11px] font-medium text-text-muted whitespace-nowrap">{progress}</span>}
      </summary>
      <ul className="px-3 pb-2">
        {module.items.map(item => {
          const completed = !!item.requirement?.completed;
          const Icon = completed ? Check : item.locked ? Lock : MODULE_ITEM_ICONS[item.type] ?? File;
          if (item.type === 'SubHeader') {
            return (
              <li key={item.id} className="pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted border-t border-border-subtle">
                {item.title}
              </li>
            );
          }
          return (
            <li
              key={item.id}
              className={`flex gap-2 items-center py-1.5 border-t border-border-subtle text-[13px] ${item.locked ? 'text-text-muted' : 'text-text-primary'}`}
              style={{ paddingLeft: `${12 + item.indent * 12}px` }}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" style={completed ? { color: 'var(--tm-success)' } : undefined} />
              <CanvasLink href={item.locked ? null : item.html_url} className="min-w-0 truncate">{item.title}</CanvasLink>
              {item.requirement && (
                <span className="ml-auto text-[11px] text-text-muted whitespace-nowrap">{requirementLabel(item.requirement)}</span>
              )}
            </li>
          );
        })}
        {!module.items_complete && (
          <li className="py-1.5 border-t border-border-subtle text-xs text-text-muted">More items in Canvas.</li>
        )}
      </ul>
    </details>
  );
};

const Assignments: React.FC<{
  assignments: CanvasAssignment[];
  course: CourseLookup;
  now: Date;
  addToTasks?: CanvasRowAdd;
}> = ({ assignments, course, now, addToTasks }) => {
  const isPast = (a: CanvasAssignment) => !!a.due_at && new Date(a.due_at) < now;
  const groups = [
    { label: 'Upcoming', items: assignments.filter(a => !isPast(a)) },
    { label: 'Past', items: assignments.filter(isPast).reverse() },
  ].filter(group => group.items.length > 0);
  if (groups.length === 0) return <p className="text-sm text-text-secondary">No assignments or quizzes in this course.</p>;
  return (
    <>
      {groups.map(group => (
        <div key={group.label}>
          <div className="mt-3 mb-1.5 text-xs font-semibold text-text-primary">{group.label}</div>
          <div className="space-y-1.5">
            {group.items.map(a => <CanvasItemRow key={a.id} item={a} course={course} now={now} addToTasks={addToTasks} />)}
          </div>
        </div>
      ))}
    </>
  );
};

const Grades: React.FC<{ assignments: CanvasAssignment[]; color: string }> = ({ assignments, color }) => {
  const graded = assignments
    .filter(a => a.submission?.graded && !a.submission.excused)
    .sort((a, b) => (b.submission!.graded_at ?? '').localeCompare(a.submission!.graded_at ?? ''));
  if (graded.length === 0) return <p className="text-sm text-text-secondary">Nothing graded yet.</p>;
  return (
    <>
      <p className="text-xs text-text-muted mb-2">The current grade counts graded work only, as Canvas shows it.</p>
      <div className="space-y-1.5">
        {graded.map(a => {
          const score = a.submission!.score;
          return (
            <div key={a.id} className="flex gap-2.5 items-start p-2.5 rounded-[10px] border border-border bg-surface">
              <span
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)' }}
              >
                <BadgeCheck className="w-3.5 h-3.5" />
              </span>
              <div className="flex-1 min-w-0">
                <CanvasLink href={a.html_url} className="block text-[13px] font-semibold text-text-primary break-words">{a.title}</CanvasLink>
                {score != null && a.points_possible ? <GradeBar pct={(score / a.points_possible) * 100} color={color} /> : null}
              </div>
              <CanvasStatusChip status={{ kind: 'done', label: scoreLabel(a) ?? 'Graded' }} />
            </div>
          );
        })}
      </div>
    </>
  );
};

interface CanvasCourseDetailProps {
  course: CanvasCourseSummary;
  color: string;
  lookup: CourseLookup;
  now: Date;
  refreshNonce: number;
  onFail: (err: unknown) => void;
  onBack: () => void;
  addToTasks?: CanvasRowAdd;
}

/** One course opened from the Courses tab: grade, then Modules, Assignments & quizzes, and Grades. */
const CanvasCourseDetail: React.FC<CanvasCourseDetailProps> = ({
  course, color, lookup, now, refreshNonce, onFail, onBack, addToTasks,
}) => {
  const [tab, setTab] = useState<CourseTab>('modules');
  const { modules, assignments, error } = useCanvasCourse(course.id, tab === 'modules' ? 'modules' : 'assignments', {
    onFail,
    refreshNonce,
  });
  const loaded = tab === 'modules' ? modules : assignments;

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex gap-1 items-center text-xs font-medium text-text-secondary hover:text-text-primary py-0.5"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        All courses
      </button>
      <div
        className="flex gap-3 items-center mt-2 p-3 rounded-xl"
        style={{
          backgroundColor: `color-mix(in srgb, ${color} 12%, var(--tm-surface))`,
          border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        }}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-bold text-text-muted">
            {[course.course_code, course.term].filter(Boolean).join(' · ')}
          </div>
          <CanvasLink href={course.html_url} className="block text-[15px] font-semibold text-text-primary">{course.name}</CanvasLink>
        </div>
        <CourseGrade course={course} />
      </div>

      <div role="tablist" aria-label="Course sections" className="inline-flex flex-wrap gap-0.5 p-[3px] rounded-full my-2.5" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
        {COURSE_TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="px-3 py-1 rounded-full text-xs font-medium"
            style={tab === key
              ? { backgroundColor: 'var(--tm-surface)', color: 'var(--tm-text-primary)', boxShadow: 'var(--tm-shadow-nav)' }
              : { color: 'var(--tm-text-muted)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-text-secondary">{error}</p>
      ) : !loaded ? (
        <div className="space-y-2" aria-label="Loading">
          {[0, 1, 2].map(i => <div key={i} className="h-10 rounded-[10px] animate-shimmer" />)}
        </div>
      ) : tab === 'modules' ? (
        modules!.modules.length === 0
          ? <p className="text-sm text-text-secondary">This course has no modules.</p>
          : <div className="space-y-1.5">{modules!.modules.map(m => <ModuleRow key={m.id} module={m} />)}</div>
      ) : tab === 'assignments' ? (
        <Assignments assignments={assignments!.assignments} course={lookup} now={now} addToTasks={addToTasks} />
      ) : (
        <Grades assignments={assignments!.assignments} color={color} />
      )}
    </div>
  );
};

export default CanvasCourseDetail;
