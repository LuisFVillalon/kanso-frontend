'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { moodColor } from '@/app/components/mood/MoodFacePicker';
import { MOOD_LABELS, moodLabel, type MoodCheckin } from '@/app/types/mood';
import { formatDurationShort, parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import { metricValue, type DayActivity, type MoodMetric, type MoodPoint } from '@/app/utils/calendarReport';

export type RelationView = 'scatter' | 'days';

export const METRIC_INFO: Record<MoodMetric, { label: string; button: string; color: string }> = {
  tasks: { label: 'Tasks completed', button: 'Tasks', color: 'var(--tm-accent)' },
  notes: { label: 'Time in notes', button: 'Note time', color: 'var(--tm-accent-2)' },
  habits: { label: 'Habits completed', button: 'Habits', color: 'var(--tm-success)' },
};

/** The scatter's x axis title, its word for "less of it", and the footnote's name for "more of it". */
const SCATTER_AXIS: Record<MoodMetric, { title: string; less: string; more: string }> = {
  tasks: { title: 'Tasks you finished that day', less: 'fewer', more: 'tasks finished' },
  notes: { title: 'Time in notes that day', less: 'less', more: 'time in notes' },
  habits: { title: 'Habits checked off that day', less: 'fewer', more: 'habits checked off' },
};

/** A metric value as people read it: a count, or whole minutes as "1h 5m". */
export const formatMetric = (metric: MoodMetric, value: number): string =>
  metric === 'notes' ? (value > 0 ? formatDurationShort(value * 60) : '0m') : String(Math.round(value * 10) / 10);

// Upper bounds of the scatter's averaging bins — each bin takes the values
// above the previous bound up to its own; the first holds the zero days.
const BINS: Record<MoodMetric, number[]> = {
  tasks: [0, 2, 4, 6, Infinity],
  notes: [0, 30, 60, 120, Infinity],
  habits: [0, 1, 2, 3, Infinity],
};
/** A bin's average is drawn once it holds this many days. */
const BIN_MIN = 3;

const NOTE_TICK_STEPS = [15, 30, 60, 120, 180, 240, 480];

const HEIGHT = 226;
/** Shorter on a phone-width chart or a short window, so Mood › Patterns fits one screen. */
const NARROW_HEIGHT = 180;
const SHORT_QUERY = '(max-height: 760px)';
const PAD_TOP = 12;
const PAD_BOTTOM = 36;
/** The scatter's extra room: a y axis title above, and an x axis line, ticks, end labels and title below. */
const SCATTER_PAD_TOP = 26;
const SCATTER_PAD_BOTTOM = 56;
const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 280;

/** A stable 0–1 value per string, so a dot's jitter doesn't move between renders. */
const unitHash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
};

/** An SVG path through the points, broken at the gaps. */
const pathThrough = (points: ([number, number] | null)[]): string => {
  let d = '';
  let pen = false;
  for (const pt of points) {
    if (!pt) {
      pen = false;
      continue;
    }
    d += `${pen ? 'L' : 'M'}${pt[0].toFixed(1)} ${pt[1].toFixed(1)} `;
    pen = true;
  }
  return d;
};

/** The element's content width, following resizes, so the SVG is drawn 1:1 and its text never stretches. */
export const useMeasuredWidth = <T extends HTMLElement>() => {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.clientWidth) setWidth(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const w = Math.round(entries[0]?.contentRect.width ?? 0);
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, Math.max(MIN_WIDTH, width)] as const;
};

