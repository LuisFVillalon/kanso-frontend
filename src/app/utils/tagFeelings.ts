/**
 * The tag side of Mood › Patterns (utils/patterns.ts): which of the user's
 * own tags (the ones on tasks, notes, habits and events) each day carries,
 * and how mood, energy and stress went on one set of check-in days compared
 * with another.
 *
 * A tag's day is a day with a daily check-in on which a task carrying the
 * tag was completed, a note carrying it was edited, a habit carrying it was
 * checked off or an event carrying it took place. Tags are the ones items
 * carry now, as in "Where your time went", so re-tagging moves history too.
 *
 * The honesty rules:
 * - Work days are compared with work days and days off with days off, and the
 *   two gaps are averaged by how many tag days each has, so a tag used mostly
 *   on weekends isn't credited with the weekend's mood.
 * - Nothing is said until a tag has TAG_MIN_SIDE days and the other days have
 *   as many too, counting only groups that have both.
 * - A difference must be at least MIN_GAP and beat a seeded reshuffle of the
 *   same days (within each group) at CHANCE_LEVEL split across the tags
 *   compared for that feeling; otherwise it's "about the same".
 */

import type { CalendarActivity } from '@/app/types/activity';
import { ENERGY_LABELS, MOOD_LABELS, STRESS_LABELS, type MoodCheckin } from '@/app/types/mood';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { occurrenceSpanOn, spansDays } from '@/app/utils/eventOccurrences';
import type { EventOccurrence } from '@/app/types/event';

export type Feeling = 'mood' | 'energy' | 'stress';

export const FEELINGS: Feeling[] = ['mood', 'energy', 'stress'];

export const FEELING_NAME: Record<Feeling, string> = { mood: 'Mood', energy: 'Energy', stress: 'Stress' };

/** The check-in's words for 1 to 5 on each scale. */
export const FEELING_WORDS: Record<Feeling, readonly string[]> = { mood: MOOD_LABELS, energy: ENERGY_LABELS, stress: STRESS_LABELS };

/** Which way is easier on you: higher mood and energy, lower stress. */
const GOOD_UP: Record<Feeling, boolean> = { mood: true, energy: true, stress: false };

/** Days a tag needs, and its other days need, before anything is said. */
export const TAG_MIN_SIDE = 5;
/** Half a step on the 1–5 scale: anything smaller is never called a difference. */
export const MIN_GAP = 0.5;
/** The chance check's bar, split across the tags compared for a feeling. */
export const CHANCE_LEVEL = 0.05;
/** Reshuffles per comparison. */
export const SHUFFLES = 4000;

export interface FeelingTag {
  /** `tag:<id>`. */
  key: string;
  name: string;
  color: string | null;
}

export interface TagDay {
  day: string;
  mood: number;
  energy: number | null;
  stress: number | null;
  /** A day off: Saturday, Sunday or one of the profile's rest days. */
  off: boolean;
  /** Keys of the tags the day carries. */
  tags: Set<string>;
}

export type Verdict = 'thin' | 'same' | 'clear';

