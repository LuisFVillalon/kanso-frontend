/**
 * Mood › Patterns: what tends to go with your mood, energy and stress. Every
 * row on the page — how much you did (tasks, note time, habits), each of
 * your own tags and each moment you pick when checking in — is judged for
 * all three feelings by one rule, the Tags card's (`compareFeeling` and
 * `settleVerdicts` in tagFeelings.ts), so the summary and both cards can't
 * disagree:
 * - Two kinds of day are compared: for a tag or moment, days with it against
 *   days without; for an activity, busier against quieter days, split at the
 *   middle of the days' counts.
 * - Work days are compared with work days and days off with days off.
 * - Nothing is said until each side has TAG_MIN_SIDE days.
 * - A gap under MIN_GAP, or one a reshuffle of the same days often matches
 *   (CHANCE_LEVEL split across every row compared for that feeling), is
 *   "about the same".
 * The answer ladder then words how sure a real gap is: "maybe" with fewer
 * than SURE_SIDE days on a side, else "a little", plain or "clearly" by its
 * size. It says which way a feeling went, never whether that's good, and
 * never what caused what.
 */

import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import { dailyActivity, metricValue, MOOD_METRICS, type DayActivity, type MoodMetric } from '@/app/utils/calendarReport';
import { formatDurationShort, toLocalDateStr } from '@/app/utils/dateUtils';
import {
  compareFeeling,
  feelingWord,
  FEELING_NAME,
  FEELINGS,
  formatAverage,
  hash,
  MIN_GAP,
  settleVerdicts,
  tagDayRows,
  TAG_MIN_SIDE,
  tagsByDay,
  type Feeling,
  type FeelingComparison,
  type FeelingTag,
  type TagDay,
} from '@/app/utils/tagFeelings';

/** Days on the smaller side below which a difference is only "maybe". */
export const SURE_SIDE = 10;
/** Gaps (on the 1–5 scale) from which a difference is plainly "higher" or "lower", then "clearly". */
export const PLAIN_GAP = 0.75;
export const CLEAR_GAP = 1.25;

/** A check-in day with what it carries: the tags of its tasks and notes, its moments, and how much was done. */
export interface PatternDay extends TagDay {
  moments: Set<string>;
  activity: Record<MoodMetric, number>;
}

/** Joins the check-in rows from `tagDayRows` with each day's moments and activity. */
export const patternDays = (rows: TagDay[], byDay: Map<string, MoodCheckin>, activity: Map<string, DayActivity>): PatternDay[] =>
  rows.map(d => ({
    ...d,
    moments: new Set(byDay.get(d.day)?.tags ?? []),
    activity: Object.fromEntries(MOOD_METRICS.map(m => [m, metricValue(activity.get(d.day), m)])) as Record<MoodMetric, number>,
  }));

/** Which way a feeling went: higher, lower, about the same, or can't tell yet. Never good or bad. */
export type AnswerKind = 'higher' | 'lower' | 'same' | 'wait';

/** How sure a higher or lower answer is, in the word before it. */
export type AnswerStep = 'maybe' | 'a little' | 'plain' | 'clearly';

export interface PatternAnswer {
  kind: AnswerKind;
  /** Set for higher and lower only. */
  step: AnswerStep | null;
  /** A few words, for tiles and rows: "Maybe higher", "About the same", "Can’t tell yet". */
  short: string;
}

export type PatternSource = 'activity' | 'tag' | 'moment';

export interface PatternRow {
  source: PatternSource;
  /** `activity:tasks`, a tag's `tag:<id>`, or `moment:<name>`. */
  key: string;
  name: string;
  /** A tag's own colour. */
  color: string | null;
  /** An activity row's metric. */
  metric: MoodMetric | null;
  /** An activity's split: days with at least this many are the busier ones. Null for tags and moments, or when it barely changed. */
  threshold: number | null;
  /** The activity barely changed from day to day, so there's nothing to compare. */
  flat: boolean;
  /** The two sides in words: "COMM 103 days" / "other days", "days with 2+ tasks" / "days with 0–1 tasks". */
  on: string;
  off: string;
  /** Check-in days on each side. */
  days: number;
  otherDays: number;
  feel: Record<Feeling, FeelingComparison>;
  answer: Record<Feeling, PatternAnswer>;
}

export interface PatternsAnalysis {
  /** Daily check-ins in the period, oldest first. */
  days: PatternDay[];
  rows: PatternRow[];
}

const capitalize = (text: string) => `${text[0].toUpperCase()}${text.slice(1)}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const joinAnd = (parts: string[]) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`);

