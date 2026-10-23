'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Bed, Blinds, Briefcase, Grid2x2, Hourglass, PartyPopper, Smile, Timer as TimerIcon } from 'lucide-react';
import { CalendarSettings } from '@/app/types/calendar';
import { CardShell } from '@/app/components/stats/CardShell';
import { parseLocalDate, formatLongDate } from '@/app/utils/dateUtils';
import { useMidnightTick } from '@/app/hooks/useMidnightTick';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { dayWindowOn } from '@/app/lib/restDays';
import { isInTerm, termEndInstant } from '@/app/utils/termProgress';
import { computeDayRun, type DayKind, type DayRunState } from '@/app/utils/dayRuns';
import TileTools from './TileTools';
import type { DragHandleProps } from '@/app/components/common/DraggableGrid';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

// ── Countdown ─────────────────────────────────────────────────────────────────

interface CountdownParts {
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const ZERO_PARTS: CountdownParts = { months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

// Calendar-aware breakdown (respects real month lengths) of the time
// remaining between `from` and `to`.
const diffParts = (from: Date, to: Date): CountdownParts => {
  if (to <= from) return ZERO_PARTS;

  const monthsAgo = (n: number) =>
    new Date(from.getFullYear(), from.getMonth() + n, from.getDate(), from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds());

  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (monthsAgo(months) > to) months -= 1;

  let rest = to.getTime() - monthsAgo(months).getTime();
  const days = Math.floor(rest / 86_400_000); rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000); rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000); rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1_000);

  return { months, days, hours, minutes, seconds };
};

const COUNTDOWN_UNITS: { key: keyof CountdownParts; label: string; width: number }[] = [
  { key: 'months',  label: 'Months', width: 2 },
  { key: 'days',    label: 'Days',   width: 2 },
  { key: 'hours',   label: 'Hours',  width: 2 },
  { key: 'minutes', label: 'Min',    width: 2 },
  { key: 'seconds', label: 'Sec',    width: 2 },
];

/**
 * Live-ticking countdown to the close of `endDate` (the term's last day
 * counts in full, matching the Term Tracker), broken into months/days/h/m/s.
 * Ticks once a second — no need for anything finer now the display stops
 * at seconds — and owns its own state so only this subtree re-renders.
 */