export interface FeelingComparison {
  /** Tag days with a value, in groups that also have other days. */
  n: number;
  /** Other days with a value, in groups that also have tag days. */
  nOther: number;
  /** Every tag day / other day with a value. */
  nAll: number;
  nOtherAll: number;
  /** The tag days behind `avg`: the compared ones, or every one when none can be. */
  nAvg: number;
  /** Average on the tag's days that are compared (all of them when none can be); null without any. */
  avg: number | null;
  /** "Your usual": the other days' average as if they had the tag days' mix of work days and days off; null when no group has both sides. */
  other: number | null;
  /** Tag days minus usual, work days and days off kept apart; null when no group has both sides. */
  gap: number | null;
  /** The plain averages of every tag day and every other day, and the gap mixing the two kinds of day would show. */
  rawAvg: number | null;
  rawOther: number | null;
  rawGap: number | null;
  /** How often reshuffled days gave a gap at least this big; null when too few days. */
  p: number | null;
  /** Tags compared for this feeling, which split the chance bar. */
  k: number;
  verdict: Verdict;
  /** The difference is easier on you (better mood, more energy, less stress). */
  good: boolean | null;
  /** Mixing work days and days off would have shown a difference that keeping them apart removes. */
  mixWarn: boolean;
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const tagKey = (id: number) => `tag:${id}`;

/** The kinds of activity a tag's day can come from. */
export type ActivityKind = 'tasks' | 'notes' | 'habits' | 'events';

export const ACTIVITY_KINDS: ActivityKind[] = ['tasks', 'notes', 'habits', 'events'];

/**
 * The local days an event puts its tags on: every day an all-day event or
 * one 24 hours or longer covers (a 3-day trip is 3 days), else the day it
 * starts, so one ending just past midnight stays on its own day.
 */
export const eventTagDays = (o: EventOccurrence): string[] => {
  if (!o.all_day && !spansDays(o)) return [o.date];
  const days: string[] = [];
  for (let d = parseLocalDate(o.date); ; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const day = toLocalDateStr(d);
    if (day > o.end_date) break;
    // A long timed event ending right at midnight has no time on its end day.
    if (o.all_day || day < o.end_date || occurrenceSpanOn(o, day)) days.push(day);
  }
  return days;
};

/** How many tasks completed, notes edited, habits checked off and events had with a tag on one day. */
export type KindCounts = Record<ActivityKind, number>;

/**
 * Per local day from `start` to `end`, each tag's count of tasks completed,
 * notes with editing time (sessions split at midnight, as in
 * `dailyActivity`), habit check-offs and events on it (`eventTagDays`).
 * Declined and "Show as free" Google events (`busy: false`) count on no day,
 * as in Reports › Events; past archived occurrences still count.
 */
export const tagKindCounts = (activity: CalendarActivity, start: Date, end: Date): { byDay: Map<string, Map<string, KindCounts>>; tags: Map<string, FeelingTag> } => {
  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const byDay = new Map<string, Map<string, KindCounts>>();
  const tags = new Map<string, FeelingTag>();
  const add = (day: string, kind: ActivityKind, itemTags: { id: number; name: string; color?: string | null }[]) => {
    if (day < firstDay || day > lastDay || itemTags.length === 0) return;
    let perTag = byDay.get(day);
    if (!perTag) {
      perTag = new Map();
      byDay.set(day, perTag);
    }
    for (const t of itemTags) {
      const key = tagKey(t.id);
      let counts = perTag.get(key);
      if (!counts) {
        counts = { tasks: 0, notes: 0, habits: 0, events: 0 };
        perTag.set(key, counts);
      }
      counts[kind]++;
      if (!tags.has(key)) tags.set(key, { key, name: t.name, color: t.color ?? null });
    }
  };

  for (const task of activity.completed_tasks) {
    if (task.completed_date) add(toLocalDateStr(new Date(task.completed_date)), 'tasks', task.tags);
  }

  // A note counts once a day, however many sessions it had.
  const noteTags = new Map((activity.notes ?? []).map(n => [n.id, n.tags]));
  const noteDays = new Set<string>();
  const rangeStartMs = startOfDay(start).getTime();
  const rangeEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  for (const session of activity.note_sessions) {
    const itemTags = noteTags.get(session.note_id) ?? [];
    let cursor = Math.max(new Date(session.started_at).getTime(), rangeStartMs);
    const endMs = Math.min(new Date(session.ended_at).getTime(), rangeEndMs);
    while (cursor < endMs) {
      const day = new Date(cursor);
      const dayStr = toLocalDateStr(day);
      if (!noteDays.has(`${session.note_id}|${dayStr}`)) {
        noteDays.add(`${session.note_id}|${dayStr}`);
        add(dayStr, 'notes', itemTags);
      }
      cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    }
  }

  const habitTags = new Map((activity.habits ?? []).map(h => [h.id, h.tags]));
  for (const c of activity.habit_completions) add(c.date, 'habits', habitTags.get(c.habit_id) ?? []);

  for (const e of activity.events ?? []) {
    if (e.busy === false) continue;
    for (const day of eventTagDays(e)) add(day, 'events', e.tags);
  }
  return { byDay, tags };
};

/**
 * The tags each local day from `start` to `end` carries: those on tasks
 * completed that day, notes with editing time that day (sessions are split
 * at midnight, as in `dailyActivity`), habits checked off that day and
 * events on it. `kinds` keeps, per day and tag, which of those it came from.
 */
export const tagsByDay = (activity: CalendarActivity, start: Date, end: Date): {
  byDay: Map<string, Set<string>>;
  tags: Map<string, FeelingTag>;
  kinds: Map<string, Map<string, KindCounts>>;
} => {
  const counts = tagKindCounts(activity, start, end);
  const byDay = new Map<string, Set<string>>();
  for (const [day, perTag] of counts.byDay) byDay.set(day, new Set(perTag.keys()));
  return { byDay, tags: counts.tags, kinds: counts.byDay };
};

/** Saturday, Sunday and the profile's rest days (0 = Sunday … 6 = Saturday). */
export const isDayOff = (date: Date, restDays: number[]): boolean => {
  const wd = date.getDay();
  return wd === 0 || wd === 6 || restDays.includes(wd);
};

/** One row per daily check-in from `start` to `end`, up to today, with the tags its day carries. */
export const tagDayRows = (
  checkins: Map<string, MoodCheckin>,
  tagDays: Map<string, Set<string>>,
  start: Date,
  end: Date,
  restDays: number[],
  now: Date = new Date(),
): TagDay[] => {
  const today = startOfDay(now);
  const last = end < today ? end : today;
  const rows: TagDay[] = [];
  for (let d = startOfDay(start); d <= last; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const day = toLocalDateStr(d);
    const c = checkins.get(day);
    if (!c) continue;
    rows.push({ day, mood: c.mood, energy: c.energy, stress: c.stress, off: isDayOff(d, restDays), tags: tagDays.get(day) ?? new Set() });
  }
  return rows;
};

const mean = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** Seeded generator, so a verdict never flickers between renders. */
export const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** A string's FNV-1a hash, to seed the chance check. */
export const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

interface Group {
  tag: number[];
  other: number[];
}

/** The tag days' gap from the other days, per group, averaged by tag days; groups without both sides are left out. */
const gapOf = (groups: Group[]): number | null => {
  let w = 0;
  let g = 0;
  for (const { tag, other } of groups) {
    if (!tag.length || !other.length) continue;
    w += tag.length;
    g += tag.length * (mean(tag)! - mean(other)!);
  }
  return w ? g / w : null;
};

/** The other days' means per group, weighted to the tag days' mix; groups without both sides are left out. */
const usualOf = (groups: Group[]): number | null => {
  let w = 0;
  let u = 0;
  for (const { tag, other } of groups) {
    if (!tag.length || !other.length) continue;
    w += tag.length;
    u += tag.length * mean(other)!;
  }
  return w ? u / w : null;
};

/** How often shuffling the same days within each group gives a gap at least as big as `observed`. */
export const chanceOf = (groups: Group[], observed: number, seed: number, shuffles = SHUFFLES): number => {
  const rnd = mulberry32(seed);
  const pools = groups.filter(x => x.tag.length && x.other.length).map(x => ({ all: x.tag.concat(x.other), n: x.tag.length }));
  let hits = 0;
  for (let k = 0; k < shuffles; k++) {
    let w = 0;
    let g = 0;
    for (const { all, n } of pools) {
      let total = 0;
      for (const v of all) total += v;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const j = i + Math.floor(rnd() * (all.length - i));
        const t = all[i];
        all[i] = all[j];
        all[j] = t;
        sum += all[i];
      }
      w += n;
      g += n * (sum / n - (total - sum) / (all.length - n));
    }
    if (Math.abs(g / w) >= Math.abs(observed) - 1e-9) hits++;
  }
  return (hits + 1) / (shuffles + 1);
};

