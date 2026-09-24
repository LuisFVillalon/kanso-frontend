'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { getPriorityStyle } from '@/app/utils/taskUtils';
import { TrendLineChart } from '@/app/components/charts/TrendLineChart';
import { MODAL_LAYER } from '@/app/components/common/Modal';

// ── Progress rings ───────────────────────────────────────────────────────────

interface ProgressRingProps {
  pct: number;
  color: string;
  label?: string;
  detail?: string;
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  complete?: boolean;
  hideLabel?: boolean;
  fluid?: boolean;
}

// Flat-fill circular progress indicator — a colored arc over a hairline
// track, no gradient. Two of these sit side by side to contrast overall
// completion against completion within priority-tagged tasks.
export const ProgressRing: React.FC<ProgressRingProps> = ({
  pct, color, label, detail, size = 76, strokeWidth = 7, centerLabel, complete, hideLabel, fluid,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = circumference * (1 - clamped / 100);

  const ring = (
    <div className={fluid ? 'relative aspect-square mx-auto' : 'relative flex-shrink-0'} style={fluid ? { width: '39%' } : { width: size, height: size }}>
      <svg width={fluid ? '100%' : size} height={fluid ? '100%' : size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tm-surface-raised)" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: `stroke-dashoffset var(--tm-dur-slow) var(--tm-ease)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {complete ? (
          <Check className="w-1/2 h-1/2" style={{ color }} strokeWidth={2.5} />
        ) : (
          <span
            className={`${fluid ? 'text-sm sm:text-base' : centerLabel ? 'text-sm sm:text-base' : 'text-base sm:text-lg'} font-bold leading-none`}
            style={{ color: 'var(--tm-text-primary)' }}
          >
            {centerLabel ?? `${clamped}%`}
          </span>
        )}
      </div>
    </div>
  );

  if (hideLabel) return ring;

  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      {ring}
      <div className="flex flex-col items-center gap-0 text-center">
        <span className={`${fluid ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} font-semibold`} style={{ color }}>{label}</span>
        <span className={`${fluid ? 'text-xs sm:text-sm' : 'text-[11px] xs:text-xs'} text-text-muted`}>{detail}</span>
      </div>
    </div>
  );
};

export interface WeekSegment {
  total: number;
  completed: number;
  isToday: boolean;
}

interface SegmentedProgressRingProps {
  segments: WeekSegment[]; // seven entries, Monday through Sunday
  pct: number;
  color: string;
  label: string;
  detail: string;
  size?: number;
  strokeWidth?: number;
  fluid?: boolean;
}