const CountdownClock: React.FC<{ endDate: Date }> = ({ endDate }) => {
  // Keyed on the timestamp, not the Date: callers rebuild `endDate` every
  // render, and a fresh identity would reset the interval before it fires.
  const endTime = endDate.getTime();
  const target = useMemo(() => termEndInstant(new Date(endTime)), [endTime]);
  const [parts, setParts] = useState<CountdownParts>(() => diffParts(new Date(), target));

  useEffect(() => {
    const interval = setInterval(() => setParts(diffParts(new Date(), target)), 1000);
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div
      className="p-3 sm:p-4 rounded-lg border border-border-subtle"
      style={{ backgroundColor: 'var(--tm-accent-subtle)' }}
    >
      <p
        className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide mb-2.5"
        style={{ color: 'var(--tm-accent)' }}
      >
        <Hourglass className="w-3.5 h-3.5" />
        Countdown to end of {formatLongDate(endDate)}
      </p>
      <div className="grid grid-cols-5 divide-x divide-border-subtle">
        {COUNTDOWN_UNITS.map(unit => (
          <div key={unit.key} className="flex flex-col items-center gap-0.5 px-0.5 sm:px-1 min-w-0">
            <span
              className="text-base sm:text-2xl md:text-3xl font-bold leading-none tabular-nums"
              style={{ color: 'var(--tm-accent)' }}
            >
              {pad(parts[unit.key], unit.width)}
            </span>
            <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Work days / Days off timers ────────────────────────────────────────────────
// Driven by the user's rest days (Settings → Work day and rest). "Days off" are the
// rest days; "Work days" are every other day. Whichever kind today is counts
// down to the end of its current run of consecutive days (runs may wrap the
// week — see utils/dayRuns.ts); the other shows the length of its next run.

interface PeriodParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
}

const PERIOD_UNITS: { key: keyof PeriodParts; label: string; width?: number }[] = [
  { key: 'days',    label: 'Days' },
  { key: 'hours',   label: 'Hours' },
  { key: 'minutes', label: 'Min' },
  { key: 'seconds', label: 'Sec' },
];

// Hours/Min/Sec only — used by the expanded Daily Window card, which counts
// down over hours so sub-second resolution just adds noise.
const HOUR_MIN_SEC_UNITS: { key: keyof PeriodParts; label: string; width?: number }[] = [
  { key: 'hours',   label: 'Hours' },
  { key: 'minutes', label: 'Min' },
  { key: 'seconds', label: 'Sec' },
];

// Straight ms breakdown — no calendar-month awareness needed since these
// periods never exceed a few days.
const shortDiffParts = (from: Date, to: Date): PeriodParts => {
  let rest = Math.max(0, to.getTime() - from.getTime());
  const days = Math.floor(rest / 86_400_000); rest -= days * 86_400_000;
  const hours = Math.floor(rest / 3_600_000); rest -= hours * 3_600_000;
  const minutes = Math.floor(rest / 60_000); rest -= minutes * 60_000;
  const seconds = Math.floor(rest / 1_000); rest -= seconds * 1_000;
  const milliseconds = rest;
  return { days, hours, minutes, seconds, milliseconds };
};

const daysParts = (days: number): PeriodParts => ({ days, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 });

interface DayRunDisplay {
  active: boolean;
  parts: PeriodParts;
  /** Replaces the countdown when there is no run to count (every day / never). */
  message?: string;
  compactMessage?: string;
  statusLabel?: string;
}

const DAY_RUN_COPY: Record<DayKind, { everyDay: string; never: string }> = {
  work: { everyDay: 'Every day is a work day — no days off set in Settings → Work day and rest', never: 'No work days — every day is set as a day off' },
  off: { everyDay: 'Every day is a day off', never: 'No days off set in Settings → Work day and rest' },
};

const describeDayRun = (now: Date, kind: DayKind, run: DayRunState): DayRunDisplay => {
  switch (run.status) {
    case 'active': return { active: true, parts: shortDiffParts(now, run.end) };
    case 'upcoming': return { active: false, parts: daysParts(run.lengthDays) };
    case 'everyDay': return { active: true, parts: daysParts(0), message: DAY_RUN_COPY[kind].everyDay, compactMessage: 'Every day' };
    case 'never': return { active: false, parts: daysParts(0), message: DAY_RUN_COPY[kind].never, compactMessage: 'None set', statusLabel: 'None' };
  }
};

const describeDayRuns = (now: Date, restDays: number[]) => ({
  work: describeDayRun(now, 'work', computeDayRun(now, restDays, 'work')),
  off: describeDayRun(now, 'off', computeDayRun(now, restDays, 'off')),
});

interface PeriodTimerCardProps {
  icon: React.ReactNode;
  label: string;
  labelSuffix?: React.ReactNode;
  active: boolean;
  parts: PeriodParts;
  color: string;
  bg: string;
  units?: { key: keyof PeriodParts; label: string; width?: number }[];
  /** Shown in place of the countdown grid. */
  message?: string;
  statusLabel?: string;
}

const PeriodTimerCard: React.FC<PeriodTimerCardProps> = ({
  icon, label, labelSuffix, active, parts, color, bg, units = PERIOD_UNITS, message, statusLabel,
}) => (
  <div className="p-3 sm:p-4 rounded-lg border border-border-subtle" style={{ backgroundColor: bg }}>
    <div className="flex items-center gap-1.5 mb-2.5">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color }}>
        {icon}
        {label}
        {labelSuffix && (
          <span className="normal-case font-normal tracking-normal text-text-muted">{labelSuffix}</span>
        )}
      </span>
      <span
        className="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
        style={{
          backgroundColor: active ? color : 'var(--tm-surface-raised)',
          color: active ? 'var(--tm-accent-text)' : 'var(--tm-text-muted)',
        }}
      >
        {statusLabel ?? (active ? 'Now' : 'Upcoming')}
      </span>
    </div>
    {message ? (
      <p className="text-xs sm:text-sm font-medium text-text-secondary">{message}</p>
    ) : (
      <div className={`grid ${units.length === 3 ? 'grid-cols-3' : 'grid-cols-4'} divide-x divide-border-subtle`}>
        {units.map(unit => (
          <div key={unit.key} className="flex flex-col items-center gap-0.5 px-0.5 sm:px-1 min-w-0">
            <span
              className="text-base sm:text-xl md:text-2xl font-bold leading-none tabular-nums"
              style={{ color }}
            >
              {pad(parts[unit.key], unit.width ?? 2)}
            </span>
            <span className="text-[8px] sm:text-[10px] font-semibold uppercase tracking-wide text-text-muted whitespace-nowrap">
              {unit.label}
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);

/**
 * Side-by-side Work days / Days off timers, from the user's rest days.
 * Whichever kind today is counts down to the end of its run; the other
 * shows the length of its next run until its turn comes around.
 */
const DayRunTimers: React.FC<{ restDays: number[] }> = ({ restDays }) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { work, off } = describeDayRuns(now, restDays);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PeriodTimerCard
        icon={work.active ? <Briefcase className="w-3.5 h-3.5" /> : <Bed className="w-3.5 h-3.5" />}
        label="Work days"
        active={work.active}
        parts={work.parts}
        message={work.message}
        statusLabel={work.statusLabel}
        color="var(--tm-success)"
        bg="var(--tm-success-subtle)"
      />
      <PeriodTimerCard
        icon={off.active ? <PartyPopper className="w-3.5 h-3.5" /> : <Smile className="w-3.5 h-3.5" />}
        label="Days off"
        active={off.active}
        parts={off.parts}
        message={off.message}
        statusLabel={off.statusLabel}
        color="var(--tm-accent-2)"
        bg="var(--tm-accent-2-subtle)"
      />
    </div>
  );
};

// ── Daily window timer (from the user's profile) ───────────────────────────────
// Settings → Work day and rest lets the user set "Day starts" and "Call it a
// day" (the profile's `day_start_time` / `shutoff_time`), and optionally
// different hours on some weekdays (`day_windows`). This is today's window:
// while `now` falls inside it, it counts down to the shutoff time; otherwise
// it shows the fixed length of the window (e.g. 08:00–22:00 → 14h 0m).

const timeStringToMinutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
};

// `hm` ("HH:MM") applied to the calendar date of `base`.
const buildTimeOnDate = (base: Date, hm: string): Date => {
  const [h, m] = hm.split(':').map(Number);
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
};

interface DailyWindowState {
  active: boolean;
  parts: PeriodParts;
  /** Today's window, "HH:MM" each. */
  start: string;
  end: string;
}

// Whether `now` falls inside today's [dayStart, dayEnd) window on a non-rest
// day, and the countdown-or-fixed-length parts to show for it — shared by
// the expanded DailyWindowTimer card and the compact tile's daily-window
// row so the two can never disagree about whether the window is active.
const computeDailyWindow = (now: Date, profile: ProfileFields): DailyWindowState => {
  const { start: dayStart, end: dayEnd } = dayWindowOn(now.getDay(), profile.dayStartTime, profile.shutoffTime, profile.dayWindows);
  const { restDays } = profile;
  const startMinutes = timeStringToMinutes(dayStart);
  const endMinutes = timeStringToMinutes(dayEnd);
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const isRestDay = restDays.includes(now.getDay());
  // Windows that cross midnight (end <= start) aren't supported here — they
  // just render as the static length, never "active". Rest days never count
  // down either — the window just shows its length for the day off.
  const spansSameDay = endMinutes > startMinutes;
  const active = !isRestDay && spansSameDay && nowMinutes >= startMinutes && nowMinutes < endMinutes;

  const periodLength: PeriodParts = {
    days: 0,
    hours: Math.floor(Math.max(0, endMinutes - startMinutes) / 60),
    minutes: Math.max(0, endMinutes - startMinutes) % 60,
    seconds: 0,
    milliseconds: 0,
  };

  return { active, parts: active ? shortDiffParts(now, buildTimeOnDate(now, dayEnd)) : periodLength, start: dayStart, end: dayEnd };
};

// The profile comes from the shared useProfile hook (see
// TaskManager.tsx), threaded down via TimersCardProps below — reading them
// as props instead of an independent localStorage/fetchProfile snapshot
// means this stays in sync if the user edits them in Settings while this
// card is already mounted, which the old snapshot-on-mount version couldn't.
const DailyWindowTimer: React.FC<{ profile: ProfileFields }> = ({ profile }) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { active, parts, start, end } = computeDailyWindow(now, profile);

  return (
    <PeriodTimerCard
      icon={active ? <Grid2x2 className="w-3.5 h-3.5" /> : <Blinds className="w-3.5 h-3.5" />}
      label="Daily Window"
      labelSuffix={`(${start} – ${end})`}
      active={active}
      parts={parts}
      color="var(--tm-warning)"
      bg="var(--tm-warning-subtle)"
      units={HOUR_MIN_SEC_UNITS}
    />
  );
};

// ── Compact row (dashboard tile) ────────────────────────────────────────────────
// One-line readout shared by the three compact rows — icon, label, live
// time right-aligned in tabular-nums, and a status dot (filled in the
// timer's color while running, muted while upcoming) instead of the full
// card's NOW/UPCOMING pill, which only fits at full size.

const formatCompactTime = (parts: PeriodParts): string =>
  parts.days > 0 ? `${parts.days}d ${pad(parts.hours, 2)}:${pad(parts.minutes, 2)}` : `${pad(parts.hours, 2)}:${pad(parts.minutes, 2)}:${pad(parts.seconds, 2)}`;

interface CompactTimerRowProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
  active: boolean;
  parts: PeriodParts;
  /** Shown in place of the time readout. */
  message?: string;
}

const CompactTimerRow: React.FC<CompactTimerRowProps> = ({ icon, label, color, bg, active, parts, message }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5 min-w-0" style={{ backgroundColor: bg }}>
    <span className="flex-shrink-0" style={{ color }}>{icon}</span>
    <span className="text-[11px] font-semibold truncate min-w-0" style={{ color }}>{label}</span>
    <span className="ml-auto text-[13px] font-bold tabular-nums whitespace-nowrap flex-shrink-0" style={{ color }}>
      {message ?? formatCompactTime(parts)}
    </span>
    <span
      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
      style={{ backgroundColor: active ? color : 'var(--tm-border)' }}
      title={active ? 'Running now' : 'Upcoming'}
    />
  </div>
);

// ── Skeleton ──────────────────────────────────────────────────────────────────

const Bone: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div
    className={`animate-pulse rounded-sm ${className}`}
    style={{ backgroundColor: 'var(--tm-border-subtle)' }}
  />
);

const TimersCardSkeleton: React.FC = () => (
  <CardShell compact icon={<TimerIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" style={{ color: 'var(--tm-accent)' }} />} header="Timers">
    <div className="flex-1 flex flex-col justify-center gap-2">
      {[0, 1, 2].map(i => <Bone key={i} className="h-8 rounded-lg" />)}
    </div>
  </CardShell>
);

const TimersOverlaySkeleton: React.FC = () => (
  <div className="flex flex-col gap-3">
    <div className="p-3 sm:p-4 rounded-lg border border-border-subtle" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
      <Bone className="h-3 w-24 mb-2.5" />
      <div className="grid grid-cols-3 gap-1">
        {[0, 1, 2].map(i => <Bone key={i} className="h-6 sm:h-8" />)}
      </div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[0, 1].map(i => (
        <div key={i} className="p-3 sm:p-4 rounded-lg border border-border-subtle" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
          <Bone className="h-3 w-20 mb-2.5" />
          <div className="grid grid-cols-4 gap-1">
            {[0, 1, 2, 3].map(j => <Bone key={j} className="h-6 sm:h-8" />)}
          </div>
        </div>
      ))}
    </div>
    <div className="p-3 sm:p-4 rounded-lg border border-border-subtle" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
      <Bone className="h-3 w-28 mb-2.5" />
      <div className="grid grid-cols-5 gap-1">
        {[0, 1, 2, 3, 4].map(i => <Bone key={i} className="h-6 sm:h-8" />)}
      </div>
    </div>
  </div>
);

// ── Shared session state ─────────────────────────────────────────────────────
// Both the compact tile and the overlay need the same "is now inside the
// configured range" check. `settings` and `loading` come from TaskManager's
// useCalendarSettings — the same source the Term Tracker card and Settings
// use — so a term edited in Settings shows up here immediately.

const useTimersSession = (settings: CalendarSettings, loading: boolean) => {
  const currentDate = useMidnightTick();
  const start = parseLocalDate(settings.start_date);
  const end = parseLocalDate(settings.end_date);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const inSession = isInTerm(start, end, today);

  return { loading, inSession, end, today };
};

const NotInSessionNotice: React.FC<{ today: Date; compact?: boolean }> = ({ today, compact }) => (
  <div
    className={`rounded-lg border border-border-subtle flex items-start gap-2 ${compact ? 'p-2' : 'p-3 sm:p-4 gap-2.5'}`}
    style={{ backgroundColor: 'var(--tm-surface-raised)' }}
  >
    <AlertCircle className={`text-text-muted flex-shrink-0 mt-0.5 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} />
    <p className={`text-text-muted ${compact ? 'text-[11px]' : 'text-xs sm:text-sm'}`}>
      No active countdown — {formatLongDate(today)} is outside the date range set in the Term Tracker card.
    </p>
  </div>
);

// ── Component ─────────────────────────────────────────────────────────────────
// Standalone, draggable sibling of BigPictureCalendar's other stat cards.
// Reads the shared CalendarSettings (start/end date) so it knows whether
// "now" falls inside the configured range — the daily/weekly timers
// and the countdown only make sense relative to that active window.

interface TimersCardProps {
  profile: ProfileFields;
  settings: CalendarSettings;
  settingsLoading: boolean;
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

const TimersCard: React.FC<TimersCardProps> = ({ profile, settings, settingsLoading, onExpand, dragHandleProps }) => {
  const { loading, inSession, today } = useTimersSession(settings, settingsLoading);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <TimersCardSkeleton />;

  const { work, off } = describeDayRuns(now, profile.restDays);
  const { active: dailyActive, parts: dailyParts } = computeDailyWindow(now, profile);

  return (
    <CardShell
      compact
      icon={<TimerIcon className="w-3.5 h-3.5" style={{ color: 'var(--tm-accent)' }} />}
      header="Timers"
      headerAction={<TileTools onExpand={onExpand} dragHandleProps={dragHandleProps} />}
    >
      <div className="flex-1 min-h-0 flex flex-col justify-center gap-1.5">
        {inSession ? (
          <>
            <CompactTimerRow
              icon={dailyActive ? <Grid2x2 className="w-3.5 h-3.5" /> : <Blinds className="w-3.5 h-3.5" />}
              label="Daily window"
              color="var(--tm-warning)"
              bg="var(--tm-warning-subtle)"
              active={dailyActive}
              parts={dailyParts}
            />
            <CompactTimerRow
              icon={work.active ? <Briefcase className="w-3.5 h-3.5" /> : <Bed className="w-3.5 h-3.5" />}
              label="Work days"
              color="var(--tm-success)"
              bg="var(--tm-success-subtle)"
              active={work.active}
              parts={work.parts}
              message={work.compactMessage}
            />
            <CompactTimerRow
              icon={off.active ? <PartyPopper className="w-3.5 h-3.5" /> : <Smile className="w-3.5 h-3.5" />}
              label="Days off"
              color="var(--tm-accent-2)"
              bg="var(--tm-accent-2-subtle)"
              active={off.active}
              parts={off.parts}
              message={off.compactMessage}
            />
          </>
        ) : (
          <NotInSessionNotice today={today} compact />
        )}
      </div>
    </CardShell>
  );
};

/** Full-detail body rendered inside the shared expand overlay. */
export const TimersOverlay: React.FC<{ profile: ProfileFields; settings: CalendarSettings; settingsLoading: boolean }> = ({ profile, settings, settingsLoading }) => {
  const { loading, inSession, end, today } = useTimersSession(settings, settingsLoading);

  if (loading) return <TimersOverlaySkeleton />;

  return (
    <div className="flex flex-col gap-3">
      {inSession ? (
        <>
          <DailyWindowTimer profile={profile} />
          <DayRunTimers restDays={profile.restDays} />
          <CountdownClock key={end.getTime()} endDate={end} />
        </>
      ) : (
        <NotInSessionNotice today={today} />
      )}
    </div>
  );
};

export default TimersCard;
