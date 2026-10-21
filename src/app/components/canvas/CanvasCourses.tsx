import React from 'react';
import { Clock, EyeOff, Library } from 'lucide-react';
import type { CanvasCourseSummary, CanvasItem } from '@/app/types/canvas';
import { dueLabel, formatNumber } from '@/app/utils/canvas';
import { SectionLabel } from './CanvasUpcoming';

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

interface CanvasCoursesProps {
  courses: CanvasCourseSummary[];
  upcoming: CanvasItem[];
  colorOf: (courseId: number) => string;
  now: Date;
  onOpen: (courseId: number) => void;
}

/** The active courses with current grades; each opens its modules, assignments and grades. */
const CanvasCourses: React.FC<CanvasCoursesProps> = ({ courses, upcoming, colorOf, now, onOpen }) => {
  const terms = [...new Set(courses.map(c => c.term).filter(Boolean))];
  return (
    <section>
      <SectionLabel icon={Library}>
        {terms.length === 1 ? `${terms[0]} · ` : ''}
        {courses.length} {courses.length === 1 ? 'course' : 'courses'}
        <span className="ml-auto normal-case tracking-normal font-medium">Current grade</span>
      </SectionLabel>
      <div className="space-y-2">
        {courses.map(course => {
          const next = upcoming.find(item => item.course_id === course.id && item.due_at);
          const score = course.grades_hidden ? null : course.period_score ?? course.current_score;
          return (
            <button
              key={course.id}
              type="button"
              onClick={() => onOpen(course.id)}
              className="w-full flex gap-3 items-stretch p-3 rounded-xl border border-border bg-surface text-left transition-colors duration-150 hover:bg-surface-raised"
            >
              <span aria-hidden className="w-1 rounded-full shrink-0" style={{ backgroundColor: colorOf(course.id) }} />
              <span className="flex-1 min-w-0">
                {course.course_code && (
                  <span className="block text-[11px] font-bold tracking-wide text-text-muted">{course.course_code}</span>
                )}
                <span className="block text-sm font-semibold text-text-primary truncate">{course.name}</span>
                {next && (
                  <span className="mt-1 flex items-center gap-1 text-xs text-text-secondary min-w-0">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">Next: {next.title} · {dueLabel(next.due_at!, now)}</span>
                  </span>
                )}
                {score != null && <GradeBar pct={score} color={colorOf(course.id)} />}
              </span>
              <span className="shrink-0 self-center">
                <CourseGrade course={course} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export default CanvasCourses;