/** The ladder: one answer for a settled comparison. */
export const answerOf = (c: FeelingComparison): PatternAnswer => {
  if (c.verdict === 'thin') return { kind: 'wait', step: null, short: 'Can’t tell yet' };
  if (c.verdict === 'same') return { kind: 'same', step: null, short: 'About the same' };
  const kind = c.gap! > 0 ? 'higher' : 'lower';
  const size = Math.abs(c.gap!);
  const step: AnswerStep = Math.min(c.n, c.nOther) < SURE_SIDE ? 'maybe' : size < PLAIN_GAP ? 'a little' : size < CLEAR_GAP ? 'plain' : 'clearly';
  return { kind, step, short: capitalize(step === 'plain' ? kind : `${step} ${kind}`) };
};

/**
 * The middle of the days' counts, raised past the lowest so both sides have
 * days; null when the count never changed, so there's nothing to split.
 */
export const activitySplit = (values: number[]): number | null => {
  if (new Set(values).size < 2) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const t = sorted[Math.floor(sorted.length / 2)];
  return t === sorted[0] ? sorted.find(v => v > t)! : t;
};

const UNIT: Record<'tasks' | 'habits', string> = { tasks: 'task', habits: 'habit' };

/** An activity's two sides as people read them: "days with 2+ tasks" / "days with 0–1 tasks", "days with 30m+ in notes" / "days with under 30m". */
const activitySides = (metric: MoodMetric, t: number, values: number[]): [string, string] => {
  if (metric === 'notes') {
    const time = formatDurationShort(t * 60);
    return [`days with ${time}+ in notes`, `days with under ${time}`];
  }
  const unit = UNIT[metric];
  const min = Math.min(...values);
  const low = t - 1 === min ? (min === 0 ? `no ${unit}s` : plural(min, unit)) : `${min}–${t - 1} ${unit}s`;
  return [`days with ${t}+ ${unit}s`, `days with ${low}`];
};

export const METRIC_NAME: Record<MoodMetric, string> = { tasks: 'Tasks', notes: 'Note time', habits: 'Habits' };

/** "finish more tasks", to ask "How is your mood on days you …?" */
const METRIC_DO: Record<MoodMetric, string> = {
  tasks: 'finish more tasks',
  notes: 'spend more time in notes',
  habits: 'check off more habits',
};

/** How an answer ends for an activity: "on busier days". */
const METRIC_ON: Record<MoodMetric, string> = {
  tasks: 'on busier days',
  notes: 'on days with more note time',
  habits: 'on days with more habits checked off',
};

const BARELY_CHANGED: Record<MoodMetric, string> = {
  tasks: 'Your tasks barely changed from day to day',
  notes: 'Your time in notes barely changed from day to day',
  habits: 'Your habits barely changed from day to day',
};

/** The question the activity card asks: "How is your stress on days you finish more tasks?" */
export const activityQuestion = (metric: MoodMetric, f: Feeling): string => `How is your ${f} on days you ${METRIC_DO[metric]}?`;

/** The question the Tags & moments card asks. */
export const tagsQuestion = (source: 'tag' | 'moment', f: Feeling): string =>
  source === 'tag' ? `How is your ${f} on days with each tag?` : `How is your ${f} on days you pick each moment?`;

const comparisons = (on: PatternDay[], off: PatternDay[], key: string, seedKey: string) =>
  Object.fromEntries(FEELINGS.map(f => [f, compareFeeling(on, off, f, hash(`${key}|${f}|${seedKey}`))])) as Record<Feeling, FeelingComparison>;

type Draft = Omit<PatternRow, 'answer'>;

/**
 * Every row of the page for the period's check-in days, each feeling judged
 * by the one rule, with the chance bar split across every row compared for
 * that feeling. `tags` names the keys the days carry; `seedKey` names the
 * period so the chance check is the same each time the same days show.
 */
