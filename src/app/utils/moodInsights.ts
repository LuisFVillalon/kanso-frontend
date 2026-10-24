/**
 * The "Mood over time" summary: a headline and up to two numbered notes
 * drawn on the chart, all from fixed rules over the period's daily check-ins.
 *
 * The honesty rules:
 * - Nothing is said until a week has GATE.week check-ins, a month GATE.month
 *   and a year GATE.year; until then only a nudge shows.
 * - A change (climbing or dipping, or against the period before) is called
 *   only when the gap is at least MIN_GAP and a seeded reshuffle of the same
 *   days finds one that big less than CHANCE_LEVEL of the time — the same
 *   test as the Tags & feelings card. Otherwise nothing is said about it.
 * - Mood moving with stress or energy is named only when higher-stress (or
 *   lower-energy) days were the lower-mood ones, and never says "because".
 */

import { MOOD_LABELS, STRESS_LABELS, type MoodCheckin } from '@/app/types/mood';
import { shiftPeriod, type ReportPeriod, type ReportPeriodKind } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { periodRollingAverage, ROLLING_WINDOW, YEAR_FADE_DAYS } from '@/app/utils/moodReport';
import { CHANCE_LEVEL, chanceOf, hash, MIN_GAP } from '@/app/utils/tagFeelings';

/** Below this many daily check-ins in the period, only the nudge shows. */
export const GATE: Record<ReportPeriodKind, number> = { week: 3, month: 5, year: 10 };
/** Earlier vs later half of the period's check-ins: each half needs this many. */
export const HALF_MIN = { month: 4, year: 10 } as const;
/** A month's best and hardest 7-day stretch are named only this far apart. */
export const STRETCH_GAP = 1.0;
/** A week names its best and hardest day only when they are this many steps apart. */
export const DAY_GAP = 2;
/** High vs low stress (or energy) days: each side needs this many… */
export const SIDE_MIN = 5;
/** …in a period with at least this many check-ins carrying the series. */
export const TOGETHER_MIN = 10;
/** A stretch "ran high on stress" when its average stress is at least this. */
export const STRESS_HIGH = 3.5;
/** A hard stretch ending this few days before today is still going on. */
const RECENT_DAYS = 3;

export interface Comparison {
  /** `a` minus `b`. */
  gap: number;
  p: number;
  clear: boolean;
  a: number;
  b: number;
  na: number;
  nb: number;
}

export interface DaySpan {
  from: string;
  to: string;
}

/** Where a note sits on the chart. Day keys are "YYYY-MM-DD", month keys "YYYY-MM". */
export type InsightMark =
  | { type: 'halves'; early: DaySpan; late: DaySpan; earlyAvg: number; lateAvg: number }
  | { type: 'change'; value: number; label: string }
  | { type: 'spans'; best: DaySpan; worst: DaySpan; bestAvg: number; worstAvg: number }
  | { type: 'days'; best: string[]; worst: string[]; bestValue: number; worstValue: number }
  | { type: 'months'; best: string[]; worst: string[]; bestValue: number; worstValue: number }
  | { type: 'band'; lo: number; hi: number }
  | { type: 'series'; series: 'energy' | 'stress' };

export type InsightKind = 'level' | 'change' | 'direction' | 'stretch' | 'steady' | 'together';

export interface Insight {
  kind: InsightKind;
  text: string;
  mark?: InsightMark;
  c?: Comparison;
  /** Change only: how the copy names the period before ("September", "the week before"). */
  prevLabel?: string;
  /** Together only: which series moved with mood. */
  series?: 'energy' | 'stress';
  /** A month's hard stretch that is still going on. */
  recent?: boolean;
}

export interface NumberedNote {
  num: number;
  insight: Insight;
}

export interface MoodInsights {
  kind: ReportPeriodKind;
  /** Daily check-ins in the period so far. */
  n: number;
  /** Too few check-ins to say anything: the headline is the nudge. */
  sparse: boolean;
  gate: number;
  headline: string;
  /** "Based on 18 check-ins over 23 days so far." */
  sure: string;
  /** The insight the headline says; null while sparse. */
  head: Insight | null;
  /** The insights drawn on the chart, numbered 1, 2. */
  notes: NumberedNote[];
}

