'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { AlertCircle, Calendar, Briefcase, Sun, Hourglass } from 'lucide-react';
import { CalendarSettings } from '@/app/types/calendar';
import { CardShell } from '@/app/components/stats/CardShell';
import TileTools from '@/app/components/stats/TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';
import { parseLocalDate, formatLongDate } from '@/app/utils/dateUtils';
import { useMidnightTick } from '@/app/hooks/useMidnightTick';
import { computeTermProgress, type TermProgress } from '@/app/utils/termProgress';

interface Progress extends TermProgress {
  start: Date;
  end: Date;
}

// ── Shared calc — used by both the compact tile and the overlay ─────────────
// `settings` and `loading` are lifted into TaskManager (useCalendarSettings)
// and threaded down as props, the same source of truth Settings writes to
// via saveCalendarSettings — so a save there is reflected here immediately,
// with no independent fetch (and no manual refresh) needed.

const useBigPictureCalendar = (settings: CalendarSettings, loading: boolean) => {
  const currentDate = useMidnightTick();
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (loading) return;
    requestAnimationFrame(() => requestAnimationFrame(() => setFadeIn(true)));
  }, [loading]);

  const progress = useMemo<Progress | null>(() => {
    const start = parseLocalDate(settings.start_date);
    const end = parseLocalDate(settings.end_date);
    const termProgress = computeTermProgress(start, end, currentDate);
    return termProgress && { ...termProgress, start, end };
  }, [settings.start_date, settings.end_date, currentDate]);

  return { loading, fadeIn, cur: settings, progress, currentDate };
};

// ── Progress ring (shared geometry, different sizes for compact vs. overlay) ─

interface ProgressRingProps {
  pct: number;
  size: number;
  strokeWidth: number;
  pctFontSize: number;
}

const CalendarProgressRing: React.FC<ProgressRingProps> = ({ pct, size, strokeWidth, pctFontSize }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tm-surface-raised)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tm-accent)" strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct / 100)}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-bold leading-none" style={{ color: 'var(--tm-accent)', fontSize: pctFontSize }}>{pct}%</span>
        <span className="text-[9px] sm:text-[10px] text-text-muted font-medium mt-1">complete</span>
      </div>
    </div>
  );
};

// ── Compact tile ──────────────────────────────────────────────────────────────

const CompactStatTile: React.FC<{ label: string; value: number; color: string; bg: string }> = ({ label, value, color, bg }) => (
  <div className="rounded-lg border border-border-subtle flex flex-col gap-0.5" style={{ padding: '6px 8px', backgroundColor: bg }}>
    <span className="text-[10px] font-semibold leading-none" style={{ color }}>{label}</span>
    <span className="text-[17px] font-bold leading-none text-text-primary">{value}</span>
  </div>
);

const NotInSessionCompact: React.FC<{ today: Date }> = ({ today }) => (
  <div className="flex-1 min-h-0 rounded-lg border border-border-subtle flex items-start gap-2 p-2" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
    <AlertCircle className="w-3.5 h-3.5 text-text-muted flex-shrink-0 mt-0.5" />
    <p className="text-[11px] text-text-muted">Not in session — {formatLongDate(today)} is outside the configured range.</p>
  </div>
);

