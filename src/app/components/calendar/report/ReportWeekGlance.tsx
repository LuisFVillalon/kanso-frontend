'use client';

import React, { useMemo } from 'react';
import { ArrowRight, CalendarDays } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { MoodFace, moodColor } from '@/app/components/mood/MoodFacePicker';
import type { CalendarActivity } from '@/app/types/activity';
import { ENERGY_LABELS, moodLabel, STRESS_LABELS, WORKLOAD_LABELS, type MoodCheckin, type MoodCheckinSettings } from '@/app/types/mood';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { PATTERN_MIN_DAYS, summarizeMood } from '@/app/utils/moodReport';
import { tagKindCounts, type FeelingTag } from '@/app/utils/tagFeelings';

/** Best and hardest day show once the week has this many daily check-ins. */
export const BEST_DAY_MIN = 3;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const addDays = (d: Date, n: number): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const monthName = (d: Date) => d.toLocaleDateString('en-US', { month: 'long' });
const shortMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
const fx = (n: number) => n.toFixed(1);
const round1 = (n: number) => Math.round(n * 10) / 10;

const mean = (values: (number | null)[]): number | null => {
  const known = values.filter((v): v is number => v != null);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
};

interface Day {
  date: string;
  index: number;
  checkin: MoodCheckin | null;
  future: boolean;
  today: boolean;
}

/**
 * The week's best and hardest day: the highest mood (ties go to lower stress,
 * then the earlier day) and the lowest (ties go to lower energy, then the
 * earlier day). Never the same day: when every logged day has the same mood,
 * only the best is picked. Null below BEST_DAY_MIN check-ins.
 */
export const bestAndHardest = (logged: { date: string; checkin: MoodCheckin }[]): { best: string; hardest: string | null } | null => {
  if (logged.length < BEST_DAY_MIN) return null;
  const low = (v: number | null) => v ?? Infinity;
  const best = logged.reduce((a, b) =>
    b.checkin.mood > a.checkin.mood || (b.checkin.mood === a.checkin.mood && low(b.checkin.stress) < low(a.checkin.stress)) ? b : a);
  const hardest = logged.reduce((a, b) =>
    b.checkin.mood < a.checkin.mood || (b.checkin.mood === a.checkin.mood && low(b.checkin.energy) < low(a.checkin.energy)) ? b : a);
  return { best: best.date, hardest: hardest.checkin.mood === best.checkin.mood ? null : hardest.date };
};

/** "−0.2 from 3.2", or "same as 3.2" when the shown values match. */
export const describeChange = (now: number, before: number): string => {
  const diff = round1(round1(now) - round1(before));
  if (diff === 0) return `same as ${fx(before)}`;
  return `${diff > 0 ? '+' : '−'}${fx(Math.abs(diff))} from ${fx(before)}`;
};