const subscribeShort = (onChange: () => void) => {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia(SHORT_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
};
const isShortNow = () => typeof window.matchMedia === 'function' && window.matchMedia(SHORT_QUERY).matches;

/** Whether the window is short (760px or less), where Mood › Patterns' charts shrink to fit one screen. */
export const useShortWindow = () => useSyncExternalStore(subscribeShort, isShortNow, () => false);

export interface DayItem {
  key: string;
  /** Axis label; empty where a label would crowd. */
  label: string;
  longLabel: string;
  /** The metric for a day, or its daily average across a year's week. */
  value: number;
  /** The day's mood, or the week's average; null without a check-in. */
  mood: number | null;
  /** Check-ins behind `mood`. */
  checkins: number;
}

/**
 * The "Day by day" series in calendar order up to today: one item per day,
 * or for a year one per Monday–Sunday week, so ~52 bars stay readable.
 */
export const dayItems = (
  byDay: Map<string, MoodCheckin>,
  days: Map<string, DayActivity>,
  start: Date,
  end: Date,
  metric: MoodMetric,
  byWeek: boolean,
  now: Date = new Date(),
): DayItem[] => {
  const todayStr = toLocalDateStr(now);
  const dates: Date[] = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    if (toLocalDateStr(d) > todayStr) break;
    dates.push(d);
  }
  const shortDates = !byWeek && dates.length > 0 && dates[0].getMonth() !== dates[dates.length - 1].getMonth();

  if (!byWeek) {
    return dates.map(d => {
      const key = toLocalDateStr(d);
      const checkin = byDay.get(key);
      return {
        key,
        label: shortDates ? `${d.getMonth() + 1}/${d.getDate()}` : String(d.getDate()),
        longLabel: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
        value: metricValue(days.get(key), metric),
        mood: checkin ? checkin.mood : null,
        checkins: checkin ? 1 : 0,
      };
    });
  }

  const weeks = new Map<string, Date[]>();
  for (const d of dates) {
    const monday = toLocalDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
    weeks.set(monday, [...(weeks.get(monday) ?? []), d]);
  }
  let lastMonth = -1;
  return [...weeks].map(([key, week]) => {
    const moods = week.map(d => byDay.get(toLocalDateStr(d))?.mood).filter((m): m is number => m != null);
    const first = parseLocalDate(key);
    const month = week[0].getMonth();
    const label = month !== lastMonth ? week[0].toLocaleDateString('en-US', { month: 'short' }) : '';
    lastMonth = month;
    return {
      key,
      label,
      longLabel: `Week of ${first.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`,
      value: week.reduce((sum, d) => sum + metricValue(days.get(toLocalDateStr(d)), metric), 0) / week.length,
      mood: moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null,
      checkins: moods.length,
    };
  });
};

interface ReportMoodRelationChartProps {
  metric: MoodMetric;
  view: RelationView;
  /** Days with a check-in, for the scatter. */
  points: MoodPoint[];
  /** The calendar-order series, for "Day by day". */
  items: DayItem[];
  /** True when "Day by day" items are weeks of a year. */
  byWeek: boolean;
}

/**
 * Mood against one activity metric. "Scatter" puts each day with a check-in
 * at its metric value and mood, jittered so stacked days stay visible, with
 * a line through each bin's average mood — honest about the noise, where a
 * fitted line would overstate it. "Day by day" draws the metric as bars and
 * mood as a line in calendar order. The SVG is drawn at its measured width;
 * an sr-only table carries the same data.
 */