// Like ProgressRing, but the arc is split into one hairline-gapped segment
// per day (Mon–Sun) instead of a single continuous sweep — a flat-fill
// glance at which days are done, pending, or empty this week.
export const SegmentedProgressRing: React.FC<SegmentedProgressRingProps> = ({
  segments, pct, color, label, detail, size = 76, strokeWidth = 7, fluid,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, pct));
  const gapLen = 3;

  // Days with no tasks due carry no weight and get skipped entirely — only
  // days that actually have tasks get a slice of the ring, sized by their
  // share of the week's total task count. That way each day's own
  // completion fraction, multiplied by its slice width, always sums to
  // exactly the overall pct: the ring's colored length matches the number
  // in the middle no matter how tasks are distributed across the week.
  const activeDays = segments.filter(s => s.total > 0);
  const totalTasks = activeDays.reduce((sum, s) => sum + s.total, 0);
  const availableLen = circumference - activeDays.length * gapLen;

  const slices = activeDays.reduce<{ seg: WeekSegment; segLen: number; startOffset: number }[]>((acc, seg) => {
    const segLen = totalTasks > 0 ? (seg.total / totalTasks) * availableLen : 0;
    const prevEnd = acc.length > 0 ? acc[acc.length - 1].startOffset + acc[acc.length - 1].segLen + gapLen : 0;
    return [...acc, { seg, segLen, startOffset: prevEnd }];
  }, []);

  // Only the filled (completed) portion of each active day gets its own
  // gapped arc — the track underneath is one uninterrupted circle (same as
  // the plain ProgressRing), so the ring always reads as a complete circle
  // even when most days of the week have no tasks due.
  const fillArcs = slices.flatMap(({ seg, segLen: thisSegLen, startOffset }) => {
    const filledLen = thisSegLen * (seg.completed / seg.total);
    if (filledLen <= 0) return [];
    return [(
      <circle
        key={`${startOffset}-fill`}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={seg.isToday ? strokeWidth + 2 : strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${filledLen} ${circumference}`}
        strokeDashoffset={-startOffset}
        style={{ transition: `stroke-dasharray var(--tm-dur-slow) var(--tm-ease)` }}
      />
    )];
  });

  return (
    <div className="flex flex-col items-center gap-1.5 flex-1 min-w-0">
      <div className={fluid ? 'relative aspect-square mx-auto' : 'relative flex-shrink-0'} style={fluid ? { width: '39%' } : { width: size, height: size }}>
        <svg width={fluid ? '100%' : size} height={fluid ? '100%' : size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tm-surface-raised)" strokeWidth={strokeWidth} />
          {fillArcs}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm sm:text-base font-bold leading-none" style={{ color: 'var(--tm-text-primary)' }}>
            {clamped}%
          </span>
        </div>
      </div>
      <div className="flex flex-col items-center gap-0 text-center">
        <span className={`${fluid ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'} font-semibold`} style={{ color }}>{label}</span>
        <span className={`${fluid ? 'text-xs sm:text-sm' : 'text-[11px] xs:text-xs'} text-text-muted`}>{detail}</span>
      </div>
    </div>
  );
};

// ── Category donut / bar / priority charts ───────────────────────────────────

export interface DonutCategory {
  label: string;
  count: number;
  color: string;
  // Optional list of item titles this wedge represents (e.g. the notes
  // filed under this tag) — when present, hovering the wedge shows them
  // in a small popover instead of just the native count/percent tooltip.
  items?: string[];
  // Summed estimated_time (hours) across this category's tasks — omitted
  // (or 0) when none of them carry an estimate.
  hours?: number;
}

interface CategoryDonutProps {
  categories: DonutCategory[];
  size?: number;
  strokeWidth?: number;
  // Formats a category's raw `count` for the hover tooltip — e.g. seconds as
  // "1h 20m" instead of the bare number. Defaults to the count as-is, which
  // is what every plain-count caller (tags, priorities, …) wants.
  formatValue?: (count: number) => string;
}

// A flat-fill donut chart — one hairline-gapped arc per category, sized to
// its share of the total, in place of a gradient sweep. The hole shows the
// active category's share of the total (its color echoed in the text) — the
// largest category by default, or whichever arc is currently hovered, with
// every other arc fading out so the highlighted one reads clearly.
export const CategoryDonut: React.FC<CategoryDonutProps> = ({ categories, size = 128, strokeWidth = 22, formatValue = String }) => {
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  // The items popover is portaled to <body> (see below) so it can't be clipped
  // by an ancestor's `overflow: hidden`/`auto` — the compact dashboard tile and
  // the expanded overlay's scrollable modal panel both have one. Position is
  // measured off this wrapper each time a wedge is hovered, since a portaled
  // element loses the CSS-relative positioning it would otherwise get from
  // sitting inside this `relative` div.
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const totalCount = categories.reduce((sum, c) => sum + c.count, 0) || 1;
  const gapLen = categories.length > 1 ? 3 : 0;

  const largestCategory = categories.reduce((max, c) => (c.count > max.count ? c : max), categories[0]);
  const hoveredCategory = categories.find(c => c.label === hoveredLabel);
  const activeCategory = hoveredCategory ?? largestCategory;
  const activePct = Math.round((activeCategory.count / totalCount) * 100);
  const MAX_ITEMS_SHOWN = 8;

  useLayoutEffect(() => {
    if (!hoveredLabel || !containerRef.current) {
      setPopoverPos(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setPopoverPos({ top: rect.top, left: rect.left + rect.width / 2 });
  }, [hoveredLabel]);

  const rawLens = categories.map(c => (c.count / totalCount) * circumference);
  const arcs = categories.map((c, i) => {
    const rawLen = rawLens[i];
    const segLen = Math.max(rawLen - gapLen, 0);
    const startOffset = rawLens.slice(0, i).reduce((sum, len) => sum + len, 0);
    const isActive = c.label === activeCategory.label;
    return (
      <circle
        key={c.label}
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={c.color}
        strokeWidth={strokeWidth}
        strokeOpacity={isActive ? 1 : 0.25}
        strokeDasharray={`${segLen} ${circumference}`}
        strokeDashoffset={-startOffset}
        onMouseEnter={() => setHoveredLabel(c.label)}
        onMouseLeave={() => setHoveredLabel(null)}
        style={{ transition: `stroke-opacity var(--tm-dur-slow) var(--tm-ease)`, cursor: 'pointer' }}
      >
        <title>{`${c.label}: ${formatValue(c.count)} (${Math.round((c.count / totalCount) * 100)}%)`}</title>
      </circle>
    );
  });

  return (
    <div ref={containerRef} className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--tm-surface-raised)" strokeWidth={strokeWidth} />
        {arcs}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
        <span
          className="font-bold leading-none transition-colors"
          style={{
            color: activeCategory.color,
            fontSize: `${Math.max(size * 0.19, 11)}px`,
            transitionDuration: 'var(--tm-dur-slow)',
            transitionTimingFunction: 'var(--tm-ease)',
          }}
        >
          {activePct}%
        </span>
        {/* Capped to the ring's inner hole (size - 2*strokeWidth), not just
            the square container, so a long note title truncates before it
            reaches the arc instead of visually overlapping it. */}
        <span
          className="text-text-muted mt-0.5 truncate text-center"
          style={{ fontSize: `${Math.max(size * 0.09, 9)}px`, maxWidth: `${Math.max(size - strokeWidth * 2 - 8, size * 0.4)}px` }}
          title={activeCategory.label}
        >
          {activeCategory.label}
        </span>
      </div>
      {hoveredCategory && hoveredCategory.items && hoveredCategory.items.length > 0 && popoverPos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed w-max max-w-[13rem] rounded-md border shadow-lg p-2 pointer-events-none"
          style={{
            top: popoverPos.top,
            left: popoverPos.left,
            transform: 'translate(-50%, calc(-100% - 0.5rem))',
            zIndex: MODAL_LAYER.elevated,
            backgroundColor: 'var(--tm-surface-raised)',
            borderColor: 'var(--tm-border)',
          }}
        >
          <p className="text-[11px] font-semibold mb-1 truncate" style={{ color: hoveredCategory.color }}>
            {hoveredCategory.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {hoveredCategory.items.slice(0, MAX_ITEMS_SHOWN).map((title, i) => (
              <li key={i} className="text-[11px] text-text-secondary truncate">
                {title}
              </li>
            ))}
          </ul>
          {hoveredCategory.items.length > MAX_ITEMS_SHOWN && (
            <p className="text-[11px] text-text-muted italic mt-0.5">
              +{hoveredCategory.items.length - MAX_ITEMS_SHOWN} more
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

interface CategoryCountProps {
  count: number;
  pct: number;
}

// The label width shared by every category row (CategoryBarChart and
// TagPriorityChart alike) — kept narrow so the row's other two columns (the
// bar and the count) have more room to work with.
export const CATEGORY_LABEL_WIDTH = '4rem';

// Shared by CategoryBarChart, TagPriorityChart, and HoursLineChart — trims a
// trailing ".0" so whole-hour estimates ("2h") don't read as "2.0h".
export const formatHours = (hours: number): string => (Number.isInteger(hours) ? `${hours}` : hours.toFixed(1));

// Muted "Xh" badge appended after a category row's count — only rendered
// when at least one task in the category carries an estimate, since most
// tasks are expected to go without one ("if available").
const CategoryHours: React.FC<{ hours?: number }> = ({ hours }) => {
  if (!hours) return null;
  return (
    <span className="flex-shrink-0 text-right whitespace-nowrap text-xs sm:text-sm text-text-muted font-medium" style={{ width: '2.75rem' }}>
      {formatHours(hours)}h
    </span>
  );
};

// Right-aligned "N total hours" footer under a category list — sums every
// row's `hours` so the whole chart still answers "how much time total" even
// though estimates are optional per task/category.
const TotalHoursFooter: React.FC<{ categories: DonutCategory[] }> = ({ categories }) => {
  const totalHours = categories.reduce((sum, c) => sum + (c.hours ?? 0), 0);
  if (!totalHours) return null;
  return (
    <div className="flex items-baseline justify-end gap-1 pt-1 mt-0.5 border-t" style={{ borderColor: 'var(--tm-border)' }}>
      <span className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--tm-text-primary)' }}>{formatHours(totalHours)}h</span>
      <span className="text-xs sm:text-sm text-text-muted font-medium">total estimated</span>
    </div>
  );
};

// Inline "count (pct%)" pairing — bold count for the exact tally, a muted
// parenthesized percentage for its share of the chart's own total (the sum
// of every category's count, mirroring how CategoryDonut computes its own
// share). Both ride the app's standard caption scale (text-xs sm:text-sm,
// Stone/--tm-text-muted per DESIGN.md) rather than a one-off tiny size, so
// the percentage reads as easily as the count it's paired with.
export const CategoryCount: React.FC<CategoryCountProps> = ({ count, pct }) => (
  <span className="flex-shrink-0 text-right whitespace-nowrap" style={{ width: '4.5rem' }}>
    <span className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--tm-text-primary)' }}>{count}</span>
    <span className="text-xs sm:text-sm text-text-muted font-medium ml-1">({pct}%)</span>
  </span>
);

// Shown in place of the chart body when there's nothing to plot yet — shared
// by CategoryBarChart and TagPriorityChart so both read the same way empty.
const EmptyChartMessage: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-full text-center" style={{ minHeight: '5rem' }}>
    <p className="text-xs sm:text-sm text-text-muted italic">{message}</p>
  </div>
);

interface CategoryRowProps {
  category: DonutCategory;
  maxCount: number;
  sumCount: number;
  delayMs: number;
  // Ascending priority numbers for this category — when present (even if
  // empty), TagPriorityChart's badge row is rendered underneath the bar.
  priorities?: number[];
}

// One category's bar-chart row: label, fill track sized relative to the
// busiest category, exact count + share, optional hours badge, and — for
// TagPriorityChart — an optional row of priority badges underneath. Shared
// so CategoryBarChart and TagPriorityChart can never drift out of sync on
// what a row looks like.
const CategoryRow: React.FC<CategoryRowProps> = ({ category: c, maxCount, sumCount, delayMs, priorities }) => (
  <div className="flex flex-col gap-1 animate-fade-in" style={{ animationDelay: `${delayMs}ms` }}>
    <div className="flex items-center gap-2">
      <span
        className="text-xs sm:text-sm text-text-secondary truncate flex-shrink-0"
        style={{ width: CATEGORY_LABEL_WIDTH }}
        title={c.label}
      >
        {c.label}
      </span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-surface-raised)' }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.max((c.count / maxCount) * 100, 6)}%`,
            backgroundColor: c.color,
            transition: `width var(--tm-dur-slow) var(--tm-ease)`,
          }}
        />
      </div>
      <CategoryCount count={c.count} pct={Math.round((c.count / sumCount) * 100)} />
      <CategoryHours hours={c.hours} />
    </div>
    {priorities && priorities.length > 0 && (
      <div className="flex flex-wrap gap-1" style={{ paddingLeft: `calc(${CATEGORY_LABEL_WIDTH} + 0.5rem)` }}>
        {priorities.map(p => (
          <PriorityBadge key={p} priority={p} />
        ))}
      </div>
    )}
  </div>
);

interface CategoryBarChartProps {
  categories: DonutCategory[];
  total: number;
  totalLabel: string;
  emptyMessage: string;
}

// A flat-fill horizontal bar chart — one pill-ended track per category,
// filled relative to the busiest category, with its exact count and share of
// the total alongside — used by the Priority/Active/Completed carousel
// slides so each reads as a scannable per-category breakdown (plus the grand
// total) rather than a donut's relative share.
export const CategoryBarChart: React.FC<CategoryBarChartProps> = ({ categories, total, totalLabel, emptyMessage }) => {
  if (categories.length === 0) return <EmptyChartMessage message={emptyMessage} />;

  const maxCount = Math.max(...categories.map(c => c.count));
  const sumCount = categories.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--tm-text-primary)' }}>
          {total}
        </span>
        <span className="text-xs sm:text-sm text-text-muted font-medium">{totalLabel}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {categories.map((c, i) => (
          <CategoryRow key={c.label} category={c} maxCount={maxCount} sumCount={sumCount} delayMs={i * 35} />
        ))}
      </div>
      <TotalHoursFooter categories={categories} />
    </div>
  );
};

// ── Hours-per-week line chart ─────────────────────────────────────────────────

interface DayHoursPoint {
  date: Date;
  hours: number;
  isToday: boolean;
}

interface HoursLineChartProps {
  days: DayHoursPoint[]; // seven entries, Monday through Sunday
  rangeLabel: string;
}

// A flat-fill line chart — one dot per day, its height driven by that day's
// summed estimated_time across every task due that day — plotted over the
// current Monday–Sunday week so scheduled workload reads as a trend rather
// than a single snapshot number. The plot itself is the shared TrendLineChart
// (see components/charts/TrendLineChart.tsx); this just adds the "N hrs
// scheduled (range)" header specific to the Tasks card.
export const HoursLineChart: React.FC<HoursLineChartProps> = ({ days, rangeLabel }) => {
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);

  const header = (
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--tm-text-primary)' }}>
        {formatHours(totalHours)}
      </span>
      <span className="text-xs sm:text-sm text-text-muted font-medium">hrs scheduled ({rangeLabel})</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      {header}
      <TrendLineChart days={days} svgClassName="w-3/4 h-auto mx-auto" />
    </div>
  );
};

// ── Priority badges + tag×priority bar chart ─────────────────────────────────

interface PriorityBadgeProps {
  priority: number;
}

// A compact read-only pill in the same getPriorityStyle ramp PriorityPicker
// uses for its live badge — so a priority number reads identically here as it
// does on the task itself, just without the click-to-edit affordance.
const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  const style = getPriorityStyle(priority);
  return (
    <span
      className="inline-flex items-center justify-center font-bold rounded-full flex-shrink-0"
      style={{ backgroundColor: style.bg, color: style.text, padding: '0.05rem 0.4rem', fontSize: '10px', lineHeight: 1.4 }}
      title={`Priority ${priority}`}
    >
      P{priority}
    </span>
  );
};

