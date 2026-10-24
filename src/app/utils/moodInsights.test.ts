import { beforeAll, describe, expect, it } from 'vitest';
import type { MoodCheckin } from '@/app/types/mood';
import { periodContaining, type ReportPeriodKind } from './calendarReport';
import { parseLocalDate, toLocalDateStr } from './dateUtils';
import { indexDayCheckins } from './moodReport';
import { aboutRows, analyseMoodInsights, chartMarks, compareGroups, GATE, headlineBasis, WHY, type MoodInsights } from './moodInsights';

beforeAll(() => {
  // Local-day math depends on the zone; pin one with a DST change.
  process.env.TZ = 'America/Los_Angeles';
});

const TODAY = new Date(2026, 9, 23, 20, 0);

let nextId = 1;
const checkin = (period_start: string, mood: number, energy: number | null = null, stress: number | null = null): MoodCheckin => ({
  id: nextId++, period_kind: 'day', period_start, mood, energy, stress,
  workload: null, highlight: null, progress: null, word: null, note: null, tags: [],
  created_at: `${period_start}T20:00:00Z`, updated_at: `${period_start}T20:00:00Z`,
});

// The demo sandbox's daily check-ins, from the backend seed (demo_crud.py) for Oct 23, 2026: "MM-DD" then mood, energy, stress.
const DEMO_DAYS = [
  '07-25233', '07-26323', '07-28322', '07-31342', '08-02324', '08-03234', '08-04334', '08-05444', '08-06323',
  '08-07333', '08-08441', '08-09543', '08-10334', '08-12244', '08-13323', '08-14342', '08-16531', '08-17344',
  '08-19454', '08-21333', '08-22342', '08-23453', '08-24235', '08-26334', '08-27222', '08-28553', '08-29232',
  '08-31324', '09-01134', '09-02344', '09-03324', '09-04434', '09-05443', '09-06333', '09-07324', '09-08324',
  '09-09335', '09-10424', '09-11234', '09-12334', '09-13332', '09-14554', '09-15422', '09-16544', '09-17423',
  '09-18213', '09-19534', '09-20242', '09-21454', '09-22322', '09-23345', '09-24222', '09-25324', '09-26541',
  '09-27323', '09-28315', '09-29325', '09-30114', '10-01322', '10-02323', '10-03222', '10-04453', '10-05325',
  '10-06324', '10-07424', '10-09333', '10-10323', '10-12214', '10-13421', '10-15323', '10-16332', '10-17454',
  '10-18224', '10-19424', '10-20312', '10-22322',
];
const DEMO = DEMO_DAYS.map(s => checkin(`2026-${s.slice(0, 5)}`, +s[5], +s[6], +s[7]));

const clamp = (x: number) => Math.min(5, Math.max(1, Math.round(x)));
const lcg = (seed: number) => {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
};
const addDays = (s: string, n: number) => {
  const d = parseLocalDate(s);
  return toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
};

/** The demo before October, plus an invented October (Oct 1–22) drawn from `moodOf`. */
const withOctober = (
  seed: number,
  moodOf: (day: string, i: number, r: () => number) => number,
  stressOf?: (day: string, r: () => number) => number,
): MoodCheckin[] => {
  const r = lcg(seed);
  const october: MoodCheckin[] = [];
  for (let i = 0, d = '2026-10-01'; d <= '2026-10-22'; i++, d = addDays(d, 1)) {
    if (r() > 0.86) continue;
    const mood = moodOf(d, i, r);
    const stress = stressOf ? stressOf(d, r) : clamp(6 - mood + (r() * 2 - 1));
    october.push(checkin(d, mood, clamp(mood + (r() < 0.25 ? -1 : r() < 0.33 ? 1 : 0)), stress));
  }
  return [...DEMO.filter(c => c.period_start < '2026-10-01'), ...october];
};

const inStretch = (d: string) => d >= '2026-10-06' && d <= '2026-10-14';
const SCENARIOS: Record<string, MoodCheckin[]> = {
  demo: DEMO,
  improving: withOctober(11, (d, i, r) => clamp(2.0 + (i / 21) * 2.4 + (r() - 0.5) * 1.2)),
  stress: withOctober(
    5,
    (d, i, r) => (inStretch(d) ? clamp(1.8 + (r() - 0.5) * 1.2) : clamp(3.7 + (r() - 0.5) * 1.4)),
    (d, r) => (inStretch(d) ? clamp(4.5 + (r() - 0.5)) : clamp(2.2 + (r() - 0.5) * 1.6)),
  ),
  steady: withOctober(3, (d, i, r) => (r() < 0.55 ? 3 : 4), (d, r) => (r() < 0.5 ? 2 : 3)),
  sparse: [checkin('2026-10-20', 4, 3, 2), checkin('2026-10-22', 3, 3, 3)],
};

