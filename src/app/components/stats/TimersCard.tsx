'use client';

import React, { useEffect, useState } from 'react';
import { AlertCircle, Bed, Blinds, Briefcase, Grid2x2, Hourglass, PartyPopper, Smile, Timer as TimerIcon } from 'lucide-react';
import { CalendarSettings } from '@/app/types/calendar';
import { fetchCalendarSettings } from '@/app/lib/backend-api';
import { CardShell } from '@/app/components/stats/CardShell';
import { parseLocalDate, formatLongDate, isWeekday, isWeekend } from '@/app/utils/dateUtils';
import { useMidnightTick } from '@/app/hooks/useMidnightTick';
import type { ProfileFields } from '@/app/hooks/useProfile';
import { defaultTermSettings } from '@/app/hooks/useCalendarSettings';
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
 * Live-ticking countdown to `target`, broken into months/days/h/m/s.
 * Ticks once a second — no need for anything finer now the display stops
 * at seconds — and owns its own state so only this subtree re-renders.
 */
const CountdownClock: React.FC<{ target: Date }> = ({ target }) => {
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
        Countdown to {formatLongDate(target)}
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

// ── Weekday / Weekend period timers ────────────────────────────────────────────
// "Weekday" period = Monday 12:00 AM through Friday 11:59:59.999 PM.
// "Weekend" period = Saturday 12:00 AM through Sunday 11:59:59.999 PM.
// Each card counts down while its own period is active, and otherwise shows
// the fixed length of that period (5 days / 2 days) as a static readout.

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

const WEEKDAY_PERIOD_LENGTH: PeriodParts = { days: 5, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };
const WEEKEND_PERIOD_LENGTH: PeriodParts = { days: 2, hours: 0, minutes: 0, seconds: 0, milliseconds: 0 };

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

// End of the current weekday period (Friday 11:59:59.999 PM). Only
// meaningful while `now` actually falls on a weekday.
const endOfWeekdayPeriod = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + (5 - now.getDay()), 23, 59, 59, 999);

// End of the current weekend period (Sunday 11:59:59.999 PM). Only
// meaningful while `now` actually falls on a weekend.
const endOfWeekendPeriod = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + (now.getDay() === 0 ? 0 : 1), 23, 59, 59, 999);

interface PeriodTimerCardProps {
  icon: React.ReactNode;
  label: string;
  labelSuffix?: React.ReactNode;
  active: boolean;
  parts: PeriodParts;
  color: string;
  bg: string;
  units?: { key: keyof PeriodParts; label: string; width?: number }[];
}

const PeriodTimerCard: React.FC<PeriodTimerCardProps> = ({
  icon, label, labelSuffix, active, parts, color, bg, units = PERIOD_UNITS,
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
        {active ? 'Now' : 'Upcoming'}
      </span>
    </div>
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
  </div>
);

/**
 * Side-by-side Weekday / Weekend timers. Whichever period is currently
 * active counts down to its end; the other shows the fixed length of its
 * own period until its turn comes around.
 */
const WeekPeriodTimers: React.FC = () => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const dow = now.getDay();
  const inWeekday = isWeekday(dow);
  const inWeekend = isWeekend(dow);

  const weekdayParts = inWeekday ? shortDiffParts(now, endOfWeekdayPeriod(now)) : WEEKDAY_PERIOD_LENGTH;
  const weekendParts = inWeekend ? shortDiffParts(now, endOfWeekendPeriod(now)) : WEEKEND_PERIOD_LENGTH;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <PeriodTimerCard
        icon={inWeekday ? <Briefcase className="w-3.5 h-3.5" /> : <Bed className="w-3.5 h-3.5" />}
        label="Weekday"
        active={inWeekday}
        parts={weekdayParts}
        color="var(--tm-success)"
        bg="var(--tm-success-subtle)"
      />
      <PeriodTimerCard
        icon={inWeekend ? <PartyPopper className="w-3.5 h-3.5" /> : <Smile className="w-3.5 h-3.5" />}
        label="Weekend"
        active={inWeekend}
        parts={weekendParts}
        color="var(--tm-accent-2)"
        bg="var(--tm-accent-2-subtle)"
      />
    </div>
  );
};

// ── Daily window timer (from the user's profile) ───────────────────────────────
// Settings → Profile lets the user set "Day starts at" (localStorage only,
// `tm_day_start_time`) and "Call it a day at" (persisted to the backend
// profile as `shutoff_time`). This is that same daily window: while `now`
// falls inside it, it counts down to the shutoff time; otherwise it shows
// the fixed length of the window (e.g. 08:00–22:00 → 14h 0m).

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
}

// Whether `now` falls inside the [dayStart, dayEnd) window on a non-rest
// day, and the countdown-or-fixed-length parts to show for it — shared by
// the expanded DailyWindowTimer card and the compact tile's daily-window
// row so the two can never disagree about whether the window is active.
const computeDailyWindow = (now: Date, dayStart: string, dayEnd: string, restDays: number[]): DailyWindowState => {
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

  return { active, parts: active ? shortDiffParts(now, buildTimeOnDate(now, dayEnd)) : periodLength };
};

