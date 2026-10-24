/**
 * The Mood › Patterns "Tags & feelings" card: how mood, energy and stress
 * went on days carrying each of the user's own tags (the ones on tasks,
 * notes and habits) compared with their other days.
 *
 * A tag's day is a day with a daily check-in on which a task carrying the
 * tag was completed or a note carrying it was edited. Tags are the ones items
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
import { toLocalDateStr } from '@/app/utils/dateUtils';

export type Feeling = 'mood' | 'energy' | 'stress';

export const FEELINGS: Feeling[] = ['mood', 'energy', 'stress'];

export const FEELING_NAME: Record<Feeling, string> = { mood: 'Mood', energy: 'Energy', stress: 'Stress' };

/** The check-in's words for 1 to 5 on each scale. */
export const FEELING_WORDS: Record<Feeling, readonly string[]> = { mood: MOOD_LABELS, energy: ENERGY_LABELS, stress: STRESS_LABELS };

/** Which way is easier on you: higher mood and energy, lower stress. */
const GOOD_UP: Record<Feeling, boolean> = { mood: true, energy: true, stress: false };
const UP: Record<Feeling, string> = { mood: 'better mood', energy: 'more energy', stress: 'more stress' };
const DOWN: Record<Feeling, string> = { mood: 'lower mood', energy: 'less energy', stress: 'calmer' };

/** Days a tag needs, and its other days need, before anything is said. */
export const TAG_MIN_SIDE = 5;
/** Half a step on the 1–5 scale: anything smaller is never called a difference. */
export const MIN_GAP = 0.5;
/** The chance check's bar, split across the tags compared for a feeling. */
export const CHANCE_LEVEL = 0.05;
/** Reshuffles per comparison. */
export const SHUFFLES = 4000;
/** Tags shown on the chart, those on the most days first. */
export const MAX_CHART_TAGS = 8;

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
  /** Average on the tag's days; null without any. */
  avg: number | null;
  /** "Your usual": the other days' average as if they had the tag days' mix of work days and days off. */
  other: number | null;
  /** Tag days minus usual, work days and days off kept apart; null when no group has both sides. */
  gap: number | null;
  /** The plain average of the other days, and the gap mixing the two kinds of day would show. */
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

export interface TagFeelings {
  tag: FeelingTag;
  /** Check-in days carrying the tag, and the rest. */
  days: number;
  otherDays: number;
  feel: Record<Feeling, FeelingComparison>;
}

export interface TagFeelingsAnalysis {
  /** Daily check-ins in the period, oldest first. */
  days: TagDay[];
  /** Tags on at least one of them, those on the most days first. */
  tags: TagFeelings[];
}

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const tagKey = (id: number) => `tag:${id}`;

/**
 * The tags each local day from `start` to `end` carries: those on tasks
 * completed that day and on notes with editing time that day (sessions are
 * split at midnight, as in `dailyActivity`).
 */
export const tagsByDay = (activity: CalendarActivity, start: Date, end: Date): { byDay: Map<string, Set<string>>; tags: Map<string, FeelingTag> } => {
  const firstDay = toLocalDateStr(start);
  const lastDay = toLocalDateStr(end);
  const byDay = new Map<string, Set<string>>();
  const tags = new Map<string, FeelingTag>();
  const add = (day: string, itemTags: { id: number; name: string; color?: string | null }[]) => {
    if (day < firstDay || day > lastDay || itemTags.length === 0) return;
    let set = byDay.get(day);
    if (!set) {
      set = new Set();
      byDay.set(day, set);
    }
    for (const t of itemTags) {
      const key = tagKey(t.id);
      set.add(key);
      if (!tags.has(key)) tags.set(key, { key, name: t.name, color: t.color ?? null });
    }
  };

  for (const task of activity.completed_tasks) {
    if (task.completed_date) add(toLocalDateStr(new Date(task.completed_date)), task.tags);
  }

  const noteTags = new Map((activity.notes ?? []).map(n => [n.id, n.tags]));
  const rangeStartMs = startOfDay(start).getTime();
  const rangeEndMs = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1).getTime();
  for (const session of activity.note_sessions) {
    const itemTags = noteTags.get(session.note_id) ?? [];
    let cursor = Math.max(new Date(session.started_at).getTime(), rangeStartMs);
    const endMs = Math.min(new Date(session.ended_at).getTime(), rangeEndMs);
    while (cursor < endMs) {
      const day = new Date(cursor);
      add(toLocalDateStr(day), itemTags);
      cursor = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime();
    }
  }
  return { byDay, tags };
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