export interface TagPriorityCategory extends DonutCategory {
  priorities: number[]; // ascending — most urgent (lowest number) first
}

interface TagPriorityChartProps {
  categories: TagPriorityCategory[];
  total: number;
  totalLabel: string;
  emptyMessage: string;
}

// Like CategoryBarChart, but each tag's bar can carry a second line of small
// priority badges underneath — one per prioritized task in that tag, most
// urgent first — so a single view answers both "how many tasks per tag" (the
// bar) and "which of them are prioritized, at what rank" (the badges).
export const TagPriorityChart: React.FC<TagPriorityChartProps> = ({ categories, total, totalLabel, emptyMessage }) => {
  if (categories.length === 0) return <EmptyChartMessage message={emptyMessage} />;

  const maxCount = Math.max(...categories.map(c => c.count));
  const sumCount = categories.reduce((sum, c) => sum + c.count, 0) || 1;

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl sm:text-3xl font-bold leading-none" style={{ color: 'var(--tm-text-primary)' }}>
          {total}
        </span>
        <span className="text-xs sm:text-sm text-text-muted font-medium">{totalLabel}</span>
      </div>
      <div className="flex flex-col gap-2">
        {categories.map((c, i) => (
          <CategoryRow key={c.label} category={c} maxCount={maxCount} sumCount={sumCount} delayMs={i * 35} priorities={c.priorities} />
        ))}
      </div>
      <TotalHoursFooter categories={categories} />
    </div>
  );
};