interface BigPictureCalendarProps {
  settings: CalendarSettings;
  settingsLoading: boolean;
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

/**
 * Compact dashboard tile: static kicker/title (editing lives in Settings →
 * Big Picture now), the days-remaining headline + a 104px ring, and the
 * four stat tiles compressed (sub-labels dropped). Full detail — the 128px
 * ring, full stat tiles, and date-range line — is in the overlay below.
 */
const BigPictureCalendar: React.FC<BigPictureCalendarProps> = ({ settings, settingsLoading, onExpand, dragHandleProps }) => {
  const { loading, cur, progress, currentDate } = useBigPictureCalendar(settings, settingsLoading);

  if (loading) {
    return (
      <CardShell compact icon={<Hourglass className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />} header="Big Picture">
        <div className="flex-1 min-h-0 animate-pulse rounded-lg" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />
      </CardShell>
    );
  }

  return (
    <CardShell
      compact
      icon={<Hourglass className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header={cur.title || 'Big Picture'}
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      {progress ? (
        <div className="flex-1 min-h-0 flex flex-col gap-2.5">
          <div className="flex items-center gap-4 flex-1 min-h-0">
            <div className="flex-1 min-w-0 flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-[44px] font-bold leading-none" style={{ color: 'var(--tm-accent)' }}>{progress.daysRemaining}</span>
                <span className="text-[13px] font-medium text-text-secondary">{progress.daysRemaining === 1 ? 'day left' : 'days left'} until {formatLongDate(progress.end)}</span>
              </div>
              <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary w-fit">
                You&rsquo;re in
                <span className="chip font-bold" style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)', fontSize: 11, padding: '3px 10px' }}>
                  Week {progress.weekNumber} of {progress.totalWeeks}
                </span>
              </span>
            </div>
            <CalendarProgressRing pct={progress.pct} size={104} strokeWidth={9} pctFontSize={22} />
          </div>
          <div className="grid grid-cols-4 gap-1.5 flex-shrink-0">
            <CompactStatTile label="Days In" value={progress.daysInto} color="var(--tm-accent-2)" bg="var(--tm-accent-2-subtle)" />
            <CompactStatTile label="Weeks" value={progress.weeksRemaining} color="var(--tm-warning)" bg="var(--tm-warning-subtle)" />
            <CompactStatTile label="Weekdays" value={progress.businessDaysRemaining} color="var(--tm-success)" bg="var(--tm-success-subtle)" />
            <CompactStatTile label="Weekends" value={progress.weekendDaysRemaining} color="var(--tm-accent)" bg="var(--tm-accent-subtle)" />
          </div>
        </div>
      ) : (
        <NotInSessionCompact today={currentDate} />
      )}
    </CardShell>
  );
};

// ── Overlay ──────────────────────────────────────────────────────────────────

const FullStatTile: React.FC<{ icon: React.ReactNode; title: string; value: number; subLabel: string; color: string; bg: string }> = ({ icon, title, value, subLabel, color, bg }) => (
  <div className="p-3 rounded-lg border border-border-subtle flex flex-col gap-1" style={{ backgroundColor: bg }}>
    <span className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold" style={{ color }}>{icon}{title}</span>
    <span className="text-xl sm:text-2xl font-bold leading-none text-text-primary">{value}</span>
    <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-text-muted">{subLabel}</span>
  </div>
);

/** Full-detail body rendered inside the shared expand overlay. */
export const BigPictureOverlay: React.FC<{ settings: CalendarSettings; settingsLoading: boolean }> = ({ settings, settingsLoading }) => {
  const { loading, cur, progress, currentDate } = useBigPictureCalendar(settings, settingsLoading);

  if (loading) {
    return <div className="h-64 animate-pulse rounded-lg" style={{ backgroundColor: 'var(--tm-surface-raised)' }} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {progress ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
            <div className="flex flex-col gap-3">
              <p className="text-lg sm:text-xl font-semibold text-text-primary flex items-center flex-wrap gap-2">
                You&rsquo;re in
                <span className="chip font-bold" style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}>
                  Week {progress.weekNumber} of {progress.totalWeeks}
                </span>
              </p>
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <span className="text-5xl sm:text-6xl font-bold leading-none" style={{ color: 'var(--tm-accent)' }}>{progress.daysRemaining}</span>
                <span className="text-sm sm:text-base text-text-secondary font-medium">
                  {progress.daysRemaining === 1 ? 'day left' : 'days left'} until {formatLongDate(progress.end)}
                </span>
              </div>
            </div>
            <div className="justify-self-center">
              <CalendarProgressRing pct={progress.pct} size={128} strokeWidth={10} pctFontSize={30} />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <FullStatTile icon={<Calendar className="w-3.5 h-3.5" />} title="Days In" value={progress.daysInto} subLabel="Completed" color="var(--tm-accent-2)" bg="var(--tm-accent-2-subtle)" />
            <FullStatTile icon={<Calendar className="w-3.5 h-3.5" />} title="Weeks" value={progress.weeksRemaining} subLabel="Remaining" color="var(--tm-warning)" bg="var(--tm-warning-subtle)" />
            <FullStatTile icon={<Briefcase className="w-3.5 h-3.5" />} title="Weekdays" value={progress.businessDaysRemaining} subLabel="Remaining" color="var(--tm-success)" bg="var(--tm-success-subtle)" />
            <FullStatTile icon={<Sun className="w-3.5 h-3.5" />} title="Weekends" value={progress.weekendDaysRemaining} subLabel="Remaining" color="var(--tm-accent)" bg="var(--tm-accent-subtle)" />
          </div>
        </>
      ) : (
        <div className="p-5 rounded-lg border border-border-subtle flex items-start gap-3" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
          <AlertCircle className="w-5 h-5 text-text-muted flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-bold text-text-primary mb-0.5">Not Currently In Session</h2>
            <p className="text-sm text-text-muted">
              Today ({formatLongDate(currentDate)}) is outside the configured date range. Adjust the range in Settings.
            </p>
          </div>
        </div>
      )}

      <p className="text-xs text-text-muted">
        Range: {formatLongDate(progress?.start ?? parseLocalDate(cur.start_date))} – {formatLongDate(progress?.end ?? parseLocalDate(cur.end_date))} · edit in Settings → Big Picture
      </p>
    </div>
  );
};

export default BigPictureCalendar;