/** One feeling on `on` days against `off` days; the verdict is "thin" or "same" until `settleVerdicts` runs. */
export const compareFeeling = (on: TagDay[], off: TagDay[], f: Feeling, seed: number): FeelingComparison => {
  const values = (rows: TagDay[]) => rows.map(d => d[f]).filter((v): v is number => v != null);
  const groups: Group[] = [true, false].map(o => ({ tag: values(on.filter(d => d.off === o)), other: values(off.filter(d => d.off === o)) }));
  const usable = groups.filter(g => g.tag.length && g.other.length);
  const tv = values(on);
  const ov = values(off);
  const rawAvg = mean(tv);
  const avg = mean(usable.flatMap(g => g.tag)) ?? rawAvg;
  const rawOther = mean(ov);
  const gap = gapOf(groups);
  const n = usable.reduce((s, g) => s + g.tag.length, 0);
  const nOther = usable.reduce((s, g) => s + g.other.length, 0);
  const thin = n < TAG_MIN_SIDE || nOther < TAG_MIN_SIDE;
  return {
    n,
    nOther,
    nAll: tv.length,
    nOtherAll: ov.length,
    nAvg: n || tv.length,
    avg,
    other: usualOf(groups),
    gap,
    rawAvg,
    rawOther,
    rawGap: rawAvg != null && rawOther != null ? rawAvg - rawOther : null,
    p: thin || gap == null ? null : chanceOf(groups, gap, seed),
    k: 1,
    verdict: thin ? 'thin' : 'same',
    good: gap == null ? null : gap > 0 === GOOD_UP[f],
    mixWarn: false,
  };
};

/** Calls the comparisons of one feeling clear or not, splitting the chance bar across those with enough days. */
export const settleVerdicts = (comparisons: FeelingComparison[]) => {
  const k = comparisons.filter(c => c.verdict !== 'thin').length || 1;
  for (const c of comparisons) {
    c.k = k;
    if (c.verdict !== 'thin' && Math.abs(c.gap!) >= MIN_GAP && c.p! < CHANCE_LEVEL / k) c.verdict = 'clear';
    c.mixWarn = c.verdict !== 'clear' && c.rawGap != null && c.gap != null
      && Math.abs(c.rawGap) >= MIN_GAP && Math.abs(c.rawGap) - Math.abs(c.gap) >= 0.3;
  }
};

/** A 1–5 average as the check-in word it rounds to: mood 3.9 is "Good", stress 2.2 is "Mild". */
export const feelingWord = (f: Feeling, x: number): string => FEELING_WORDS[f][Math.min(5, Math.max(1, Math.round(x))) - 1];

/** A 1–5 average as shown: to one decimal. */
export const formatAverage = (x: number | null): string => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1));