const analyse = (data: MoodCheckin[], kind: ReportPeriodKind, anchor = TODAY) =>
  analyseMoodInsights(periodContaining(kind, anchor), indexDayCheckins(data), TODAY);

/** One check-in a day from `from`, with these moods (null skips a day) and optional stress. */
const run = (from: string, moods: (number | null)[], stress?: (i: number) => number | null, energy?: (i: number) => number | null): MoodCheckin[] =>
  moods.flatMap((m, i) => (m == null ? [] : [checkin(addDays(from, i), m, energy?.(i) ?? null, stress?.(i) ?? null)]));

const MONTHS: [ReportPeriodKind, Date][] = [
  ['week', TODAY], ['week', new Date(2026, 9, 14)], ['month', TODAY], ['month', new Date(2026, 8, 10)], ['year', TODAY],
];

describe('analyseMoodInsights on the demo and invented scenarios', () => {
  const headline = (k: string, kind: ReportPeriodKind, anchor = TODAY) => analyse(SCENARIOS[k], kind, anchor).headline;

  it('calls the real demo steady, since its mood averages 3.1–3.2 every month', () => {
    expect(headline('demo', 'week')).toBe('A steady week, mostly Okay days.');
    expect(headline('demo', 'month')).toBe('A steady month, mostly Okay days.');
    expect(headline('demo', 'year')).toBe('A steady year, mostly Okay days.');
    expect(headline('demo', 'month', new Date(2026, 8, 10))).toBe('Mostly Okay, with a dip around Sep 24–30.');
    const last = analyse(DEMO, 'week', new Date(2026, 9, 14));
    expect(last.headline).toBe('A week of ups and downs.');
    expect(last.why).toBe(WHY.days);
    expect(last.notes.map(n => n.insight.text)).toEqual(['Best days: Tuesday and Saturday (Good). Hardest: Monday and Sunday (Low, with stress High or more).']);
  });

  it('finds the improving month’s climb, though its average is about the same as September’s', () => {
    const r = analyse(SCENARIOS.improving, 'month');
    expect(r.headline).toBe('Your mood has been climbing through the month.');
    expect(r.why).toBe(WHY.better);
    expect(r.notes.map(n => n.insight.text)).toEqual(['Your mood climbed: 2.8 early on (Oct 1–11), 3.8 lately (Oct 12–22).']);
    expect(headlineBasis(r)).toBe('Compares your first 10 check-ins with your last 10.');
    const week = analyse(SCENARIOS.improving, 'week');
    expect(week.headline).toBe('A brighter week than the week before.');
    expect(week.notes[0].insight.text).toBe('A brighter week than the week before: mood averaged 4.5, up from 3.3.');
    expect(headlineBasis(week)).toBe('Compares 4 check-ins with 6 from the week before.');
  });

  it('names the stressful stretch and how stress moved with mood', () => {
    const r = analyse(SCENARIOS.stress, 'month');
    expect(r.headline).toBe('Mostly Okay, with one harder stretch around Oct 7–12.');
    expect(r.why).toBe(WHY.stress);
    expect(r.notes.map(n => [n.num, n.insight.text])).toEqual([
      [1, 'Your best stretch was Oct 15–21 (mostly Good). The toughest stretch was Oct 7–12 (mostly Low, and stress ran high then too).'],
      [2, 'Mood and stress moved together. On higher-stress days your mood averaged 2.0 (6 days); on calmer days, 3.6 (8 days).'],
    ]);
    expect(headlineBasis(r)).toBe('Uses your 7-day trend: its highest and lowest weeks.');
  });

  it('keeps a steady month steady and shows where its trend stayed', () => {
    const r = analyse(SCENARIOS.steady, 'month');
    expect(r.headline).toBe('A steady month, between Okay and Good.');
    expect(r.why).toBe(WHY.steady);
    expect(r.notes.map(n => n.insight.text)).toEqual(['No stretch stood out: your 7-day trend stayed between 3.2 and 3.8.']);
  });

  it('says only how many more check-ins a new user needs', () => {
    expect(headline('sparse', 'week')).toBe('Check in a few more days to see a pattern — 2 of 3 so far.');
    expect(headline('sparse', 'month')).toBe('Check in a few more days to see a pattern — 2 of 5 so far.');
    const year = analyse(SCENARIOS.sparse, 'year');
    expect(year.headline).toBe('Check in a few more days to see a pattern — 2 of 10 so far.');
    expect(year).toMatchObject({ sparse: true, why: WHY.sparse, notes: [], insights: [], head: null });
    expect(headlineBasis(year)).toBe('Patterns show after 10 check-ins; you have 2.');
    expect(headline('sparse', 'month', new Date(2026, 8, 10))).toBe('No check-ins for September yet.');
  });

  it('notes the energy link on the demo year', () => {
    const r = analyse(DEMO, 'year');
    expect(r.why).toBe(WHY.energy);
    expect(r.sure).toBe('Based on 76 check-ins since Jul 25.');
    expect(r.notes.map(n => n.insight.text)).toEqual([
      'Mood and energy moved together. On low-energy days your mood averaged 2.9 (35 days); on high-energy days, 3.8 (21 days).',
    ]);
  });
});

