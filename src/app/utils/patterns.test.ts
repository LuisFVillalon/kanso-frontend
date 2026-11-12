import { describe, expect, it } from 'vitest';
import {
  activitySplit,
  analysePatterns,
  answerOf,
  describePattern,
  findingSupport,
  kindsPhrase,
  patternDays,
  patternFindings,
  patternNumbers,
  patternsRest,
  patternSupport,
  quietActivities,
  quietLine,
  tagsCardGroups,
  thinReason,
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
    activity: { tasks: i % 4, notes: 0, habits: 0, events: 0 },
  }));

describe('analysePatterns', () => {
  const analysis = analysePatterns(month(), new Map([[study.key, study]]), '2026-10-01|2026-10-31');
  const row = (key: string) => analysis.rows.find(r => r.key === key)!;

  it('judges activities, tags and moments by one rule, sharing one chance bar per feeling', () => {
    expect(analysis.rows.map(r => r.key)).toEqual(['activity:tasks', 'activity:notes', 'activity:habits', 'activity:events', 'tag:7', 'moment:Exam']);
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
    const alike = month(25).map(d => ({ ...d, tags: new Set<string>(), moments: new Set(['Coffee']), activity: { tasks: 0, notes: 0, habits: 0, events: 0 } }));
    expect(patternsRest(analysePatterns(alike, new Map(), 'x'), 'this month')).toEqual([
      'Your tasks barely changed from day to day.',
      'Your time in notes barely changed from day to day.',
      'Your habits barely changed from day to day.',
      'Your time in events barely changed from day to day.',
    ]);
  });

  it('names no row as too few days when it is on every work day and no day off', () => {
    const workOnly = month(25).map((d, i) => {
      const off = i % 7 >= 5;
      return { ...d, off, tags: new Set<string>(), moments: new Set(off ? [] : ['Lecture']), activity: { tasks: 0, notes: 0, habits: 0, events: 0 } };
    });
    const analysis = analysePatterns(workOnly, new Map(), 'x');
    expect(patternSupport(analysis.rows.find(r => r.key === 'moment:Lecture')!, 'mood'))
      .toBe('Work days are compared with work days, days off with days off · 19 days vs 6 other');
    expect(patternsRest(analysis, 'this month')).toEqual([
      'Your tasks barely changed from day to day.',
      'Your time in notes barely changed from day to day.',
      'Your habits barely changed from day to day.',
      'Your time in events barely changed from day to day.',
    ]);
  });

  it('says work days and days off are kept apart, not to wait, for a habit done on every work day', () => {
    // 30 days: 22 work days with the habit checked off, 8 days off without it.
    const weekdays = month(30).map((d, i) => {
      const off = i % 7 >= 5;
      return { ...d, off, tags: new Set<string>(), moments: new Set<string>(), activity: { tasks: 0, notes: 0, habits: off ? 0 : 1, events: 0 } };
    });
    const analysis = analysePatterns(weekdays, new Map(), 'x');
    const habits = analysis.rows.find(r => r.key === 'activity:habits')!;
    expect(habits.flat).toBe(false);
    expect(habits.answer.mood.kind).toBe('wait');
    expect(patternSupport(habits, 'mood')).toBe('Work days are compared with work days, days off with days off · 22 days vs 8 other');
    expect(patternsRest(analysis, 'this month')).toEqual([
      'Your tasks barely changed from day to day.',
      'Your time in notes barely changed from day to day.',
      'Your time in events barely changed from day to day.',
    ]);
  });

  it('never leaves the summary empty when every activity splits along work days and days off', () => {
    const split = month(30).map((d, i) => {
      const off = i % 7 >= 5;
      return { ...d, off, tags: new Set<string>(), moments: new Set<string>(), activity: { tasks: off ? 0 : 2, notes: off ? 0 : 30, habits: off ? 0 : 1, events: off ? 0 : 90 } };
    });
    expect(patternsRest(analysePatterns(split, new Map(), 'x'), 'this month')).toEqual([
      'Work days are compared with work days, days off with days off.',
    ]);
  });

  it('names a rare tag as too few days, not the check-ins, when every day was checked in', () => {
    const rare = month(25).map((d, i) => ({ ...d, tags: new Set(i < 2 ? [study.key] : []), moments: new Set<string>(), activity: { tasks: 0, notes: 0, habits: 0, events: 0 } }));
    expect(patternsRest(analysePatterns(rare, new Map([[study.key, study]]), 'x'), 'this month')).toEqual([
      'Your tasks barely changed from day to day.',
      'Your time in notes barely changed from day to day.',
      'Your habits barely changed from day to day.',
      'Your time in events barely changed from day to day.',
      'Too few days to tell yet: Study.',
    ]);
  });
});