const Pip: React.FC<{ value: number | null; color: string }> = ({ value, color }) => (
  <span className="relative w-3.5 h-1 rounded-sm overflow-hidden bg-surface-raised">
    {value != null && <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${(value / 5) * 100}%`, backgroundColor: color }} />}
  </span>
);

const Hollow: React.FC<{ size: string }> = ({ size }) => (
  <span className={`${size} shrink-0 rounded-full border-[1.5px] border-dashed border-border-strong`} aria-hidden="true" />
);

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 px-2 py-px rounded-full text-[11px] whitespace-nowrap border border-border bg-surface-raised text-text-secondary">
    {children}
  </span>
);

const Kicker: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="text-[11px] uppercase tracking-wide text-text-muted">{children}</span>
);

interface ReportWeekGlanceProps {
  /** A Mon–Sun week. */
  period: ReportPeriod;
  /** Daily check-ins by day: the week, the week before it and the months the month link counts. */
  byDay: Map<string, MoodCheckin>;
  /** The weekly check-ins overlapping the week. */
  weeks: MoodCheckin[];
  /** The week's calendar activity, for the tags on each day. */
  activity: CalendarActivity;
  settings: MoodCheckinSettings;
  /** "this week", "last week" or "in Nov 2–8". */
  scopeLabel: string;
  /** Any day in the month the footer links to. */
  month: Date;
  /** Opens a day's check-in, or logs that day (`existing` null). */
  onDay: (date: string, existing: MoodCheckin | null) => void;
  /** Opens the week's check-in, or logs it (`existing` null). */
  onWeek: (date: string, existing: MoodCheckin | null) => void;
  /** Opens the Month report holding `date`. */
  onMonth: (date: Date) => void;
}

/**
 * Mood › Patterns for a week, "Week at a glance". A week is too short for
 * patterns, so this only describes how it went: the average and the change
 * from last week, a Mon–Sun strip where each day opens its check-in (or logs
 * a day without one), the best and hardest day, the weekly check-in, and a
 * footer linking to the Month report, or to the month before while the
 * week's own month is too thin for patterns.
 */
const ReportWeekGlance: React.FC<ReportWeekGlanceProps> = ({ period, byDay, weeks, activity, settings, scopeLabel, month, onDay, onWeek, onMonth }) => {
  const todayStr = toLocalDateStr(new Date());
  const monday = toLocalDateStr(period.start);
  const includesToday = todayStr >= monday && todayStr <= toLocalDateStr(period.end);

  const days: Day[] = WEEKDAYS.map((_, index) => {
    const date = toLocalDateStr(addDays(period.start, index));
    return { date, index, checkin: date > todayStr ? null : byDay.get(date) ?? null, future: date > todayStr, today: date === todayStr };
  });
  const logged = days.filter((d): d is Day & { checkin: MoodCheckin } => d.checkin != null);
  const summary = summarizeMood(byDay, period.start, period.end);
  const picks = bestAndHardest(logged);

  const thisWeek = {
    mood: summary.average,
    energy: mean(logged.map(d => d.checkin.energy)),
    stress: mean(logged.map(d => d.checkin.stress)),
  };
  const lastDays = WEEKDAYS.map((_, i) => byDay.get(toLocalDateStr(addDays(period.start, i - 7)))).filter((c): c is MoodCheckin => !!c);
  const lastWeek = {
    mood: mean(lastDays.map(c => c.mood)),
    energy: mean(lastDays.map(c => c.energy)),
    stress: mean(lastDays.map(c => c.stress)),
  };
  const changes = (['mood', 'energy', 'stress'] as const)
    .map(f => ({ f, now: thisWeek[f], before: lastWeek[f] }))
    .filter((c): c is { f: 'mood' | 'energy' | 'stress'; now: number; before: number } => c.now != null && c.before != null);

  // Each tag's finished tasks and edited notes per day, for the best/hardest chips.
  const { byDay: tagCounts, tags } = useMemo(() => tagKindCounts(activity, period.start, period.end), [activity, period.start, period.end]);
  const dayTags = (date: string): { tag: FeelingTag; count: number }[] =>
    [...(tagCounts.get(date) ?? [])]
      .map(([key, c]) => ({ tag: tags.get(key)!, count: c.tasks + c.notes }))
      .filter(t => t.count > 0);

  const weekCheckin = weeks.find(w => w.period_start === monday) ?? null;
  const showWeekly = !!weekCheckin || settings.weekly;

  const dayName = (d: Day) => `${WEEKDAYS[d.index]} ${parseLocalDate(d.date).getDate()}`;
  const ariaDay = (d: Day) => {
    const date = parseLocalDate(d.date);
    const name = `${WEEKDAYS[d.index]} ${shortMonth(date)} ${date.getDate()}`;
    return d.checkin ? `${name}: ${moodLabel(d.checkin.mood)}. Open check-in` : `${name}: no check-in. Log this day`;
  };

  const describeDay = (d: Day & { checkin: MoodCheckin }) => {
    const { mood, energy, stress, tags: moments } = d.checkin;
    const parts = [moodLabel(mood)];
    if (energy != null) parts.push(`${ENERGY_LABELS[energy - 1].toLowerCase()} energy`);
    if (stress != null) parts.push(`${STRESS_LABELS[stress - 1].toLowerCase()} stress`);
    const chips = dayTags(d.date);
    return (
      <>
        <p>
          <b className="font-semibold text-text-primary">{dayName(d)}</b> · {parts.join(', ')}
        </p>
        {(chips.length > 0 || moments.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {chips.map(({ tag, count }) => (
              <Chip key={tag.key}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: tag.color ?? 'var(--tm-accent)' }} aria-hidden="true" />
                {tag.name}
                {count > 1 && ` ×${count}`}
              </Chip>
            ))}
            {moments.map(m => <Chip key={`moment:${m}`}>{m}</Chip>)}
          </div>
        )}
      </>
    );
  };

  // The footer's month link: the week's month, and the month before while the week's is too thin for patterns.
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const prevStart = new Date(month.getFullYear(), month.getMonth() - 1, 1);
  const prevEnd = new Date(month.getFullYear(), month.getMonth(), 0);
  const monthDays = summarizeMood(byDay, monthStart, monthEnd).logged;
  const prevReady = summarizeMood(byDay, prevStart, prevEnd).logged >= PATTERN_MIN_DAYS;
  const monthReady = monthDays >= PATTERN_MIN_DAYS;
  const monthOver = toLocalDateStr(monthEnd) < todayStr;
  const daysWord = monthDays === 0 ? 'no days' : `${monthDays} ${monthDays === 1 ? 'day' : 'days'}`;
  const monthLine = monthReady
    ? `${monthName(month)} has ${daysWord} with a check-in.`
    : `${monthName(month)} has ${daysWord} with a check-in${monthOver ? '' : ' so far'}; its patterns fill in after about ${PATTERN_MIN_DAYS}${prevReady ? `, and ${monthName(prevStart)}’s are ready now` : ''}.`;

  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="font-display text-lg sm:text-xl font-medium text-text-primary">How your week felt</h3>
        <span className="text-xs sm:text-sm text-text-muted">
          {summary.logged > 0
            ? `${summary.logged} ${summary.logged === 1 ? 'day' : 'days'} with a check-in ${scopeLabel}`
            : `No daily check-ins ${scopeLabel}`}
        </span>
      </div>

      <CardShell icon={<CalendarDays className="w-4 h-4 text-accent" aria-hidden="true" />} header="This week">
        <div className={`grid grid-cols-1 gap-4 lg:gap-5 ${showWeekly ? 'lg:grid-cols-[220px_minmax(0,1fr)_300px]' : 'lg:grid-cols-[220px_minmax(0,1fr)]'}`}>
          <div className="min-w-0">
            {summary.average != null ? (
              <>
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 shrink-0" style={{ color: moodColor(Math.round(summary.average)) }}>
                    <MoodFace mood={Math.round(summary.average)} filled className="w-full h-full" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-2xl font-bold leading-none text-text-primary">
                      {moodLabel(Math.round(summary.average))} <span className="text-base font-semibold text-text-muted">{fx(summary.average)}</span>
                    </p>
                    <p className="text-xs text-text-secondary mt-1">
                      average · {summary.logged} of {summary.days} {summary.days === 1 ? 'day' : 'days'} logged
                    </p>
                  </div>
                </div>
                {changes.length > 0 && (
                  <div className="grid gap-0.5 mt-3 text-xs text-text-secondary">
                    <Kicker>vs last week{includesToday ? ', so far' : ''}</Kicker>
                    {changes.map(c => (
                      <span key={c.f}>
                        {c.f === 'mood' ? 'Mood' : c.f === 'energy' ? 'Energy' : 'Stress'}{' '}
                        <b className="font-semibold text-text-primary">{fx(c.now)}</b> · {describeChange(c.now, c.before)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Hollow size="w-11 h-11" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text-primary">No daily check-ins</p>
                  <p className="text-xs text-text-secondary">Tap a day to log it, even after the fact.</p>
                </div>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5">
              {days.map(d => {
                const tint = d.date === picks?.best ? moodColor(4) : d.date === picks?.hardest ? moodColor(2) : null;
                const body = (
                  <>
                    <span className={`text-[11px] ${d.today ? 'text-accent font-bold' : 'text-text-muted'}`}>{WEEKDAYS[d.index]}</span>
                    {d.checkin ? (
                      <span className="w-7 h-7 shrink-0" style={{ color: moodColor(d.checkin.mood) }}>
                        <MoodFace mood={d.checkin.mood} filled className="w-full h-full" />
                      </span>
                    ) : (
                      <Hollow size="w-7 h-7" />
                    )}
                    <span className="text-[11px] font-semibold leading-tight min-h-[1lh]" style={d.checkin ? { color: moodColor(d.checkin.mood) } : undefined}>
                      {d.checkin ? moodLabel(d.checkin.mood) : d.future ? '' : <span className="text-text-muted">Log</span>}
                    </span>
                    <span className="flex gap-0.5 sm:gap-[3px]" aria-hidden="true">
                      <Pip value={d.checkin?.energy ?? null} color="var(--tm-accent)" />
                      <Pip value={d.checkin?.stress ?? null} color="var(--tm-accent-2)" />
                    </span>
                  </>
                );
                const shape = 'min-w-0 flex flex-col items-center gap-1 px-0.5 pt-2 pb-1.5 rounded-lg border';
                const style = tint
                  ? { backgroundColor: `color-mix(in srgb, ${tint} 10%, transparent)`, borderColor: `color-mix(in srgb, ${tint} 35%, transparent)` }
                  : undefined;
                return d.future ? (
                  <div key={d.date} className={`${shape} border-transparent opacity-45`}>
                    {body}
                  </div>
                ) : (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => onDay(d.date, d.checkin)}
                    aria-label={ariaDay(d)}
                    className={`${shape} border-transparent hover:bg-surface-raised hover:border-border transition-colors`}
                    style={style}
                  >
                    {body}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-text-muted">
              <span className="inline-flex items-center gap-1"><span className="w-3.5 h-1 rounded-sm bg-accent" aria-hidden="true" /> energy</span>
              <span className="inline-flex items-center gap-1"><span className="w-3.5 h-1 rounded-sm bg-accent-2" aria-hidden="true" /> stress</span>
              <span>· tap a day to open its check-in</span>
            </div>
            {picks ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
                {[{ label: 'Best day', date: picks.best }, ...(picks.hardest ? [{ label: 'Hardest day', date: picks.hardest }] : [])].map(({ label, date }) => (
                  <div key={label} className="rounded-lg px-3 py-2.5 bg-surface-raised text-xs text-text-secondary">
                    <Kicker>{label}</Kicker>
                    {describeDay(logged.find(d => d.date === date)!)}
                  </div>
                ))}
              </div>
            ) : logged.length > 0 ? (
              <p className="text-xs text-text-muted mt-2.5">Best and hardest day show once the week has {BEST_DAY_MIN} check-ins.</p>
            ) : null}
          </div>

          {showWeekly && (
            <div className="min-w-0">
              {weekCheckin ? (
                <button
                  type="button"
                  onClick={() => onWeek(weekCheckin.period_start, weekCheckin)}
                  aria-label={`Your weekly check-in: ${moodLabel(weekCheckin.mood)}. Open check-in`}
                  className="w-full text-left flex flex-col gap-1.5 rounded-lg px-3 py-2.5 bg-surface-raised border border-transparent border-l-[3px] hover:border-border transition-colors"
                  style={{ borderLeftColor: moodColor(4) }}
                >
                  <Kicker>Your weekly check-in</Kicker>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="w-6 h-6 shrink-0" style={{ color: moodColor(weekCheckin.mood) }}>
                      <MoodFace mood={weekCheckin.mood} filled className="w-full h-full" />
                    </span>
                    <b className="text-sm font-semibold text-text-primary">{moodLabel(weekCheckin.mood)}</b>
                    {weekCheckin.workload != null && (
                      <span className="text-xs text-text-muted">· workload {WORKLOAD_LABELS[weekCheckin.workload].toLowerCase()}</span>
                    )}
                  </span>
                  {weekCheckin.highlight && <span className="text-sm text-text-secondary">Best part: “{weekCheckin.highlight}”</span>}
                </button>
              ) : (
                <div className="flex flex-col gap-1.5 rounded-lg px-3 py-2.5 bg-surface-raised">
                  <Kicker>Your weekly check-in</Kicker>
                  <p className="text-sm text-text-secondary">{includesToday ? 'None yet this week.' : 'None for this week.'}</p>
                  <button type="button" onClick={() => onWeek(monday, null)} className="btn btn-secondary self-start py-1 px-3 text-xs font-semibold">
                    Log this week
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-lg px-3 py-2.5 bg-surface-raised">
          <p className="flex-1 min-w-[220px] text-xs sm:text-sm text-text-secondary">
            A week is too short to say what goes with your mood. {monthLine}
          </p>
          <span className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => onMonth(month)} className="btn btn-secondary py-1 px-3 text-xs font-semibold">
              See {monthName(month)} <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            {!monthReady && prevReady && (
              <button
                type="button"
                onClick={() => onMonth(prevStart)}
                className="btn py-1 px-3 text-xs font-semibold bg-transparent border-border text-text-secondary hover:border-accent hover:text-accent"
              >
                {monthName(prevStart)}’s patterns
              </button>
            )}
          </span>
        </div>
      </CardShell>
    </div>
  );
};

export default ReportWeekGlance;