describe('the rules', () => {
  it('waits for 3 check-ins in a week, 5 in a month and 10 in a year', () => {
    expect(GATE).toEqual({ week: 3, month: 5, year: 10 });
    const oct = (count: number) => run('2026-10-01', Array(count).fill(4));
    expect(analyse(run('2026-10-19', [4, 4]), 'week').sparse).toBe(true);
    expect(analyse(run('2026-10-19', [4, 4, 4]), 'week').sparse).toBe(false);
    expect(analyse(oct(4), 'month').sparse).toBe(true);
    expect(analyse(oct(5), 'month').sparse).toBe(false);
    expect(analyse(oct(9), 'year').sparse).toBe(true);
    expect(analyse(oct(10), 'year').sparse).toBe(false);
  });

  it('says how it felt: most days, half, a mix, or the average’s word', () => {
    const level = (moods: number[]) => analyse(run('2026-10-01', moods), 'month').insights.find(i => i.kind === 'level')?.text;
    expect(level([4, 4, 4, 3, 2])).toBe('Most days felt Good (3 of 5).');
    expect(level([4, 4, 4, 3, 3, 2])).toBe('Half your days felt Good (3 of 6).');
    expect(analyse(run('2026-10-01', [5, 4, 3, 2, 1, 3, 4, 2]), 'month').headline).toBe('A month of ups and downs.');
    expect(level([3, 3, 4, 4, 5, 2])).toBe('Your days sat between Okay and Good, averaging 3.5 out of 5.');
  });

  it('calls a change clear only past half a step and the 1-in-20 chance check', () => {
    const many = (v: number) => Array(12).fill(v);
    expect(compareGroups(many(4), many(3), 'a').verdict).toBe('clear');
    // Half a step apart, but on two days each that's easily luck.
    expect(compareGroups([4, 3], [3, 3], 'b')).toMatchObject({ verdict: 'little' });
    expect(compareGroups([3, 4, 3, 4], [3, 3, 4, 3], 'c').verdict).toBe('same');
    // A gap too small to count, however many days.
    expect(compareGroups([...many(4), ...many(3)], [...many(4), 3, ...Array(11).fill(3.6)], 'd').verdict).not.toBe('clear');
    // Splitting the bar across tests makes a borderline gap too close to call.
    const a = [4, 4, 4, 3, 4, 5, 4, 4, 4];
    const b = [3, 4, 3, 3, 4, 3, 3, 4, 3];
    const one = compareGroups(a, b, 'e');
    expect(one.p).toBeGreaterThan(0.025);
    expect(one.p).toBeLessThan(0.05);
    expect(one.verdict).toBe('clear');
    expect(compareGroups(a, b, 'e', 2).verdict).toBe('little');
  });

  it('compares with the period before only once it has enough check-ins', () => {
    const october = run('2026-10-01', [4, 4, 4, 4, 4, 4, 4, 4, 4, 4]);
    expect(analyse([...run('2026-09-01', [3, 3, 3, 3]), ...october], 'month').insights.find(i => i.kind === 'change')).toBeUndefined();
    const brighter = analyse([...run('2026-09-01', Array(10).fill(3)), ...october], 'month');
    expect(brighter.headline).toBe('A brighter month than September.');
    expect(brighter.why).toBe(WHY.better);
    expect(brighter.notes[0]).toMatchObject({ num: 1, insight: { text: 'A brighter month than September: mood averaged 4.0, up from 3.0.' } });
    const harder = analyse([...run('2026-09-01', Array(10).fill(5)), ...october], 'month');
    expect(harder.headline).toBe('A harder month than September.');
    expect(harder.why).toBe(WHY.harder);
    const same = analyse([...run('2026-09-01', Array(10).fill(4)), ...october], 'month');
    expect(same.headline).toBe('A steady month, mostly Good days.');
    expect(same.insights.map(i => i.text)).not.toContain('About the same as September (4.0 vs 4.0).');
  });

  it('compares a year with the year before', () => {
    const year = (y: number, mood: number) => run(`${y}-03-01`, Array(12).fill(mood));
    expect(analyse([...year(2025, 2), ...year(2026, 4)], 'year').headline).toBe('A brighter year than 2025.');
  });

  it('splits the month into halves of at least 4 check-ins to call a climb or dip', () => {
    expect(analyse(run('2026-10-01', [2, 2, 2, 4, 4, 4]), 'month').insights.some(i => i.kind === 'direction')).toBe(false);
    const dip = analyse(run('2026-10-01', [4, 4, 4, 4, 5, 4, 4, 4, 2, 2, 2, 1, 2, 2, 2, 2]), 'month');
    expect(dip.headline).toBe('Your mood has dipped lately this month.');
    expect(dip.why).toBe(WHY.harder);
    // A clear dip already says where the harder days were, so the stretch isn't a note.
    expect(dip.notes.map(n => n.insight.kind)).toEqual(['direction']);
  });

  it('names a week’s best and hardest days only when they are 2 steps apart', () => {
    expect(analyse(run('2026-10-19', [3, 4, 3]), 'week').insights.find(i => i.kind === 'steady')?.text).toBe('Every day sat between Okay and Good.');
    expect(analyse(run('2026-10-19', [3, 3, 3]), 'week').insights.find(i => i.kind === 'steady')?.text).toBe('Every day felt Okay.');
    const r = analyse(run('2026-10-19', [2, 4, 4, 3], i => (i === 0 ? 5 : 2)), 'week');
    expect(r.notes[0].insight.text).toBe('Best days: Tuesday and Wednesday (Good). Hardest: Monday (Low, with stress Maxed).');
    expect(r.why).toBe(WHY.days);
    const ties = analyse(run('2026-10-12', [2, 2, 2, 4]), 'week', new Date(2026, 9, 14));
    expect(ties.notes[0].insight.text).toBe('Best day: Thursday (Good). Hardest: 3 days (Low).');
  });

  it('speaks gently about a hard stretch that is still going on', () => {
    // Good until mid-month, then a Low week to yesterday with stress running high.
    const moods = [4, 4, 4, 2, 2, 2, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2];
    const r = analyse(run('2026-10-01', moods, i => (i >= 15 ? 5 : 2)), 'month');
    expect(r.headline).toBe('The last few days have felt harder.');
    expect(r.why).toBe(WHY.now);
    expect(r.notes[0].insight.text).toBe('Your best stretch was Oct 7–13 (mostly Good). Things have felt harder since about Oct 16, and stress has run high too. Go easy on yourself.');
  });

  it('says where a month’s trend stayed when no stretch stood out', () => {
    expect(analyse(run('2026-10-01', Array(12).fill(3)), 'month').notes[0].insight.text).toBe('No stretch stood out: your 7-day trend stayed at 3.0.');
  });

  it('only uses whole 7-day stretches inside the month', () => {
    // A rough end of September doesn't make Oct 1–3 the month's toughest stretch.
    const r = analyse([...run('2026-09-24', [1, 1, 1, 1, 1, 1, 1]), ...run('2026-10-01', [3, 3, 3, 3, 3, 3, 3, 3, 3, 3])], 'month');
    expect(r.insights.find(i => i.kind === 'stretch')).toBeUndefined();
  });

  it('names the year’s best and hardest months with at least 8 check-ins', () => {
    // July's 4 Rough days are too few for it to be the hardest month.
    const r = analyse([
      ...run('2026-06-01', Array(8).fill(4)), ...run('2026-07-01', Array(4).fill(1)),
      ...run('2026-08-01', Array(8).fill(2)), ...run('2026-09-01', Array(8).fill(4)),
    ], 'year');
    expect(r.insights.find(i => i.kind === 'stretch')?.text).toBe('Best month: June (4.0). Hardest: August (2.0).');
    expect(r.notes[0].insight.mark).toMatchObject({ type: 'months', best: ['2026-06'], worst: ['2026-08'] });
  });

  it('says mood moved with stress only with 10 check-ins and 5 days on each side', () => {
    const moods = [4, 4, 4, 4, 4, 2, 2, 2, 2, 2];
    const together = (stress: (i: number) => number) => analyse(run('2026-10-01', moods, stress), 'month').insights.find(i => i.kind === 'together');
    expect(together(i => (i < 5 ? 1 : 5))?.text).toBe('Mood and stress moved together. On higher-stress days your mood averaged 2.0 (5 days); on calmer days, 4.0 (5 days).');
    // Four calm days aren't enough to compare.
    expect(together(i => (i < 4 ? 1 : 5))).toBeUndefined();
    expect(analyse(run('2026-10-01', moods.slice(1), i => (i < 4 ? 1 : 5)), 'month').insights.find(i => i.kind === 'together')).toBeUndefined();
  });

  it('asks for more check-ins when they cover under half the days', () => {
    const sparse = analyse(run('2026-10-01', [4, null, null, 4, null, null, 4, null, null, 4, null, null, 4]), 'month');
    expect(sparse.insights.map(i => i.text)).toContain('You checked in on 5 of 23 days. More check-ins make this picture sharper.');
    expect(sparse.sure).toBe('Based on 5 check-ins over 23 days so far.');
    expect(analyse(run('2026-09-01', Array(30).fill(4)), 'month', new Date(2026, 8, 10)).sure).toBe('Based on 30 check-ins over 30 days.');
  });
});

