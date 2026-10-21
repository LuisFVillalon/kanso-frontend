import React from 'react';
import type { CanvasAnnouncement } from '@/app/types/canvas';
import { formatShortDate } from '@/app/utils/canvas';
import { CanvasLink, CourseDot, type CourseLookup } from './CanvasItemRow';

interface CanvasAnnouncementsProps {
  announcements: CanvasAnnouncement[];
  course: CourseLookup;
}

/** The last 14 days of announcements from the shown courses, newest first. */
const CanvasAnnouncements: React.FC<CanvasAnnouncementsProps> = ({ announcements, course }) => {
  if (announcements.length === 0) {
    return <p className="text-sm text-text-secondary">No announcements in the last 14 days.</p>;
  }
  return (
    <div className="space-y-1.5">
      {announcements.map(a => {
        const { label, color } = course(a.course_id);
        return (
          <article key={a.id} className="px-3 py-2.5 rounded-[10px] border border-border bg-surface">
            <div className="flex gap-2 items-center text-xs text-text-muted min-w-0">
              {a.read === false && (
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ backgroundColor: 'var(--tm-accent)' }} title="Unread" />
              )}
              {label && <CourseDot label={label} color={color} />}
              {a.author && <span className="truncate">{a.author}</span>}
              {a.posted_at && <span className="ml-auto whitespace-nowrap">{formatShortDate(a.posted_at)}</span>}
            </div>
            <h4 className="text-[13px] font-semibold text-text-primary mt-1 mb-0.5">
              <CanvasLink href={a.html_url}>{a.title}</CanvasLink>
            </h4>
            <p className="text-xs text-text-secondary line-clamp-2">{a.message}</p>
          </article>
        );
      })}
    </div>
  );
};

export default CanvasAnnouncements;