interface Row {
  date: string;
  mood: number;
  energy: number | null;
  stress: number | null;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const addDays = (s: string, n: number): string => {
  const d = parseLocalDate(s);
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

const eachDay = (a: string, b: string): string[] => {
  const out: string[] = [];
  for (let s = a; s <= b; s = addDays(s, 1)) out.push(s);
  return out;
};

/** "Oct 7". */
export const shortDay = (s: string): string => `${MONTH_SHORT[parseLocalDate(s).getMonth()]} ${parseLocalDate(s).getDate()}`;

/** "Oct 7–12", or "Sep 28 – Oct 3" across months. */
export const dayRange = (a: string, b: string): string =>
  (a.slice(0, 7) === b.slice(0, 7) ? `${shortDay(a)}–${parseLocalDate(b).getDate()}` : `${shortDay(a)} – ${shortDay(b)}`);

const mean = (a: number[]): number | null => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

/** A 1–5 average to one decimal. */
const f1 = (x: number): string => (Math.round(x * 10) / 10).toFixed(1);

const moodWord = (x: number): string => MOOD_LABELS[Math.min(5, Math.max(1, Math.round(x))) - 1];

/** "Okay", or "between Okay and Good" when the average sits near the middle of two words. */
const feltWord = (x: number): string => {
  const lo = Math.floor(x);
  const frac = x - lo;
  return frac >= 0.35 && frac <= 0.65 && lo < 5 ? `between ${MOOD_LABELS[lo - 1]} and ${MOOD_LABELS[lo]}` : moodWord(x);
};

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
const checkins = (n: number) => `${n} ${n === 1 ? 'check-in' : 'check-ins'}`;

/** Two groups of values: clear only past MIN_GAP and the chance check (split across `split` tests). */
export const compareGroups = (a: number[], b: number[], key: string, split = 1): Comparison => {
  const ma = mean(a)!;
  const mb = mean(b)!;
  const gap = ma - mb;
  const p = chanceOf([{ tag: [...a], other: [...b] }], gap, hash(key));
  return { gap, p, clear: Math.abs(gap) >= MIN_GAP && p < CHANCE_LEVEL / split, a: ma, b: mb, na: a.length, nb: b.length };
};

/** The period's name in copy: "Oct 19–25", "October", "2026". */
const periodName = (p: ReportPeriod): string =>
  (p.kind === 'week'
    ? dayRange(toLocalDateStr(p.start), toLocalDateStr(p.end))
    : p.kind === 'month' ? MONTH_LONG[p.start.getMonth()] : String(p.start.getFullYear()));

/** How copy names the period before: "the week before", "September", "2025". */
const prevName = (p: ReportPeriod): string => (p.kind === 'week' ? 'the week before' : periodName(shiftPeriod(p, -1)));

/** The chart's label for the period before's average line: "Last week", "Sep", "2025". */
const prevShort = (p: ReportPeriod): string => {
  const q = shiftPeriod(p, -1);
  return p.kind === 'week' ? 'Last week' : p.kind === 'month' ? MONTH_SHORT[q.start.getMonth()] : String(q.start.getFullYear());
};

const rowsIn = (byDay: Map<string, MoodCheckin>, p: ReportPeriod, today: string): Row[] => {
  const start = toLocalDateStr(p.start);
  const end = toLocalDateStr(p.end);
  const last = end < today ? end : today;
  const out: Row[] = [];
  if (start > last) return out;
  for (const day of eachDay(start, last)) {
    const c = byDay.get(day);
    if (c) out.push({ date: day, mood: c.mood, energy: c.energy, stress: c.stress });
  }
  return out;
};

/**
 * Everything the summary says about `period`. `byDay` must hold the period
 * before too, for "A brighter month than September"; without it that
 * comparison is left out.
 */
export const analyseMoodInsights = (period: ReportPeriod, byDay: Map<string, MoodCheckin>, now: Date = new Date()): MoodInsights => {
  const kind = period.kind;
  const today = toLocalDateStr(now);
  const start = toLocalDateStr(period.start);
  const end = toLocalDateStr(period.end);
  const rows = rowsIn(byDay, period, today);
  const lastDay = end < today ? end : today;
  const n = rows.length;
  const gate = GATE[kind];

  let sure: string;
  if (kind === 'year') {
    const first = rows[0]?.date;
    sure = first ? `Based on ${checkins(n)} since ${shortDay(first)}.` : '';
  } else {
    const span = start <= lastDay ? eachDay(start, lastDay).length : 0;
    sure = `Based on ${checkins(n)} over ${days(span)}${end > today ? ' so far' : ''}.`;
  }

  if (n < gate) {
    return {
      kind, n, sparse: true, gate, sure, head: null, notes: [],
      headline: n === 0 ? `No check-ins for ${periodName(period)} yet.` : `Check in a few more days to see a pattern — ${n} of ${gate} so far.`,
    };
  }

  const moods = rows.map(r => r.mood);
  const avg = mean(moods)!;

  // 1. Level: how it felt overall.
  const counts = [0, 0, 0, 0, 0];
  moods.forEach(m => counts[m - 1]++);
  const topCount = Math.max(...counts);
  const top = MOOD_LABELS[counts.indexOf(topCount)];
  const lowDays = counts[0] + counts[1];
  const highDays = counts[3] + counts[4];
  let shape: 'mode' | 'mix' | 'avg';
  let levelText: string;
  if (topCount / n > 0.5) {
    shape = 'mode';
    levelText = `Mostly ${top} days.`;
  } else if (topCount / n === 0.5 && counts.filter(c => c === topCount).length === 1) {
    shape = 'mode';
    levelText = `Half your days felt ${top}.`;
  } else if (lowDays / n >= 0.25 && highDays / n >= 0.25) {
    shape = 'mix';
    levelText = `A ${kind} of ups and downs.`;
  } else {
    shape = 'avg';
    levelText = `Mostly ${feltWord(avg).replace('between ', '')} days.`;
  }
  const level: Insight = { kind: 'level', text: levelText };

  // 2. Change: against the period before.
  let change: Insight | undefined;
  {
    const prev = shiftPeriod(period, -1);
    const prevRows = rowsIn(byDay, prev, today);
    const c = prevRows.length >= gate ? compareGroups(moods, prevRows.map(r => r.mood), `change|${start}`) : undefined;
    if (c?.clear) {
      const name = prevName(period);
      const text = c.gap > 0
        ? `A brighter ${kind} than ${name}: mood averaged ${f1(c.a)}, up from ${f1(c.b)}.`
        : `A harder ${kind} than ${name}: mood averaged ${f1(c.a)}, down from ${f1(c.b)}.`;
      change = { kind: 'change', text, c, prevLabel: name, mark: { type: 'change', value: c.b, label: `${prevShort(period)} avg ${f1(c.b)}` } };
    }
  }

  // 3. Direction: earlier vs later half of the period's check-ins.
  let direction: Insight | undefined;
  if (kind !== 'week') {
    const h = Math.floor(n / 2);
    if (h >= HALF_MIN[kind]) {
      const early = rows.slice(0, h);
      const late = rows.slice(n - h);
      const c = compareGroups(late.map(r => r.mood), early.map(r => r.mood), `dir|${start}`);
      if (c.clear) {
        const ea = dayRange(early[0].date, early[h - 1].date);
        const la = dayRange(late[0].date, late[h - 1].date);
        direction = {
          kind: 'direction', c,
          text: `Your mood ${c.gap > 0 ? 'climbed' : 'dipped'}: ${f1(c.b)} early on (${ea}), ${f1(c.a)} lately (${la}).`,
          mark: { type: 'halves', early: { from: early[0].date, to: early[h - 1].date }, late: { from: late[0].date, to: late[h - 1].date }, earlyAvg: c.b, lateAvg: c.a },
        };
      }
    }
  }

  // 4. Stretch: the best and hardest part, or whether the period was steady.
  let stretch: Insight | undefined;
  let steady = false;
  if (kind === 'week') {
    const hi = Math.max(...moods);
    const lo = Math.min(...moods);
    if (hi - lo >= DAY_GAP) {
      const bests = rows.filter(r => r.mood === hi);
      const worsts = rows.filter(r => r.mood === lo);
      // Ties name up to two days ("Monday and Sunday"), then count them ("3 days").
      const names = (rs: Row[]) => (rs.length <= 2 ? rs.map(r => DOW_LONG[parseLocalDate(r.date).getDay()]).join(' and ') : `${rs.length} days`);
      const stressed = worsts.every(r => r.stress != null && r.stress >= 4);
      const stressNote = stressed ? `, with stress ${worsts.length === 1 ? STRESS_LABELS[worsts[0].stress! - 1] : 'High or more'}` : '';
      stretch = {
        kind: 'stretch',
        text: `Best ${bests.length === 1 ? 'day' : 'days'}: ${names(bests)} (${MOOD_LABELS[hi - 1]}). Hardest: ${names(worsts)} (${MOOD_LABELS[lo - 1]}${stressNote}).`,
        mark: { type: 'days', best: bests.map(r => r.date), worst: worsts.map(r => r.date), bestValue: hi, worstValue: lo },
      };
    } else {
      steady = true;
    }
  } else if (kind === 'month') {
    const line = periodRollingAverage(period, byDay, 'mood', now);
    const monthDays = eachDay(start, end);
    // Only whole 7-day windows inside the month, so a stretch never starts before the 1st.
    let bi = -1;
    let wi = -1;
    line.forEach((v, i) => {
      if (v == null || i < ROLLING_WINDOW - 1) return;
      if (bi < 0 || v > line[bi]!) bi = i;
      if (wi < 0 || v < line[wi]!) wi = i;
    });
    if (bi >= 0 && line[bi]! - line[wi]! >= STRETCH_GAP) {
      const windowOf = (i: number): DaySpan => {
        const from = addDays(monthDays[i], -(ROLLING_WINDOW - 1));
        const inside = rows.filter(r => r.date >= from && r.date <= monthDays[i]);
        return { from: inside[0].date, to: inside[inside.length - 1].date };
      };
      const b = windowOf(bi);
      const w = windowOf(wi);
      const bestAvg = line[bi]!;
      const worstAvg = line[wi]!;
      const wStress = mean(rows.filter(r => r.date >= w.from && r.date <= w.to && r.stress != null).map(r => r.stress!));
      const allStress = mean(rows.filter(r => r.stress != null).map(r => r.stress!));
      const stressy = wStress != null && allStress != null && wStress >= STRESS_HIGH && wStress - allStress >= 0.5;
      const recent = w.to >= addDays(today, -RECENT_DAYS);
      const bestText = `Your best stretch was ${dayRange(b.from, b.to)} (mostly ${moodWord(bestAvg)}).`;
      const hardText = recent
        ? `Things have felt harder since about ${shortDay(w.from)}${stressy ? ', and stress has run high too' : ''}. Go easy on yourself.`
        : `The ${worstAvg >= 2.5 ? 'dip' : 'toughest stretch'} was ${dayRange(w.from, w.to)} (mostly ${moodWord(worstAvg)}${stressy ? ', and stress ran high then too' : ''}).`;
      stretch = { kind: 'stretch', text: `${bestText} ${hardText}`, recent, mark: { type: 'spans', best: b, worst: w, bestAvg, worstAvg } };
    } else if (bi >= 0) {
      steady = true;
      stretch = {
        kind: 'steady',
        text: f1(line[wi]!) === f1(line[bi]!)
          ? `No stretch stood out: your 7-day trend stayed at ${f1(line[wi]!)}.`
          : `No stretch stood out: your 7-day trend stayed between ${f1(line[wi]!)} and ${f1(line[bi]!)}.`,
        mark: { type: 'band', lo: line[wi]!, hi: line[bi]! },
      };
    }
  } else {
    const year = start.slice(0, 4);
    const months = MONTH_LONG.flatMap((name, m) => {
      const key = `${year}-${String(m + 1).padStart(2, '0')}`;
      const v = rows.filter(r => r.date.startsWith(key)).map(r => r.mood);
      return v.length >= YEAR_FADE_DAYS ? [{ key, name, n: v.length, avg: mean(v)! }] : [];
    });
    if (months.length >= 2) {
      const best = months.reduce((x, y) => (y.avg > x.avg ? y : x));
      const worst = months.reduce((x, y) => (y.avg < x.avg ? y : x));
      if (best.avg - worst.avg >= MIN_GAP) {
        stretch = {
          kind: 'stretch',
          text: `Best month: ${best.name} (${f1(best.avg)}). Hardest: ${worst.name} (${f1(worst.avg)}).`,
          mark: { type: 'months', best: [best.key], worst: [worst.key], bestValue: best.avg, worstValue: worst.avg },
        };
      } else {
        steady = true;
      }
    }
  }

  // 5. Together: whether higher-stress or lower-energy days were the lower-mood ones (not on a week).
  let together: Insight | undefined;
  if (kind !== 'week') {
    const tests: { series: 'stress' | 'energy'; c?: Comparison }[] = [];
    const st = rows.filter(r => r.stress != null);
    if (st.length >= TOGETHER_MIN) {
      const hi = st.filter(r => r.stress! >= 4).map(r => r.mood);
      const lo = st.filter(r => r.stress! <= 2).map(r => r.mood);
      tests.push({ series: 'stress', c: hi.length >= SIDE_MIN && lo.length >= SIDE_MIN ? compareGroups(hi, lo, `st|${start}`, 2) : undefined });
    }
    const en = rows.filter(r => r.energy != null);
    if (en.length >= TOGETHER_MIN) {
      const lo = en.filter(r => r.energy! <= 2).map(r => r.mood);
      const hi = en.filter(r => r.energy! >= 4).map(r => r.mood);
      tests.push({ series: 'energy', c: hi.length >= SIDE_MIN && lo.length >= SIDE_MIN ? compareGroups(lo, hi, `en|${start}`, 2) : undefined });
    }
    // Both comparisons put the side expected to have the lower mood first.
    const clear = tests.filter(t => t.c?.clear && t.c.gap < 0).sort((x, y) => Math.abs(y.c!.gap) - Math.abs(x.c!.gap));
    if (clear.length) {
      const { series, c } = clear[0];
      const text = series === 'stress'
        ? `Stressful days were your low days. On higher-stress days your mood averaged ${f1(c!.a)} (${days(c!.na)}); on calmer days, ${f1(c!.b)} (${days(c!.nb)}).`
        : `Low-energy days were your low days. On low-energy days your mood averaged ${f1(c!.a)} (${days(c!.na)}); on high-energy days, ${f1(c!.b)} (${days(c!.nb)}).`;
      together = { kind: 'together', series, text, c, mark: { type: 'series', series } };
    }
  }

  // The headline: the first that applies.
  const isStretch = stretch?.kind === 'stretch';
  const head: Insight = direction ?? change ?? (isStretch && kind === 'month' ? stretch! : level);

  let headline: string;
  if (head === direction) {
    headline = direction.c!.gap > 0
      ? `Your mood has been climbing through the ${kind}.`
      : `Your mood has dipped lately${kind === 'month' ? ' this month' : ''}.`;
  } else if (head === change) {
    headline = `A ${change.c!.gap > 0 ? 'brighter' : 'harder'} ${kind} than ${change.prevLabel}.`;
  } else if (head === stretch && stretch.recent) {
    headline = 'The last few days have felt harder.';
  } else if (head === stretch && stretch.mark?.type === 'spans') {
    const { worst, worstAvg } = stretch.mark;
    headline = `Mostly ${moodWord(avg)}, with ${worstAvg >= 2.5 ? 'a dip' : 'one harder stretch'} around ${dayRange(worst.from, worst.to)}.`;
  } else if (steady && shape !== 'mix') {
    const felt = feltWord(avg);
    headline = `A steady ${kind}, ${shape === 'mode' ? `mostly ${top} days` : felt.startsWith('between') ? felt : `mostly ${felt} days`}.`;
  } else {
    headline = levelText;
  }

  // The notes: the headline's own first, then the others. Only notes with a
  // place on the chart are numbered; every number has exactly one note.
  const notes = [head, direction, change, stretch, together]
    .filter((x, i, all): x is Insight => !!x?.mark && all.indexOf(x) === i)
    // A clear climb or dip already says where the better and harder days were.
    .filter(x => !(x === stretch && head === direction))
    .slice(0, 2)
    .map((insight, k) => ({ num: k + 1, insight }));

  return { kind, n, sparse: false, gate, headline, sure, head, notes };
};

/** What the headline is based on, in one line, for "About this chart". */
export const headlineBasis = (r: MoodInsights): string => {
  if (r.sparse) return `Patterns show after ${r.gate} check-ins; you have ${r.n}.`;
  const h = r.head!;
  if (h.kind === 'direction') return `Compares your first ${h.c!.nb} check-ins with your last ${h.c!.na}.`;
  if (h.kind === 'change') return `Compares ${r.n} check-ins with ${h.c!.nb} from ${h.prevLabel}.`;
  if (h.kind === 'stretch') return r.kind === 'month' ? 'Uses your 7-day trend: its highest and lowest weeks.' : r.kind === 'week' ? 'Your best and hardest days.' : 'Your best and hardest months.';
  return `How your ${checkins(r.n)} felt.`;
};

export type AboutIcon = 'headline' | 'dot' | 'line' | 'bar' | 'hollow' | 'dash';

export interface AboutRow {
  icon: AboutIcon;
  /** The row's bold lead. */
  strong: string;
  rest: string;
}

/** What the chart draws right now, which decides the "About this chart" rows. */
export interface DrawnMarks {
  /** A line is drawn through at least one row. */
  line: boolean;
  /** Year only: at least one month's soft bar is drawn. */
  band: boolean;
  /** A past day without a check-in shows as a hollow dot. */
  hollow: boolean;
  /** A weekly check-in shows as a dashed span. */
  weekly: boolean;
}

/** "About this chart": one short row per mark on the chart, each only while that mark is drawn. */
export const aboutRows = (r: MoodInsights, drawn: DrawnMarks): AboutRow[] => {
  const k = r.kind;
  const rows: AboutRow[] = [{ icon: 'headline', strong: 'Headline:', rest: headlineBasis(r) }];
  rows.push(k === 'year' ? { icon: 'dot', strong: 'Dot = one month', rest: '(its average)' } : { icon: 'dot', strong: 'Dot = one day', rest: '' });
  if (k === 'year') {
    if (drawn.band) rows.push({ icon: 'bar', strong: 'Soft bar = where most days fell', rest: '' });
  } else if (drawn.line) {
    rows.push(k === 'month' ? { icon: 'line', strong: 'Line = your usual', rest: 'over the past week' } : { icon: 'line', strong: 'Line', rest: 'joins your days' });
  }
  if (drawn.hollow && k !== 'year') rows.push({ icon: 'hollow', strong: 'Hollow dot = no check-in.', rest: 'Tap it to log that day' });
  const marks = r.notes.map(n => n.insight.mark?.type);
  const change = r.notes.find(n => n.insight.kind === 'change')?.insight;
  const dashed = [
    drawn.weekly && k !== 'year' ? 'your weekly check-in' : null,
    change ? `${k === 'week' ? 'last week' : change.prevLabel}’s average` : null,
    marks.includes('halves') ? 'your average early on and lately' : null,
  ].filter(Boolean);
  if (dashed.length) rows.push({ icon: 'dash', strong: `Dashed line = ${dashed.join(', or ')}`, rest: '' });
  return rows;
};

/** A labelled mark in a row's title strip, above its plot. */
export interface ChartTag {
  series: 'mood' | 'energy' | 'stress';
  /** Left edge as a share of the plot width (0–100), or the right edge when `alignRight`. */
  at: number;
  alignRight?: boolean;
  num?: number;
  label: string;
  /** Draws the Best / Hardest ring key instead of plain words. */
  ringKey?: boolean;
  /** A shaded stretch's own label, which gives way to `spanKey` when the two labels would overlap. */
  spanLabel?: boolean;
  /** One key for both shaded stretches, earliest first, shown only in place of their labels. */
  spanKey?: { tone: 'best' | 'worst'; label: string }[];
}

export interface ChartMarks {
  /** Shaded columns across all three rows. */
  spans: { from: number; to: number; tone: 'best' | 'worst' }[];
  /** Dashed level lines on the mood row, by bucket index, with their value label. */
  lines: { from: number; to: number; value: number; label: string; num?: number; muted?: boolean }[];
  /** Rings on the mood row's best and hardest days (or months). */
  rings: { at: number; value: number; hard: boolean }[];
  /** The mood row's band where the 7-day trend stayed. */
  band: { lo: number; hi: number } | null;
  tags: ChartTag[];
}

/**
 * Where the numbered notes sit on the chart. `keys` are the chart's bucket
 * keys: days for a week or month, "YYYY-MM" for a year. Each note's number
 * appears exactly once — a best/hardest stretch is one note over two
 * spans, so only the earlier span's label carries it, or the key that
 * replaces both labels where they would overlap.
 */
export const chartMarks = (notes: NumberedNote[], keys: string[], kind: ReportPeriodKind): ChartMarks => {
  const n = keys.length;
  const idx = (key: string) => keys.indexOf(kind === 'year' ? key.slice(0, 7) : key);
  const out: ChartMarks = { spans: [], lines: [], rings: [], band: null, tags: [] };
  for (const { num, insight } of notes) {
    const m = insight.mark;
    if (!m) continue;
    if (m.type === 'change') {
      out.lines.push({ from: 0, to: n - 1, value: m.value, label: m.label, num, muted: true });
    } else if (m.type === 'halves') {
      out.lines.push(
        { from: idx(m.early.from), to: idx(m.early.to), value: m.earlyAvg, label: `Early ${f1(m.earlyAvg)}` },
        { from: idx(m.late.from), to: idx(m.late.to), value: m.lateAvg, label: `Lately ${f1(m.lateAvg)}` },
      );
      out.tags.push({ series: 'mood', at: (idx(m.late.from) / n) * 100, num, label: m.lateAvg > m.earlyAvg ? 'Climbing' : 'Dipping' });
    } else if (m.type === 'spans') {
      const both = [
        { tone: 'best' as const, sp: m.best, label: 'Best stretch' },
        { tone: 'worst' as const, sp: m.worst, label: m.worstAvg >= 2.5 ? 'Dip' : 'Toughest stretch' },
      ].sort((x, y) => idx(x.sp.from) - idx(y.sp.from));
      both.forEach(({ tone, sp, label }, k) => {
        const a = idx(sp.from);
        const b = idx(sp.to);
        out.spans.push({ from: a, to: b, tone });
        const left = (a / n) * 100;
        const first = k === 0 ? num : undefined;
        out.tags.push(left > 62
          ? { series: 'mood', at: 100 - ((b + 1) / n) * 100, alignRight: true, num: first, label, spanLabel: true }
          : { series: 'mood', at: left, num: first, label, spanLabel: true });
      });
      out.tags.push({ series: 'mood', at: 0, num, label: both.map(x => x.label).join(' '), spanKey: both.map(({ tone, label }) => ({ tone, label })) });
    } else if (m.type === 'days' || m.type === 'months') {
      for (const key of m.best) out.rings.push({ at: idx(key), value: m.bestValue, hard: false });
      for (const key of m.worst) out.rings.push({ at: idx(key), value: m.worstValue, hard: true });
      // One key for all rings, so tied or neighbouring days never collide.
      out.tags.push({ series: 'mood', at: 0, num, label: 'Best Hardest', ringKey: true });
    } else if (m.type === 'band') {
      out.band = { lo: m.lo, hi: m.hi };
      out.tags.push({ series: 'mood', at: 0, num, label: 'Stayed in this range' });
    } else if (m.type === 'series') {
      out.tags.push({ series: m.series, at: 0, num, label: m.series === 'stress' ? 'Higher stress, lower mood' : 'Lower energy, lower mood' });
    }
  }
  return out;
};
