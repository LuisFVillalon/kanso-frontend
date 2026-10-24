import { describe, expect, it } from 'vitest';
import {
  activitySplit,
  analysePatterns,
  answerOf,
  describePattern,
  patternFindings,
  patternNumbers,
  patternsRest,
  patternSupport,
  type PatternDay,
} from './patterns';
import type { FeelingComparison, FeelingTag } from './tagFeelings';

const comparison = (overrides: Partial<FeelingComparison>): FeelingComparison => ({
  n: 12, nOther: 12, nAll: 12, nOtherAll: 12, nAvg: 12, avg: 3, other: 3, gap: 0,
  rawAvg: 3, rawOther: 3, rawGap: 0, p: 0.001, k: 1, verdict: 'clear', good: null, mixWarn: false,
  ...overrides,
});

describe('answerOf', () => {
  it('waits on too few days and says “about the same” for no clear difference', () => {
    expect(answerOf(comparison({ verdict: 'thin' }))).toEqual({ kind: 'wait', step: null, short: 'Can’t tell yet' });
    expect(answerOf(comparison({ verdict: 'same', gap: 0.9 }))).toEqual({ kind: 'same', step: null, short: 'About the same' });
  });

  it('is only “maybe” under 10 days on either side, whatever the gap', () => {
    expect(answerOf(comparison({ n: 6, gap: 2 })).short).toBe('Maybe higher');
    expect(answerOf(comparison({ nOther: 9, gap: -0.6 })).short).toBe('Maybe lower');
  });

  it('words a sure gap by its size: a little, plain, clearly', () => {
    expect(answerOf(comparison({ n: 10, nOther: 10, gap: 0.5 })).short).toBe('A little higher');
    expect(answerOf(comparison({ gap: -0.74 })).short).toBe('A little lower');
    expect(answerOf(comparison({ gap: 0.75 }))).toEqual({ kind: 'higher', step: 'plain', short: 'Higher' });
    expect(answerOf(comparison({ gap: -1.24 })).short).toBe('Lower');
    expect(answerOf(comparison({ gap: 1.25 })).short).toBe('Clearly higher');
    expect(answerOf(comparison({ gap: -2 })).short).toBe('Clearly lower');
  });
});

describe('activitySplit', () => {
  it('splits at the middle, raised past the lowest, and not at all when the count never changed', () => {
    expect(activitySplit([3, 0, 2, 1, 0, 0])).toBe(1);
    expect(activitySplit([1, 1, 1, 1, 2, 3])).toBe(2);
    expect(activitySplit([0, 1, 0, 1, 1])).toBe(1);
    expect(activitySplit([0, 0, 0, 0, 1])).toBe(1);
    expect(activitySplit([2, 2, 2])).toBeNull();
    expect(activitySplit([])).toBeNull();
  });
});

const study: FeelingTag = { key: 'tag:7', name: 'Study', color: '#2F6FD6' };

/** 24 work days: Study on every other one with stress 5 (2 otherwise), tasks 0–3, no note time or habits, mood always Okay, energy never logged. */
const month = (length = 24): PatternDay[] =>
  Array.from({ length }, (_, i) => ({
    day: `2026-10-${String(i + 1).padStart(2, '0')}`,
    mood: 3,
    energy: null,
    stress: i % 2 === 0 ? 5 : 2,
    off: false,
    tags: new Set(i % 2 === 0 ? [study.key] : []),
    moments: new Set(i < 3 ? ['Exam'] : []),
    activity: { tasks: i % 4, notes: 0, habits: 0 },
  }));

describe('analysePatterns', () => {
  const analysis = analysePatterns(month(), new Map([[study.key, study]]), '2026-10-01|2026-10-31');
  const row = (key: string) => analysis.rows.find(r => r.key === key)!;

  it('judges activities, tags and moments by one rule, sharing one chance bar per feeling', () => {
    expect(analysis.rows.map(r => r.key)).toEqual(['activity:tasks', 'activity:notes', 'activity:habits', 'tag:7', 'moment:Exam']);
    // Tasks and Study have enough days for stress; flat note time and habits, and a 3-day moment, don't.
    for (const r of analysis.rows) expect(r.feel.stress.k).toBe(2);
    expect(row('tag:7').answer.stress.short).toBe('Clearly higher');
    expect(row('activity:tasks').answer.stress.short).toBe('About the same');
    expect(row('activity:notes').flat).toBe(true);
    expect(row('activity:notes').answer.stress.kind).toBe('wait');
    expect(row('moment:Exam').answer.stress.kind).toBe('wait');
  });

  it('says each answer in plain words', () => {
    const tag = row('tag:7');
    expect(describePattern(tag, 'stress')).toBe('Your stress was clearly higher on Study days');
    expect(patternSupport(tag, 'stress')).toBe('A clear pattern · 12 days vs 12 other');
    expect(patternNumbers(tag, 'stress')).toBe('Stress averaged 5.0 (Maxed) on Study days and 2.0 (Mild) on other days.');
    const tasks = row('activity:tasks');
    expect(describePattern(tasks, 'mood')).toBe('Your mood was about the same on busier days');
    expect(patternSupport(tasks, 'mood')).toBe('Little change either way · 12 days vs 12 other');
    expect(tasks.on).toBe('days with 2+ tasks');
    expect(tasks.off).toBe('days with 0–1 tasks');
    expect(patternSupport(row('activity:notes'), 'mood')).toBe('Your time in notes barely changed from day to day');
    expect(patternSupport(row('moment:Exam'), 'stress')).toBe('Needs 5 days on each side · only 3 so far');
    expect(patternSupport(tag, 'energy')).toBe('No energy logged in your check-ins yet');
    for (const r of analysis.rows) {
      for (const f of ['mood', 'energy', 'stress'] as const) expect(describePattern(r, f)).not.toMatch(/\b(better|worse|because|causes?)\b/i);
    }
  });

  it('lists the findings surest first, then sums up the rest', () => {
    expect(patternFindings(analysis.rows).map(x => `${x.row.name}|${x.feeling}`)).toEqual(['Study|stress']);
    expect(patternsRest(analysis, 'this month')).toEqual([
      'Tasks: no clear difference to how you felt.',
      'Everything else was about the same.',
      'Too few days to tell yet: Exam.',
    ]);
  });

  it('says when there are too few days to tell anything', () => {
    const few = analysePatterns(month(3), new Map([[study.key, study]]), 'x');
    expect(patternFindings(few.rows)).toEqual([]);
    expect(patternsRest(few, 'this month')).toEqual([
      'Too few days to tell anything yet: each side of a comparison needs 5 days with a check-in, and you have 3 days this month.',
    ]);
  });

  it('says what never changed, not to check in more, when every check-in day was alike', () => {
    const alike = month(25).map(d => ({ ...d, tags: new Set<string>(), moments: new Set(['Coffee']), activity: { tasks: 0, notes: 0, habits: 0 } }));
    expect(patternsRest(analysePatterns(alike, new Map(), 'x'), 'this month')).toEqual([
      'Your tasks barely changed from day to day.',
      'Your time in notes barely changed from day to day.',
      'Your habits barely changed from day to day.',
    ]);
  });
});