export const analysePatterns = (days: PatternDay[], tags: Map<string, FeelingTag>, seedKey: string): PatternsAnalysis => {
  const drafts: Draft[] = MOOD_METRICS.map(metric => {
    const values = days.map(d => d.activity[metric]);
    const t = activitySplit(values);
    const on = t == null ? [] : days.filter(d => d.activity[metric] >= t);
    const off = t == null ? days : days.filter(d => d.activity[metric] < t);
    const [onWords, offWords] = t == null ? ['busier days', 'other days'] : activitySides(metric, t, values);
    const key = `activity:${metric}`;
    return {
      source: 'activity', key, name: METRIC_NAME[metric], color: null, metric, threshold: t, flat: t == null,
      on: onWords, off: offWords, days: on.length, otherDays: off.length, feel: comparisons(on, off, key, seedKey),
    };
  });

  const counted = (pick: (d: PatternDay) => Set<string>) => {
    const counts = new Map<string, number>();
    for (const d of days) for (const k of pick(d)) counts.set(k, (counts.get(k) ?? 0) + 1);
    return [...counts];
  };
  const byDays = (a: Draft, b: Draft) => b.days - a.days || a.name.localeCompare(b.name);

  drafts.push(...counted(d => d.tags).flatMap(([key]): Draft[] => {
    const tag = tags.get(key);
    if (!tag) return [];
    const on = days.filter(d => d.tags.has(key));
    const off = days.filter(d => !d.tags.has(key));
    return [{
      source: 'tag', key, name: tag.name, color: tag.color, metric: null, threshold: null, flat: false,
      on: `${tag.name} days`, off: 'other days', days: on.length, otherDays: off.length, feel: comparisons(on, off, key, seedKey),
    }];
  }).sort(byDays));

  drafts.push(...counted(d => d.moments).map(([name]): Draft => {
    const key = `moment:${name}`;
    const on = days.filter(d => d.moments.has(name));
    const off = days.filter(d => !d.moments.has(name));
    return {
      source: 'moment', key, name, color: null, metric: null, threshold: null, flat: false,
      on: `days you picked “${name}”`, off: 'other days', days: on.length, otherDays: off.length, feel: comparisons(on, off, key, seedKey),
    };
  }).sort(byDays));

  for (const f of FEELINGS) settleVerdicts(drafts.map(r => r.feel[f]));
  const rows = drafts.map(r => ({ ...r, answer: Object.fromEntries(FEELINGS.map(f => [f, answerOf(r.feel[f])])) as Record<Feeling, PatternAnswer> }));
  return { days, rows };
};

/** Every row of the page for a period: its check-in days with their tags, moments and activity, work days apart from `restDays`. */
export const periodPatterns = (activity: CalendarActivity, byDay: Map<string, MoodCheckin>, start: Date, end: Date, restDays: number[]): PatternsAnalysis => {
  const { byDay: tagDays, tags } = tagsByDay(activity, start, end);
  const rows = tagDayRows(byDay, tagDays, start, end, restDays);
  return analysePatterns(patternDays(rows, byDay, dailyActivity(activity, start, end)), tags, `${toLocalDateStr(start)}|${toLocalDateStr(end)}`);
};

/** Whether a check-in day is on a row's "with it" or busier side. */
export const rowHas = (r: PatternRow, d: PatternDay): boolean =>
  r.source === 'activity' ? r.threshold != null && d.activity[r.metric!] >= r.threshold
    : r.source === 'tag' ? d.tags.has(r.key)
      : d.moments.has(r.name);

/** How an answer ends: "on busier days", "on COMM 103 days", "on days you picked “Exam”". */
export const onPhrase = (r: PatternRow): string => (r.metric ? METRIC_ON[r.metric] : `on ${r.on}`);

/** The answer as a full sentence: "Your stress was maybe higher on COMM 103 days". */
export const describePattern = (r: PatternRow, f: Feeling): string => {
  const a = r.answer[f];
  if (a.kind === 'wait') return 'Can’t tell yet';
  if (a.kind === 'same') return `Your ${f} was about the same ${onPhrase(r)}`;
  return `Your ${f} was ${a.step === 'plain' ? a.kind : `${a.step} ${a.kind}`} ${onPhrase(r)}`;
};

const HOW_SURE: Record<AnswerStep, string> = {
  maybe: 'Too early to be sure',
  'a little': 'Small but steady',
  plain: 'Showed up often',
  clearly: 'A clear pattern',
};

/** How the page keeps work days and days off apart. */
export const SEPARATE_DAY_KINDS = 'work days are compared with work days, days off with days off';

/** One short line under an answer: how sure it is, over how many days, or what it still needs. */
export const patternSupport = (r: PatternRow, f: Feeling): string => {
  const c = r.feel[f];
  const a = r.answer[f];
  if (a.kind === 'wait') {
    if (r.flat) return BARELY_CHANGED[r.metric!];
    if (c.nAll + c.nOtherAll === 0) return `No ${f} logged in your check-ins yet`;
    if (Math.min(c.nAll, c.nOtherAll) >= TAG_MIN_SIDE && Math.min(c.n, c.nOther) === 0) {
      return `${capitalize(SEPARATE_DAY_KINDS)} · ${plural(c.nAll, 'day')} vs ${c.nOtherAll} other`;
    }
    const few = Math.min(c.nAll, c.nOtherAll) < TAG_MIN_SIDE ? Math.min(c.nAll, c.nOtherAll) : Math.min(c.n, c.nOther);
    return `Needs ${TAG_MIN_SIDE} days on each side · only ${few} so far`;
  }
  const counts = `${plural(c.n, 'day')} vs ${c.nOther} other`;
  if (a.kind === 'same') return `${Math.abs(c.gap!) >= MIN_GAP ? 'A gap, but small enough to be luck' : 'Little change either way'} · ${counts}`;
  return `${HOW_SURE[a.step!]} · ${counts}`;
};