const ReportMoodRelationChart: React.FC<ReportMoodRelationChartProps> = ({ metric, view, points, items, byWeek }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const short = useShortWindow();
  const info = METRIC_INFO[metric];
  const lowerLabel = info.label.toLowerCase();

  const padLeft = width < 420 ? 50 : 62;
  const height = width < 420 || short ? NARROW_HEIGHT : HEIGHT;
  const padRight = view === 'days' ? 38 : 12;
  const plotWidth = width - padLeft - padRight;
  const padTop = view === 'scatter' ? SCATTER_PAD_TOP : PAD_TOP;
  const padBottom = view === 'scatter' ? SCATTER_PAD_BOTTOM : PAD_BOTTOM;
  const plotHeight = height - padTop - padBottom;
  const yOf = (mood: number) => padTop + ((5 - mood) / 4) * plotHeight;

  const scale = MOOD_LABELS.map((name, i) => {
    const y = yOf(i + 1);
    return (
      <g key={name}>
        <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="var(--tm-rule)" strokeDasharray="2 4" />
        <circle cx={9} cy={y} r={3.5} fill={moodColor(i + 1)} />
        <text x={17} y={y + 4} fontSize={11} fill="var(--tm-text-muted)">{name}</text>
      </g>
    );
  });

  let body: React.ReactNode;
  if (view === 'scatter') {
    const discrete = metric !== 'notes';
    const xMax = Math.max(discrete ? 4 : 60, ...points.map(p => p.value));
    const xOf = (v: number) => padLeft + 10 + (v / xMax) * (plotWidth - 20);
    const ticks = discrete
      ? Array.from({ length: xMax + 1 }, (_, i) => i).filter(i => i % Math.ceil((xMax + 1) / 8) === 0)
      : (() => {
          const step = NOTE_TICK_STEPS.find(s => xMax / s <= 5) ?? 480;
          return Array.from({ length: Math.floor(xMax / step) + 1 }, (_, i) => i * step);
        })();
    const jitterX = discrete ? Math.min(22, (plotWidth / (xMax + 1)) * 0.5) : 0;
    const jitterY = plotHeight * 0.11;
    const radius = points.length > 120 ? 3 : 4.2;

    const bounds = BINS[metric];
    const bins = bounds.map(() => [] as MoodPoint[]);
    for (const p of points) bins[bounds.findIndex(upTo => p.value <= upTo)].push(p);
    const averages = bins.map(bin => {
      if (bin.length < BIN_MIN) return null;
      const meanValue = bin.reduce((s, p) => s + p.value, 0) / bin.length;
      const meanMood = bin.reduce((s, p) => s + p.mood, 0) / bin.length;
      return [xOf(meanValue), yOf(meanMood)] as [number, number];
    });

    // Below the lowest jittered dot, so the axis never cuts through one.
    const axisY = padTop + plotHeight + 12;
    body = (
      <>
        <text x={0} y={11} fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)">Your mood that day</text>
        <line x1={padLeft} x2={width - padRight} y1={axisY} y2={axisY} stroke="var(--tm-text-muted)" strokeOpacity={0.6} />
        {ticks.map(t => (
          <g key={t}>
            <line x1={xOf(t)} x2={xOf(t)} y1={axisY} y2={axisY + 4} stroke="var(--tm-text-muted)" strokeOpacity={0.6} />
            <text x={xOf(t)} y={axisY + 16} textAnchor="middle" fontSize={11} fill="var(--tm-text-muted)">{formatMetric(metric, t)}</text>
          </g>
        ))}
        <text x={padLeft} y={height - 15} fontSize={10} fill="var(--tm-text-muted)">{SCATTER_AXIS[metric].less}</text>
        <text x={padLeft + plotWidth / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)">
          {SCATTER_AXIS[metric].title}
        </text>
        <text x={width - padRight} y={height - 15} textAnchor="end" fontSize={10} fill="var(--tm-text-muted)">more</text>
        {points.map(p => (
          <circle
            key={p.dateStr}
            cx={xOf(p.value) + (unitHash(`${p.dateStr}x`) - 0.5) * jitterX}
            cy={yOf(p.mood) + (unitHash(`${p.dateStr}y`) - 0.5) * jitterY}
            r={radius}
            fill={moodColor(p.mood)}
            fillOpacity={0.62}
          >
            <title>{`${parseLocalDate(p.dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}: mood ${moodLabel(p.mood)}, ${lowerLabel} ${formatMetric(metric, p.value)}`}</title>
          </circle>
        ))}
        <path d={pathThrough(averages)} fill="none" stroke="var(--tm-text-primary)" strokeWidth={2.4} strokeOpacity={0.85} strokeLinejoin="round" strokeLinecap="round" />
        {averages.map((pt, i) =>
          pt ? <circle key={i} cx={pt[0]} cy={pt[1]} r={4.5} fill="var(--tm-surface)" stroke="var(--tm-text-primary)" strokeWidth={2.2} /> : null,
        )}
      </>
    );
  } else {
    const n = Math.max(1, items.length);
    const band = plotWidth / n;
    const max = Math.max(1, ...items.map(it => it.value));
    const barTop = (v: number) => padTop + plotHeight - (v / max) * plotHeight;
    const moodPoints = items.map((it, i) => (it.mood != null ? [padLeft + (i + 0.5) * band, yOf(it.mood)] as [number, number] : null));
    const labelStep = byWeek ? 1 : n > 14 ? 5 : 1;

    body = (
      <>
        {items.map((it, i) => (
          <rect
            key={it.key}
            x={padLeft + i * band + band * 0.14}
            y={barTop(it.value)}
            width={Math.max(1, band * 0.72)}
            height={padTop + plotHeight - barTop(it.value)}
            rx={Math.min(3, band / 4)}
            fill={info.color}
            fillOpacity={0.3}
          >
            <title>{`${it.longLabel}: ${lowerLabel} ${formatMetric(metric, it.value)}${byWeek ? ' on a typical day' : ''}; mood ${it.mood != null ? (byWeek ? it.mood.toFixed(1) : moodLabel(it.mood)) : 'not logged'}`}</title>
          </rect>
        ))}
        {[0, max / 2, max].map(t => (
          <text key={t} x={width - padRight + 4} y={barTop(t) + 4} fontSize={10.5} fill="var(--tm-text-muted)">{formatMetric(metric, metric === 'notes' ? Math.round(t) : t)}</text>
        ))}
        <path d={pathThrough(moodPoints)} fill="none" stroke="var(--tm-text-secondary)" strokeWidth={1.6} strokeOpacity={0.7} strokeLinejoin="round" strokeLinecap="round" />
        {moodPoints.map((pt, i) =>
          pt ? <circle key={items[i].key} cx={pt[0]} cy={pt[1]} r={n > 31 ? 3 : 4} fill={moodColor(Math.round(items[i].mood!))} stroke="var(--tm-surface)" strokeWidth={1.5} /> : null,
        )}
        {items.map((it, i) =>
          it.label && i % labelStep === 0 ? (
            <text key={it.key} x={padLeft + (i + 0.5) * band} y={height - 18} textAnchor={byWeek ? 'start' : 'middle'} fontSize={10.5} fill="var(--tm-text-muted)">{it.label}</text>
          ) : null,
        )}
        <text x={padLeft + plotWidth / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)">
          Bars: {lowerLabel}{byWeek ? ' on a typical day that week' : ''} · dots: mood
        </text>
      </>
    );
  }

  const summary = view === 'scatter'
    ? `Mood compared with ${lowerLabel}, one dot per day with a check-in`
    : `${info.label}${byWeek ? ' on a typical day each week,' : ' per day'} with mood`;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label={summary}>
        {scale}
        {body}
      </svg>
      {view === 'scatter' && (
        <p className="m-0 mt-1 text-[11px] text-text-muted">
          Each dot is one day. The line shows your typical mood on days with {SCATTER_AXIS[metric].less} vs more {SCATTER_AXIS[metric].more}.
        </p>
      )}

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">{byWeek && view === 'days' ? 'Week' : 'Day'}</th>
              <th scope="col">{info.label}</th>
              <th scope="col">Mood</th>
            </tr>
          </thead>
          <tbody>
            {view === 'scatter'
              ? points.map(p => (
                  <tr key={p.dateStr}>
                    <th scope="row">{parseLocalDate(p.dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</th>
                    <td>{formatMetric(metric, p.value)}</td>
                    <td>{moodLabel(p.mood)}</td>
                  </tr>
                ))
              : items.map(it => (
                  <tr key={it.key}>
                    <th scope="row">{it.longLabel}</th>
                    <td>{formatMetric(metric, it.value)}{byWeek ? ' a day' : ''}</td>
                    <td>
                      {it.mood == null
                        ? 'Not logged'
                        : byWeek ? `${it.mood.toFixed(1)} across ${it.checkins} ${it.checkins === 1 ? 'check-in' : 'check-ins'}` : moodLabel(it.mood)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ReportMoodRelationChart;