const hash = (s: string): number => {
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

/**
 * Every tag on the period's check-in days, each feeling compared on its days
 * against the other days. `seedKey` names the period, so the chance check is
 * the same every time the same days are shown.
 */
export const analyseTagFeelings = (days: TagDay[], tags: Map<string, FeelingTag>, seedKey: string): TagFeelingsAnalysis => {
  const counts = new Map<string, number>();
  for (const d of days) for (const t of d.tags) counts.set(t, (counts.get(t) ?? 0) + 1);

  const out: TagFeelings[] = [...counts.keys()].flatMap(key => {
    const tag = tags.get(key);
    if (!tag) return [];
    const on = days.filter(d => d.tags.has(key));
    const off = days.filter(d => !d.tags.has(key));
    const feel = {} as Record<Feeling, FeelingComparison>;
    for (const f of FEELINGS) {
      const values = (rows: TagDay[]) => rows.map(d => d[f]).filter((v): v is number => v != null);
      const groups: Group[] = [true, false].map(o => ({ tag: values(on.filter(d => d.off === o)), other: values(off.filter(d => d.off === o)) }));
      const usable = groups.filter(g => g.tag.length && g.other.length);
      const tv = values(on);
      const ov = values(off);
      const avg = mean(tv);
      const rawOther = mean(ov);
      const gap = gapOf(groups);
      const n = usable.reduce((s, g) => s + g.tag.length, 0);
      const nOther = usable.reduce((s, g) => s + g.other.length, 0);
      const thin = n < TAG_MIN_SIDE || nOther < TAG_MIN_SIDE;
      feel[f] = {
        n,
        nOther,
        nAll: tv.length,
        nOtherAll: ov.length,
        avg,
        other: usualOf(groups) ?? rawOther,
        gap,
        rawOther,
        rawGap: avg != null && rawOther != null ? avg - rawOther : null,
        p: thin || gap == null ? null : chanceOf(groups, gap, hash(`${key}|${f}|${seedKey}`)),
        k: 1,
        verdict: thin ? 'thin' : 'same',
        good: gap == null ? null : gap > 0 === GOOD_UP[f],
        mixWarn: false,
      };
    }
    return [{ tag, days: on.length, otherDays: off.length, feel }];
  });

  for (const f of FEELINGS) {
    const k = out.filter(t => t.feel[f].verdict !== 'thin').length || 1;
    for (const t of out) {
      const c = t.feel[f];
      c.k = k;
      if (c.verdict !== 'thin' && Math.abs(c.gap!) >= MIN_GAP && c.p! < CHANCE_LEVEL / k) c.verdict = 'clear';
      c.mixWarn = c.verdict !== 'clear' && c.rawGap != null && c.gap != null
        && Math.abs(c.rawGap) >= MIN_GAP && Math.abs(c.rawGap) - Math.abs(c.gap) >= 0.3;
    }
  }
  out.sort((a, b) => b.days - a.days || a.tag.name.localeCompare(b.tag.name));
  return { days, tags: out };
};

/** A 1–5 average as shown: to one decimal. */
export const formatAverage = (x: number | null): string => (x == null ? '–' : (Math.round(x * 10) / 10).toFixed(1));

const dayWord = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

/** "better mood", "calmer": which way the tag's days went. */
export const differenceWords = (f: Feeling, gap: number): string => (gap > 0 ? UP[f] : DOWN[f]);

/** One plain sentence for a tag and feeling, for hover, taps and screen readers. */
export const describeTagFeeling = (name: string, f: Feeling, c: FeelingComparison): string => {
  if (c.verdict === 'thin') {
    const why = c.nAll < TAG_MIN_SIDE
      ? `is on only ${dayWord(c.nAll)} with ${f} logged`
      : c.nOtherAll < TAG_MIN_SIDE
        ? `is on almost every day, so there are only ${dayWord(c.nOtherAll)} without it to compare with`
        : `is on ${dayWord(c.nAll)}, but too few of them line up with other days of the same kind (work day or day off)`;
    return `“${name}” ${why}. Too few days to tell: it needs ${TAG_MIN_SIDE} on each side.`;
  }
  const word = FEELING_WORDS[f][Math.round(c.avg!) - 1];
  const base = `${FEELING_NAME[f]} averaged ${formatAverage(c.avg)} (${word}) on your ${dayWord(c.nAll)} with “${name}”; your usual on ${c.nOther} other days was ${formatAverage(c.other)}.`;
  const mix = c.mixWarn ? ` (Mixing work days and days off would have made it look like ${formatAverage(c.avg)} vs ${formatAverage(c.rawOther)}.)` : '';
  if (c.verdict === 'clear') return `${base} That’s a clear difference: ${differenceWords(f, c.gap!)}.`;
  if (Math.abs(c.gap!) >= 0.3) return `${base} A little ${c.gap! > 0 ? 'higher' : 'lower'}, but not by enough to tell from chance.${mix}`;
  return `${base} About the same.${mix}`;
};

/** The clearest findings in one or two plain sentences; empty when no tag has enough days. */
export const summarizeTagFeelings = (analysis: TagFeelingsAnalysis, scope: string): string => {
  const found = analysis.tags.flatMap(t => FEELINGS.filter(f => t.feel[f].verdict === 'clear').map(f => ({ t, f, c: t.feel[f] })));
  if (!found.length) {
    return analysis.tags.some(t => FEELINGS.some(f => t.feel[f].verdict !== 'thin'))
      ? `Nothing stands out ${scope}: every gap is small enough to be chance.`
      : '';
  }
  found.sort((a, b) => Math.abs(b.c.gap!) - Math.abs(a.c.gap!));
  return `Clearest ${scope}: ${found
    .slice(0, 2)
    .map(({ t, f, c }) => `on “${t.tag.name}” days (${t.days}), ${differenceWords(f, c.gap!)} than usual (${formatAverage(c.avg)} vs ${formatAverage(c.other)})`)
    .join('; ')}.`;
};

/** The feeling to open a tag's timeline on: its biggest clear difference, else mood. */
export const timelineFeeling = (t: TagFeelings): Feeling => {
  let best: Feeling = 'mood';
  let size = 0;
  for (const f of FEELINGS) {
    const c = t.feel[f];
    if (c.verdict === 'clear' && Math.abs(c.gap!) > size) {
      best = f;
      size = Math.abs(c.gap!);
    }
  }
  return best;
};

/** Whether any tag shows a clear difference. */
export const hasClearDifference = (analysis: TagFeelingsAnalysis): boolean =>
  analysis.tags.some(t => FEELINGS.some(f => t.feel[f].verdict === 'clear'));