describe('numbered notes', () => {
  const cases: [string, MoodInsights][] = Object.entries(SCENARIOS).flatMap(([k, data]) =>
    MONTHS.map(([kind, anchor]) => [`${k} ${kind} ${toLocalDateStr(anchor)}`, analyse(data, kind, anchor)] as [string, MoodInsights]));

  const keysFor = (r: MoodInsights, anchor: Date) => {
    const p = periodContaining(r.kind, anchor);
    if (r.kind === 'year') return Array.from({ length: 12 }, (_, m) => `${p.start.getFullYear()}-${String(m + 1).padStart(2, '0')}`);
    const out: string[] = [];
    for (let d = toLocalDateStr(p.start); d <= toLocalDateStr(p.end); d = addDays(d, 1)) out.push(d);
    return out;
  };

  it.each(cases)('%s: each number is on the chart once and has exactly one note', (name, r) => {
    const anchor = MONTHS.find(([kind, a]) => name.endsWith(`${kind} ${toLocalDateStr(a)}`))![1];
    expect(r.notes.length).toBeLessThanOrEqual(2);
    expect(r.notes.map(n => n.num)).toEqual(r.notes.map((_, i) => i + 1));
    for (const n of r.notes) expect(n.insight.mark).toBeDefined();
    const marks = chartMarks(r.notes, keysFor(r, anchor), r.kind);
    // Shaded stretches show either their own labels or one key, whichever fits.
    for (const keyed of [false, true]) {
      const tags = marks.tags.filter(t => (keyed ? !t.spanLabel : !t.spanKey));
      const onChart = [...tags, ...marks.lines].flatMap(m => (m.num ? [m.num] : []));
      expect(onChart.sort()).toEqual(r.notes.map(n => n.num));
    }
    // Every mark lands on the chart.
    for (const s of [...marks.spans, ...marks.lines]) expect(s.from).toBeGreaterThanOrEqual(0);
    for (const ring of marks.rings) expect(ring.at).toBeGreaterThanOrEqual(0);
  });

  it('numbers a best/hardest stretch once, on its earlier span', () => {
    const r = analyse(SCENARIOS.stress, 'month');
    const marks = chartMarks(r.notes, keysFor(r, TODAY), 'month');
    expect(marks.spans.map(s => s.tone)).toEqual(['worst', 'best']);
    // Each stretch has its own label, and one key for both stands in where they would overlap.
    expect(marks.tags.filter(t => t.series === 'mood').map(t => [t.label, t.num, !!t.spanLabel])).toEqual([
      ['Toughest stretch', 1, true], ['Best stretch', undefined, true], ['Toughest stretch Best stretch', 1, false],
    ]);
    expect(marks.tags.find(t => t.spanKey)?.spanKey).toEqual([{ tone: 'worst', label: 'Toughest stretch' }, { tone: 'best', label: 'Best stretch' }]);
    expect(marks.tags.find(t => t.series === 'stress')).toMatchObject({ num: 2, label: 'Moved opposite to mood' });
  });

  it('draws the period before’s average as a line carrying the number', () => {
    const r = analyse(SCENARIOS.improving, 'week');
    const marks = chartMarks(r.notes, keysFor(r, TODAY), 'week');
    expect(marks.lines).toEqual([{ from: 0, to: 6, value: expect.closeTo(3.33, 2), label: 'Last week avg 3.3', num: 1, muted: true }]);
  });

  it('rings a week’s best and hardest days under one key', () => {
    const r = analyse(DEMO, 'week', new Date(2026, 9, 14));
    const marks = chartMarks(r.notes, keysFor(r, new Date(2026, 9, 14)), 'week');
    expect(marks.rings.map(x => [x.at, x.hard])).toEqual([[1, false], [5, false], [0, true], [6, true]]);
    expect(marks.tags).toEqual([{ series: 'mood', at: 0, num: 1, label: 'Best Hardest', ringKey: true }]);
  });
});

