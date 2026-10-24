'use client';

import React, { useId } from 'react';
import type { ReportPeriodKind } from '@/app/utils/calendarReport';
import { parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import {
  describeTagFeeling,
  FEELING_NAME,
  FEELING_WORDS,
  FEELINGS,
  formatAverage,
  type Feeling,
  type FeelingComparison,
  type TagDay,
  type TagFeelings,
} from '@/app/utils/tagFeelings';
import { useMeasuredWidth } from './ReportMoodRelationChart';

/** Series colors as on Mood › Over time: mood in ink, energy accent, stress accent-2. */
export const FEELING_COLOR: Record<Feeling, string> = {
  mood: 'var(--tm-text-secondary)',
  energy: 'var(--tm-accent)',
  stress: 'var(--tm-accent-2)',
};
/** A clear difference that's easier on you (better mood, more energy, calmer), or harder. */
export const EASIER_COLOR = 'var(--tm-mood-5)';
export const HARDER_COLOR = 'var(--tm-mood-1)';
const USUAL_COLOR = 'var(--tm-text-primary)';

export const tagColor = (t: TagFeelings) => t.tag.color || 'var(--tm-pencil)';

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const allThin = (t: TagFeelings) => FEELINGS.every(f => t.feel[f].verdict === 'thin');

/** Diagonal stripes for bars with too few days to tell. */
const Hatch: React.FC<{ id: string }> = ({ id }) => (
  <defs>
    <pattern id={id} width={5} height={5} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width={5} height={5} fill="var(--tm-surface)" />
      <line x1={0} y1={0} x2={0} y2={5} stroke="var(--tm-pencil)" strokeWidth={2} />
    </pattern>
  </defs>
);

const isThin = (c: FeelingComparison, hatched: boolean) => hatched || c.verdict === 'thin';

interface TagBarsChartProps {
  /** The tags to draw, those on the most days first. */
  tags: TagFeelings[];
  /** Hatch every bar: a week is too short to tell. */
  hatched: boolean;
  selected: string | null;
  onSelect: (key: string) => void;
}

/**
 * Grouped bars per tag: mood, energy and stress averaged on the tag's days,
 * each crossed by a line at your usual. ▲▼ mark only clear differences,
 * blue when easier on you and brick when harder; bars under the day
 * minimum are hatched. Tapping a tag's group or its label selects it.
 */
export const TagBarsChart: React.FC<TagBarsChartProps> = ({ tags, hatched, selected, onSelect }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const hatchId = useId();
  const narrow = width < 520;
  const padLeft = 44;
  const padRight = 8;
  const top = 18;
  const plotH = narrow ? 160 : 190;
  const groupW = (width - padLeft - padRight) / Math.max(1, tags.length);
  const tilt = groupW < 64;
  const bottom = tilt ? 74 : 40;
  const height = top + plotH + bottom + 16;
  const y = (v: number) => top + plotH - ((v - 1) / 4) * plotH;
  const bw = Math.max(5, Math.min(18, (groupW - 10) / 3.4));

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label="Mood, energy and stress on days with each tag, against your usual">
        <Hatch id={hatchId} />
        {[1, 2, 3, 4, 5].map(v => (
          <g key={v}>
            <line x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} stroke="var(--tm-rule)" strokeDasharray="2 4" />
            <text x={padLeft - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--tm-text-muted)">{v}</text>
          </g>
        ))}
        <text x={12} y={top + plotH / 2} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)" transform={`rotate(-90 12 ${top + plotH / 2})`}>
          Average, 1 (low) to 5 (high)
        </text>
        {tags.map((t, i) => {
          const cx = padLeft + groupW * (i + 0.5);
          const start = cx - (bw * 3 + 4) / 2;
          const labelY = top + plotH + 14;
          const isSelected = selected === t.tag.key;
          const n = t.feel.mood.nAvg;
          const name = clip(t.tag.name, tilt ? 12 : Math.max(6, Math.floor(groupW / 7)));
          return (
            <g
              key={t.tag.key}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              aria-label={`${t.tag.name}, ${n} ${n === 1 ? 'day' : 'days'}: show its days over time`}
              onClick={() => onSelect(t.tag.key)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(t.tag.key);
                }
              }}
              className="cursor-pointer outline-none focus-visible:[&>rect:first-child]:stroke-[var(--tm-accent)]"
            >
              <rect
                x={padLeft + groupW * i + 1}
                y={top - 8}
                width={groupW - 2}
                height={plotH + bottom - 4}
                rx={6}
                fill={isSelected ? 'var(--tm-accent-subtle)' : 'transparent'}
                stroke="transparent"
                strokeWidth={1.5}
              />
              {FEELINGS.map((f, k) => {
                const c = t.feel[f];
                if (c.avg == null) return null;
                const x = start + k * (bw + 2);
                const thin = isThin(c, hatched);
                const clear = !hatched && c.verdict === 'clear';
                return (
                  <g key={f}>
                    <title>{describeTagFeeling(t.tag.name, f, c)}</title>
                    <rect
                      x={x}
                      y={y(c.avg)}
                      width={bw}
                      height={Math.max(1, y(1) - y(c.avg))}
                      rx={2}
                      fill={thin ? `url(#${hatchId})` : FEELING_COLOR[f]}
                      stroke={thin ? FEELING_COLOR[f] : 'none'}
                    />
                    {c.other != null && (
                      <line x1={x - 2} x2={x + bw + 2} y1={y(c.other)} y2={y(c.other)} stroke={USUAL_COLOR} strokeWidth={2} strokeLinecap="round" />
                    )}
                    {clear && (
                      <text x={x + bw / 2} y={y(Math.max(c.avg, c.other ?? c.avg)) - 5} textAnchor="middle" fontSize={10} style={{ fill: c.good ? EASIER_COLOR : HARDER_COLOR }}>
                        {c.gap! > 0 ? '▲' : '▼'}
                      </text>
                    )}
                  </g>
                );
              })}
              <g opacity={!hatched && allThin(t) ? 0.55 : 1}>
                {tilt ? (
                  <text x={cx + 4} y={labelY} textAnchor="end" fontSize={11} fill="var(--tm-text-primary)" transform={`rotate(-40 ${cx + 4} ${labelY})`}>
                    <tspan style={{ fill: tagColor(t) }}>●</tspan> {name}
                  </text>
                ) : (
                  <>
                    <text x={cx} y={labelY} textAnchor="middle" fontSize={11} fill="var(--tm-text-primary)">
                      <tspan style={{ fill: tagColor(t) }}>●</tspan> {name}
                    </text>
                    <text x={cx} y={labelY + 14} textAnchor="middle" fontSize={10.5} fill="var(--tm-text-muted)">{n} {n === 1 ? 'day' : 'days'}</text>
                  </>
                )}
              </g>
              {tilt && <text x={cx} y={top + plotH + bottom - 2} textAnchor="middle" fontSize={10.5} fill="var(--tm-text-muted)">{n}d</text>}
            </g>
          );
        })}
        <line x1={padLeft} x2={width - padRight} y1={y(1)} y2={y(1)} stroke="var(--tm-text-muted)" strokeOpacity={0.6} />
        <text x={padLeft + (width - padLeft - padRight) / 2} y={height - 3} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)">
          {tilt ? 'Tag, with the days compared (d)' : 'Tag, with the days compared'}
        </text>
      </svg>

      {/* sr-only on the table itself doesn't shrink it — tables size to their content. */}
      <div className="sr-only">
        <table>
          <caption>Mood, energy and stress on days with each tag, against your usual</caption>
          <thead>
            <tr>
              <th scope="col">Tag</th>
              {FEELINGS.map(f => <th key={f} scope="col">{FEELING_NAME[f]}</th>)}
            </tr>
          </thead>
          <tbody>
            {tags.map(t => (
              <tr key={t.tag.key}>
                <th scope="row">{t.tag.name}, {t.feel.mood.nAvg} {t.feel.mood.nAvg === 1 ? 'day' : 'days'}</th>
                {FEELINGS.map(f => <td key={f}>{describeTagFeeling(t.tag.name, f, t.feel[f])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface TagTimelineChartProps {
  /** The period's check-in days, oldest first. */
  days: TagDay[];
  tag: TagFeelings;
  feeling: Feeling;
  kind: ReportPeriodKind;
  periodStart: Date;
  periodEnd: Date;
}

const DAY_MS = 86400000;
const dayIndex = (from: Date, day: string) => Math.round((parseLocalDate(day).getTime() - from.getTime()) / DAY_MS);

/**
 * One feeling day by day across the period, one dot per check-in, with the
 * tag's days as soft columns in its color, a dashed line at their average
 * and a dotted ink line at your usual. A year runs from the first check-in
 * to the last, so months without any don't squeeze the rest.
 */
export const TagTimelineChart: React.FC<TagTimelineChartProps> = ({ days, tag, feeling, kind, periodStart, periodEnd }) => {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>();
  const points = days.filter(d => d[feeling] != null);
  const narrow = width < 520;
  const padLeft = narrow ? 58 : 66;
  const padRight = narrow ? 70 : 92;
  const top = 12;
  const plotH = narrow ? 150 : 180;
  const height = top + plotH + 44;
  const first = kind === 'year' && points.length ? parseLocalDate(points[0].day) : periodStart;
  const last = kind === 'year' && points.length ? parseLocalDate(points[points.length - 1].day) : periodEnd;
  const span = Math.max(1, Math.round((last.getTime() - first.getTime()) / DAY_MS));
  const plotW = width - padLeft - padRight;
  const x = (day: string) => padLeft + (dayIndex(first, day) / span) * plotW;
  const y = (v: number) => top + plotH - ((v - 1) / 4) * plotH;
  const step = plotW / span;
  const c = tag.feel[feeling];
  const color = tagColor(tag);
  const words = FEELING_WORDS[feeling];

  const ticks: [string, string][] = [];
  if (kind === 'year') {
    for (let m = first.getMonth(); m <= last.getMonth(); m++) {
      const d = new Date(first.getFullYear(), m, m === first.getMonth() ? first.getDate() : 1);
      ticks.push([toLocalDateStr(d), d.toLocaleDateString('en-US', { month: 'short' })]);
    }
  } else {
    const n = kind === 'week' ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const d = new Date(first.getFullYear(), first.getMonth(), first.getDate() + Math.round((span * i) / (n - 1)));
      ticks.push([toLocalDateStr(d), d.toLocaleDateString('en-US', kind === 'week' ? { weekday: 'short' } : { month: 'short', day: 'numeric' })]);
    }
  }

  // A tick crowding the next one (a year starting late in a month) gives way to it.
  const spaced = ticks.filter(([d], i) => i === ticks.length - 1 || x(ticks[i + 1][0]) - x(d) >= 30);

  const avgY = c.avg != null ? y(c.avg) : null;
  const usualY = c.other != null ? y(c.other) : null;
  const usualLabelY = usualY != null ? usualY + (avgY != null && Math.abs(usualY - avgY) < 14 ? (usualY >= avgY ? 14 : -10) : 4) : 0;
  const longDay = (day: string) => parseLocalDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const summary = `Your ${FEELING_NAME[feeling].toLowerCase()} day by day, with ${tag.tag.name} days highlighted`;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block overflow-visible" role="img" aria-label={summary}>
        {[1, 2, 3, 4, 5].map(v => (
          <g key={v}>
            <line x1={padLeft} x2={width - padRight} y1={y(v)} y2={y(v)} stroke="var(--tm-rule)" strokeDasharray="2 4" />
            <text x={padLeft - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--tm-text-muted)">{v} {words[v - 1]}</text>
          </g>
        ))}
        {points.filter(d => d.tags.has(tag.tag.key)).map(d => (
          <rect key={`col-${d.day}`} x={x(d.day) - Math.max(2, step / 2)} y={top} width={Math.max(4, step)} height={plotH} fill={color} opacity={0.16} />
        ))}
        <polyline points={points.map(d => `${x(d.day).toFixed(1)},${y(d[feeling]!).toFixed(1)}`).join(' ')} fill="none" stroke="var(--tm-border-strong)" strokeWidth={1.2} />
        {points.map(d => {
          const on = d.tags.has(tag.tag.key);
          const v = d[feeling]!;
          return (
            <circle key={d.day} cx={x(d.day)} cy={y(v)} r={on ? 4 : 2.6} fill={on ? color : 'var(--tm-surface)'} stroke={on ? 'var(--tm-surface)' : 'var(--tm-pencil)'} strokeWidth={1.2}>
              <title>{`${longDay(d.day)}: ${FEELING_NAME[feeling].toLowerCase()} ${words[v - 1]}${on ? ` · ${tag.tag.name}` : ''}`}</title>
            </circle>
          );
        })}
        {avgY != null && (
          <>
            <line x1={padLeft} x2={width - padRight} y1={avgY} y2={avgY} stroke={color} strokeWidth={2} strokeDasharray="6 4" />
            <text x={width - padRight + 6} y={avgY + 4} fontSize={11} fontWeight={600} style={{ fill: color }}>{clip(tag.tag.name, narrow ? 7 : 9)} {formatAverage(c.avg)}</text>
          </>
        )}
        {usualY != null && (
          <>
            <line x1={padLeft} x2={width - padRight} y1={usualY} y2={usualY} stroke={USUAL_COLOR} strokeWidth={1.6} strokeDasharray="2 3" />
            <text x={width - padRight + 6} y={usualLabelY} fontSize={11} fontWeight={600} fill="var(--tm-text-primary)">usual {formatAverage(c.other)}</text>
          </>
        )}
        {spaced.map(([d, label]) => (
          <text key={d} x={x(d)} y={top + plotH + 16} textAnchor="middle" fontSize={10.5} fill="var(--tm-text-muted)">{label}</text>
        ))}
        <line x1={padLeft} x2={width - padRight} y1={top + plotH} y2={top + plotH} stroke="var(--tm-text-muted)" strokeOpacity={0.6} />
        <text x={padLeft + plotW / 2} y={height - 4} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--tm-text-muted)">
          Day (only days with a check-in)
        </text>
      </svg>

      <div className="sr-only">
        <table>
          <caption>{summary}</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">{FEELING_NAME[feeling]}</th>
              <th scope="col">{tag.tag.name}</th>
            </tr>
          </thead>
          <tbody>
            {points.map(d => (
              <tr key={d.day}>
                <th scope="row">{longDay(d.day)}</th>
                <td>{words[d[feeling]! - 1]}</td>
                <td>{d.tags.has(tag.tag.key) ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
