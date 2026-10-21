import React from 'react';
import { Award, CalendarRange } from 'lucide-react';
import type { CanvasOverview } from '@/app/types/canvas';
import { groupByDay } from '@/app/utils/canvas';
import CanvasItemRow, { type CourseLookup } from './CanvasItemRow';

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

interface CanvasUpcomingProps {
  overview: CanvasOverview;
  course: CourseLookup;
  now: Date;
}

/** Missing work, what's due over the next 7 days by day, and recently graded work. */
const CanvasUpcoming: React.FC<CanvasUpcomingProps> = ({ overview, course, now }) => {
  const days = groupByDay(overview.upcoming, now);
  return (
    <div className="space-y-4">
      {overview.missing.length > 0 && (
        <section>
          {/* Missed work, said gently: a pencil box with an amber dot, never red. */}
          <SectionLabel icon={SlippedDot}>Slipped</SectionLabel>
          <div
            className="space-y-1.5 rounded-xl p-2.5 border border-border"
            style={{ backgroundColor: 'var(--tm-slipped-subtle)' }}
          >
            <p className="text-xs text-text-secondary px-0.5 pb-0.5">
              {overview.missing.length === 1
                ? 'One thing slipped. Start with this one.'
                : `${overview.missing.length} things slipped. Start with this one.`}
            </p>
            {overview.missing.map(item => <CanvasItemRow key={`${item.kind}-${item.id}`} item={item} course={course} now={now} />)}
          </div>
        </section>
      )}

      <section>
        <SectionLabel icon={CalendarRange}>Next 7 days</SectionLabel>
        {days.length === 0 ? (
          <p className="text-sm text-text-secondary">Nothing due in the next 7 days.</p>
        ) : (
          days.map(day => (
            <div key={day.key} className="mb-2">
              <div className="flex gap-1.5 items-baseline mt-3 mb-1.5 text-xs font-semibold text-text-secondary">
                <span className="text-text-primary">{day.label}</span>
                <span>{day.date}</span>
              </div>
              <div className="space-y-1.5">
                {day.items.map(item => <CanvasItemRow key={`${item.kind}-${item.id}`} item={item} course={course} now={now} />)}
              </div>
            </div>
          ))
        )}
      </section>

      {overview.recently_graded.length > 0 && (
        <section>
          <SectionLabel icon={Award}>Recently graded</SectionLabel>
          <div className="space-y-1.5">
            {overview.recently_graded.map(item => (
              <CanvasItemRow key={`${item.kind}-${item.id}`} item={item} course={course} now={now} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default CanvasUpcoming;