describe('aboutRows', () => {
  const drawn = { line: true, hollow: true, weekly: true };
  const strong = (r: MoodInsights, d = drawn) => aboutRows(r, d).map(x => x.strong);

  it('explains only the marks on the chart, and never a numbers row', () => {
    const r = analyse(SCENARIOS.improving, 'month');
    expect(aboutRows(r, drawn)).toEqual([
      { icon: 'headline', strong: 'Headline:', rest: 'Compares your first 10 check-ins with your last 10.' },
      { icon: 'dot', strong: 'Dot = one day', rest: '' },
      { icon: 'line', strong: 'Line = your usual', rest: 'over the past week' },
      { icon: 'hollow', strong: 'Hollow dot = no check-in.', rest: 'Tap it to log that day' },
      { icon: 'dash', strong: 'Dashed line = your weekly check-in, or your average early on and lately', rest: '' },
    ]);
    expect(strong(r, { line: true, hollow: false, weekly: false }))
      .toEqual(['Headline:', 'Dot = one day', 'Line = your usual', 'Dashed line = your average early on and lately']);
    expect(strong(analyse(DEMO, 'month'), { line: true, hollow: false, weekly: false })).toEqual(['Headline:', 'Dot = one day', 'Line = your usual']);
  });

  it('names the period before’s average among the dashed lines', () => {
    expect(strong(analyse(SCENARIOS.improving, 'week'), { line: true, hollow: false, weekly: false }))
      .toEqual(['Headline:', 'Dot = one day', 'Line', 'Dashed line = last week’s average']);
    const october = run('2026-10-01', Array(10).fill(4));
    expect(strong(analyse([...run('2026-09-01', Array(10).fill(3)), ...october], 'month'), { line: true, hollow: true, weekly: true }))
      .toContain('Dashed line = your weekly check-in, or September’s average');
  });

  it('reads a year’s dots as months, its band as where most days fell, and has no hollow dots', () => {
    expect(aboutRows(analyse(DEMO, 'year'), drawn)).toEqual([
      { icon: 'headline', strong: 'Headline:', rest: 'How your 76 check-ins felt.' },
      { icon: 'dot', strong: 'Dot = one month', rest: '(its average)' },
      { icon: 'bar', strong: 'Soft bar = where most days fell', rest: '' },
    ]);
  });

  it('leaves out the line while too few days draw one', () => {
    expect(strong(analyse(SCENARIOS.sparse, 'month'), { line: false, hollow: true, weekly: false }))
      .toEqual(['Headline:', 'Dot = one day', 'Hollow dot = no check-in.']);
  });
});