/** The numbers behind an answer: "Stress averaged 4.0 (High) on COMM 103 days and 2.4 (Mild) on other days." */
export const patternNumbers = (r: PatternRow, f: Feeling): string => {
  const c = r.feel[f];
  if (c.avg == null || c.other == null) return '';
  return `${FEELING_NAME[f]} averaged ${formatAverage(c.avg)} (${feelingWord(f, c.avg)}) on ${r.on} and ${formatAverage(c.other)} (${feelingWord(f, c.other)}) on ${r.off}.`;
};

export interface PatternFinding {
  row: PatternRow;
  feeling: Feeling;
}

const STEP_RANK: Record<AnswerStep, number> = { clearly: 4, plain: 3, 'a little': 2, maybe: 1 };

/** Every higher or lower answer on the page, the surest and biggest first. */
export const patternFindings = (rows: PatternRow[]): PatternFinding[] =>
  rows
    .flatMap(row => FEELINGS.filter(f => row.answer[f].step).map(feeling => ({ row, feeling })))
    .sort((a, b) =>
      STEP_RANK[b.row.answer[b.feeling].step!] - STEP_RANK[a.row.answer[a.feeling].step!]
      || Math.abs(b.row.feel[b.feeling].gap!) - Math.abs(a.row.feel[a.feeling].gap!));

/** Names listed in the summary before "and N more". */
const MAX_NAMES = 5;

const listNames = (names: string[]) =>
  names.length > MAX_NAMES ? `${names.slice(0, MAX_NAMES).join(', ')} and ${names.length - MAX_NAMES} more` : joinAnd(names);

const settled = (r: PatternRow) => FEELINGS.some(f => r.answer[f].kind === 'same');
const found = (r: PatternRow) => FEELINGS.some(f => r.answer[f].step);

const answered = (r: PatternRow) => settled(r) || found(r);

/** Whether there are too few check-in days to fill both sides of anything, so more check-ins are what's missing. */
export const waitsOnCheckIns = ({ days }: PatternsAnalysis): boolean => days.length < 2 * TAG_MIN_SIDE;

/** "Your tasks barely changed from day to day.", for each activity with nothing to compare. */
const barelyChanged = (rows: PatternRow[]): string[] =>
  rows.filter(r => r.source === 'activity' && r.flat).map(r => `${patternSupport(r, 'mood')}.`);

/** What the page says while nothing has enough days. */
export const tooFewDays = (days: number, scope: string): string =>
  `Too few days to tell anything yet: each side of a comparison needs ${TAG_MIN_SIDE} days with a check-in, and you have ${plural(days, 'day')} ${scope}.`;

/** The activities answered "about the same" for every feeling they could. */
export const quietActivities = (rows: PatternRow[]): PatternRow[] => rows.filter(r => r.source === 'activity' && settled(r) && !found(r));

/** "How much you did made no clear difference to how you felt.", or the quiet activities named. */
export const quietLine = (quiet: PatternRow[]): string | null =>
  quiet.length === MOOD_METRICS.length ? 'How much you did made no clear difference to how you felt.'
    : quiet.length ? `${capitalize(joinAnd(quiet.map(r => r.name.toLowerCase())))}: no clear difference to how you felt.` : null;

/** "Too few days to tell yet: Habits.", for the rows that changed but have too few days for any feeling. */
export const waitingLine = (rows: PatternRow[]): string | null => {
  const waiting = rows.filter(r => FEELINGS.some(f => r.feel[f].n > 0 && r.feel[f].nOther > 0) && FEELINGS.every(f => r.answer[f].kind === 'wait'));
  return waiting.length ? `Too few days to tell yet: ${listNames(waiting.map(r => r.name))}.` : null;
};

/** Why nothing has an answer: what never changed and what has too few days, else that work days and days off are kept apart. */
export const unanswered = (rows: PatternRow[]): string[] => {
  const lines = [...barelyChanged(rows), waitingLine(rows)].filter((line): line is string => !!line);
  return lines.length ? lines : [`${capitalize(SEPARATE_DAY_KINDS)}.`];
};

/**
 * The plain lines after the findings: which activities made no clear
 * difference, that everything else was about the same (or that nothing stood
 * out), and what has too few days to tell yet.
 */
export const patternsRest = (analysis: PatternsAnalysis, scope: string): string[] => {
  const { days, rows } = analysis;
  if (waitsOnCheckIns(analysis)) return [tooFewDays(days.length, scope)];
  if (!rows.some(answered)) return unanswered(rows);
  return [
    quietLine(quietActivities(rows)),
    rows.some(found) ? 'Everything else was about the same.' : `Nothing stood out ${scope}: every difference was small enough to be luck.`,
    waitingLine(rows),
  ].filter((line): line is string => !!line);
};