describe('the Events row', () => {
  // 24 work days: 0, 60, 120 or 180 minutes in events in turn, stress 2 on the quieter half and 4 on the busier.
  const days = month().map((d, i) => ({ ...d, stress: i % 4 >= 2 ? 4 : 2, activity: { ...d.activity, events: (i % 4) * 60 } }));
  const analysis = analysePatterns(days, new Map(), 'x');
  const events = analysis.rows.find(r => r.key === 'activity:events')!;

  it('splits days at the middle of their time in events and names the sides in hours', () => {
    expect(events.name).toBe('Events');
    expect(events.threshold).toBe(120);
    expect(events.on).toBe('days with 2h+ in events');
    expect(events.off).toBe('days with under 2h');
    expect(describePattern(events, 'stress')).toBe('Your stress was clearly higher on days with more time in events');
  });

  it('reads whole minutes in events from the day’s minutes', () => {
    const rows = [{ day: '2026-10-02', mood: 3, energy: null, stress: null, off: false, tags: new Set<string>() }];
    const [d] = patternDays(rows, new Map(), new Map(), new Map([['2026-10-02', 89.6]]));
    expect(d.activity).toEqual({ tasks: 0, notes: 0, habits: 0, events: 90 });
  });

  it('says how much you did made no difference only when all four activities were quiet', () => {
    const quiet = analysePatterns(month().map((d, i) => ({ ...d, stress: 3, activity: { tasks: i % 2, notes: (i % 2) * 30, habits: i % 2, events: (i % 2) * 60 } })), new Map(), 'x');
    expect(quietActivities(quiet.rows).map(r => r.name)).toEqual(['Tasks', 'Note time', 'Habits', 'Events']);
    expect(quietLine(quietActivities(quiet.rows))).toBe('How much you did made no clear difference to how you felt.');
    expect(quietLine(quietActivities(quiet.rows).slice(0, 3))).toBe('Tasks, note time and habits: no clear difference to how you felt.');
  });
});

describe('the Tags & moments card', () => {
  const kinds = (tasks: number, notes: number, habits: number, events: number) => new Map([[study.key, { tasks, notes, habits, events }]]);
  const days = month().map((d, i) => ({ ...d, tagKinds: i % 2 === 0 ? kinds(i % 4 === 0 ? 1 : 0, 0, 0, 1) : undefined }));
  const analysis = analysePatterns(days, new Map([[study.key, study]]), '2026-10-01|2026-10-31');
  const tag = analysis.rows.find(r => r.key === 'tag:7')!;

  it('counts a tag’s days by where it came from and says so, most days first', () => {
    expect(tag.kinds).toEqual({ tasks: 6, notes: 0, habits: 0, events: 12 });
    expect(findingSupport(tag, 'stress')).toBe('A clear pattern · 12 days vs 12 other · from events & tasks');
    expect(kindsPhrase({ tasks: 3, notes: 5, habits: 1, events: 0 })).toBe('notes, tasks & habits');
    expect(kindsPhrase({ tasks: 0, notes: 0, habits: 0, events: 0 })).toBeNull();
  });

  it('says how sure an early sign is by its days', () => {
    const early = analysePatterns(month(14).map(d => ({ ...d, tags: new Set(Number(d.day.slice(8)) % 2 ? [study.key] : []) })), new Map([[study.key, study]]), 'x');
    const row = early.rows.find(r => r.key === 'tag:7')!;
    expect(row.answer.stress.step).toBe('maybe');
    expect(findingSupport(row, 'stress')).toBe('Early sign: only 7 days so far · 7 days vs 7 other');
  });

  it('groups rows into found, about the same and not enough days', () => {
    const groups = tagsCardGroups(analysis.rows, 'tag', 'stress');
    expect(groups.found.map(r => r.name)).toEqual(['Study']);
    expect(tagsCardGroups(analysis.rows, 'tag', 'mood').same.map(r => r.name)).toEqual(['Study']);
    expect(tagsCardGroups(analysis.rows, 'moment', 'stress').thin.map(r => r.name)).toEqual(['Exam']);
  });

  it('gives each row with too few days its reason', () => {
    const exam = analysis.rows.find(r => r.key === 'moment:Exam')!;
    expect(thinReason(exam, 'stress', analysis.days)).toBe('on 3 days so far · needs 5');
    expect(thinReason(tag, 'energy', analysis.days)).toBe('no energy logged in your check-ins yet');
    // On every work day but 3, and never on a day off: no 5 work days without it to compare with.
    const weekdays = month(28).map((d, i) => {
      const off = i % 7 >= 5;
      return { ...d, off, tags: new Set(!off && i % 7 !== 0 ? [study.key] : []), moments: new Set(i < 26 ? ['Daily'] : []) };
    });
    const busy = analysePatterns(weekdays, new Map([[study.key, study]]), 'x');
    const row = (key: string) => busy.rows.find(r => r.key === key)!;
    expect(row('tag:7').days).toBe(16);
    expect(row('tag:7').answer.mood.kind).toBe('wait');
    expect(thinReason(row('tag:7'), 'mood', busy.days)).toBe('on nearly every work day · needs 5 work days without it to compare');
    expect(thinReason(row('moment:Daily'), 'mood', busy.days)).toBe('on almost every day · needs 5 days without it');
    const weekends = weekdays.map(d => ({ ...d, tags: new Set(d.off ? [study.key] : []) }));
    const wk = analysePatterns(weekends.slice(0, 26).concat(weekends.slice(26).map(d => ({ ...d, tags: new Set<string>() }))), new Map([[study.key, study]]), 'x');
    const off = wk.rows.find(r => r.key === 'tag:7')!;
    expect(off.answer.mood.kind).toBe('wait');
    expect(thinReason(off, 'mood', wk.days)).toBe('only on days off · needs 5 days off without it');
  });
});