interface DailyWindowTimerProps {
  dayStart: string;
  dayEnd: string;
  restDays: number[];
}

// dayStart/dayEnd/restDays come from the shared useProfile hook (see
// TaskManager.tsx), threaded down via TimersCardProps below — reading them
// as props instead of an independent localStorage/fetchProfile snapshot
// means this stays in sync if the user edits them in Settings while this
// card is already mounted, which the old snapshot-on-mount version couldn't.
const DailyWindowTimer: React.FC<DailyWindowTimerProps> = ({ dayStart, dayEnd, restDays }) => {
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const { active, parts } = computeDailyWindow(now, dayStart, dayEnd, restDays);

  return (
    <PeriodTimerCard
      icon={active ? <Grid2x2 className="w-3.5 h-3.5" /> : <Blinds className="w-3.5 h-3.5" />}
      label="Daily Window"
      labelSuffix={`(${dayStart} – ${dayEnd})`}
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
}

const CompactTimerRow: React.FC<CompactTimerRowProps> = ({ icon, label, color, bg, active, parts }) => (
  <div className="flex items-center gap-2 rounded-lg border border-border-subtle px-2 py-1.5 min-w-0" style={{ backgroundColor: bg }}>
    <span className="flex-shrink-0" style={{ color }}>{icon}</span>
    <span className="text-[11px] font-semibold truncate min-w-0" style={{ color }}>{label}</span>
    <span className="ml-auto text-[13px] font-bold tabular-nums whitespace-nowrap flex-shrink-0" style={{ color }}>
      {formatCompactTime(parts)}
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
// configured range" fetch/check — the compact rows and the overlay's
// CountdownClock/full blocks otherwise duplicate this fetch independently.

const useTimersSession = () => {
  const currentDate = useMidnightTick();
  const [settings, setSettings] = useState<CalendarSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCalendarSettings()
      .then(data => { if (data !== null) setSettings(data); })
      .catch(() => { /* network / auth error — keep showing defaults */ })
      .finally(() => setLoading(false));
  }, []);

  // Same placeholder range useCalendarSettings shows while settings load, so
  // "in session" reads the same way in both cards.
  const cur = settings ?? { ...defaultTermSettings(), title: '' };
  const start = parseLocalDate(cur.start_date);
  const end = parseLocalDate(cur.end_date);
  const today = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
  const inSession = today >= start && today <= end;

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
// Reads the same CalendarSettings (start/end date) independently so it knows
// whether "now" falls inside the configured range — the daily/weekly timers
// and the countdown only make sense relative to that active window.

interface TimersCardProps {
  profile: ProfileFields;
  onExpand: () => void;
  dragHandleProps: DragHandleProps;
}

const TimersCard: React.FC<TimersCardProps> = ({ profile, onExpand, dragHandleProps }) => {
  const { loading, inSession, today } = useTimersSession();
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <TimersCardSkeleton />;

  const dow = now.getDay();
  const inWeekday = isWeekday(dow);
  const inWeekend = isWeekend(dow);
  const { active: dailyActive, parts: dailyParts } = computeDailyWindow(now, profile.dayStartTime, profile.shutoffTime, profile.restDays);

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
              icon={inWeekday ? <Briefcase className="w-3.5 h-3.5" /> : <Bed className="w-3.5 h-3.5" />}
              label="Weekday"
              color="var(--tm-success)"
              bg="var(--tm-success-subtle)"
              active={inWeekday}
              parts={inWeekday ? shortDiffParts(now, endOfWeekdayPeriod(now)) : WEEKDAY_PERIOD_LENGTH}
            />
            <CompactTimerRow
              icon={inWeekend ? <PartyPopper className="w-3.5 h-3.5" /> : <Smile className="w-3.5 h-3.5" />}
              label="Weekend"
              color="var(--tm-accent-2)"
              bg="var(--tm-accent-2-subtle)"
              active={inWeekend}
              parts={inWeekend ? shortDiffParts(now, endOfWeekendPeriod(now)) : WEEKEND_PERIOD_LENGTH}
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
export const TimersOverlay: React.FC<{ profile: ProfileFields }> = ({ profile }) => {
  const { loading, inSession, end, today } = useTimersSession();

  if (loading) return <TimersOverlaySkeleton />;

  return (
    <div className="flex flex-col gap-3">
      {inSession ? (
        <>
          <DailyWindowTimer dayStart={profile.dayStartTime} dayEnd={profile.shutoffTime} restDays={profile.restDays} />
          <WeekPeriodTimers />
          <CountdownClock key={end.getTime()} target={end} />
        </>
      ) : (
        <NotInSessionNotice today={today} />
      )}
    </div>
  );
};

export default TimersCard;
