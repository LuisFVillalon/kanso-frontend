'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, CircleCheck, FileText, Repeat, Tag as TagIcon } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import { formatHours } from '@/app/components/stats/charts';
import type { CalendarActivity } from '@/app/types/activity';
import { formatDurationShort, parseLocalDate, toLocalDateStr } from '@/app/utils/dateUtils';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import {
  buildTagBreakdown,
  collectTagItems,
  TAG_ITEM_KINDS,
  UNTAGGED_KEY,
  type TagBreakdown,
  type TagItemKind,
  type TagMeasure,
  type TagRow,
  type TagShare,
} from '@/app/utils/tagReport';

const KIND_LABEL: Record<TagItemKind, string> = { task: 'Tasks', note: 'Notes', habit: 'Habits' };
const KIND_ICON: Record<TagItemKind, React.FC<{ className?: string; 'aria-hidden'?: boolean }>> = {
  task: CircleCheck,
  note: FileText,
  habit: Repeat,
};
/** How strongly each kind's part of a row's bar shows its tag color: tasks solid, habits faintest. */
const KIND_TINT: Record<TagItemKind, number> = { task: 100, note: 62, habit: 34 };
const ITEMS_SHOWN = 6;

export const rowColor = (row: TagRow): string =>
  row.key === UNTAGGED_KEY ? 'var(--tm-border-strong)' : row.color ?? (row.foldedKeys ? 'var(--tm-pencil)' : 'var(--tm-accent)');
const tint = (color: string, amount: number) => `color-mix(in srgb, ${color} ${amount}%, var(--tm-surface))`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const trim = (n: number) => String(Math.round(n * 10) / 10);

/** "40m" under an hour, "2.5h" under ten, "12h" beyond. */
export const formatTagHours = (hours: number): string => {
  if (hours <= 0) return '0h';
  if (hours < 1) return formatDurationShort(hours * 3600);
  return `${hours < 10 ? formatHours(Math.round(hours * 10) / 10) : Math.round(hours)}h`;
};

const formatValue = (value: number, measure: TagMeasure) => (measure === 'time' ? formatTagHours(value) : trim(value));
const percent = (value: number, total: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

const kindCount = (kind: TagItemKind, n: number) =>
  kind === 'task' ? plural(n, 'task') : kind === 'note' ? plural(n, 'note') : plural(n, 'check-in');

const periodWord = (period: ReportPeriod) => (period.kind === 'year' ? `in ${period.start.getFullYear()}` : `this ${period.kind}`);

// ── Pieces ──────────────────────────────────────────────────────────────────

const Swatch: React.FC<{ color: string; size?: string }> = ({ color, size = 'w-2.5 h-2.5' }) => (
  <span className={`${size} rounded-[3px] flex-shrink-0`} style={{ backgroundColor: color }} aria-hidden="true" />
);

const KindSplit: React.FC<{ row: TagRow; measure: TagMeasure }> = ({ row, measure }) => (
  <span className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] sm:text-xs text-text-muted">
    {TAG_ITEM_KINDS.filter(k => row.byKind[k] > 0).map(k => {
      const Icon = KIND_ICON[k];
      return (
        <span key={k} className="inline-flex items-center gap-1">
          <Icon className="w-3 h-3" aria-hidden />
          {measure === 'time' && `${formatTagHours(row.byKind[k])} · `}
          {kindCount(k, row.counts[k])}
        </span>
      );
    })}
  </span>
);

interface OverviewProps {
  breakdown: TagBreakdown;
  measure: TagMeasure;
  kinds: Record<TagItemKind, boolean>;
  period: ReportPeriod;
  onOpen: (key: string) => void;
}

const Overview: React.FC<OverviewProps> = ({ breakdown, measure, kinds, period, onOpen }) => {
  const { rows, total } = breakdown;
  const top = rows.find(r => r.key !== UNTAGGED_KEY && !r.foldedKeys);
  const max = Math.max(...rows.map(r => r.total));
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 m-0">
        <span className="font-display text-2xl sm:text-3xl text-text-primary">{formatValue(total, measure)}</span>
        <span className="text-xs sm:text-sm text-text-secondary">
          {measure === 'time' ? 'estimated and tracked' : 'things done'} {periodWord(period)}
          {top && (
            <>
              {' · most went to '}
              <span className="font-semibold text-text-primary">{top.name}</span> ({percent(top.total, total)}%)
            </>
          )}
        </span>
      </p>

      <div className="flex h-3.5 rounded-full overflow-hidden gap-0.5" role="group" aria-label="Share of each tag">
        {rows.map(row => (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpen(row.key)}
            className="min-w-[3px] p-0 border-0 cursor-pointer hover:brightness-110 focus-visible:outline-none focus-visible:brightness-110"
            style={{ flex: `${row.total} 1 0`, backgroundColor: rowColor(row) }}
            aria-label={`${row.name}: ${percent(row.total, total)}%`}
            title={`${row.name} · ${formatValue(row.total, measure)} · ${percent(row.total, total)}%`}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-text-muted">
        {TAG_ITEM_KINDS.filter(k => kinds[k]).map(k => (
          <span key={k} className="inline-flex items-center gap-1.5" aria-hidden="true">
            <span className="w-3.5 h-2 rounded-sm" style={{ backgroundColor: tint('var(--tm-text-secondary)', KIND_TINT[k]) }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="ml-auto">Tap a tag to see its tasks, notes and habits.</span>
      </div>

      <ul className="flex flex-col gap-0.5 m-0 p-0 list-none">
        {rows.map(row => {
          const color = rowColor(row);
          const pct = percent(row.total, total);
          return (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onOpen(row.key)}
                aria-label={`${row.name}, ${formatValue(row.total, measure)}, ${pct}%. Show its items`}
                className="w-full text-left grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(7rem,11rem)_1fr_11rem] items-center gap-x-3.5 gap-y-1 p-2 rounded-lg hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-accent)]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Swatch color={color} />
                  <span className={`text-sm font-medium truncate pr-0.5 ${row.key === UNTAGGED_KEY ? 'italic text-text-secondary' : 'text-text-primary'}`}>
                    {row.name}
                  </span>
                </span>
                <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto flex flex-col gap-1 min-w-0">
                  <span className="block h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--tm-border-subtle)' }}>
                    <span className="flex h-full rounded-full overflow-hidden" style={{ width: `${Math.max((row.total / max) * 100, 3)}%` }}>
                      {TAG_ITEM_KINDS.filter(k => row.byKind[k] > 0).map(k => (
                        <span key={k} className="block h-full" style={{ width: `${(row.byKind[k] / row.total) * 100}%`, backgroundColor: tint(color, KIND_TINT[k]) }} />
                      ))}
                    </span>
                  </span>
                  <KindSplit row={row} measure={measure} />
                </span>
                <span className="text-right whitespace-nowrap">
                  <span className="text-sm sm:text-base font-bold text-text-primary">{formatValue(row.total, measure)}</span>
                  <span className="text-xs text-text-muted ml-1.5">{pct}%</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};

const shortDate = (dateStr: string) => parseLocalDate(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

const ShareItem: React.FC<{ share: TagShare; row: TagRow; measure: TagMeasure }> = ({ share, row, measure }) => {
  const { item, value } = share;
  const meta: string[] = [];
  if (item.kind === 'task') {
    if (item.completedOn) meta.push(`Done ${shortDate(item.completedOn)}`);
    meta.push(item.missingEstimates ? 'no estimate' : `est. ${formatTagHours(item.hours)}`);
  } else if (item.kind === 'note') {
    meta.push(plural(item.occurrences, 'session'), `${formatTagHours(item.hours)} editing`);
  } else {
    meta.push(plural(item.occurrences, 'check-in'), item.hoursEach != null ? `${formatTagHours(item.hoursEach)} each` : 'no estimate');
  }
  // Tags this item shares its value with, besides the row's own.
  const others = item.tags.filter(t => `tag:${t.id}` !== row.key);
  return (
    <li className="grid grid-cols-[1fr_auto] gap-x-2.5 gap-y-0.5 px-2.5 py-2 rounded-md border border-border-subtle bg-surface-raised">
      <span className="text-sm font-medium text-text-primary truncate" title={item.title}>{item.title}</span>
      <span className="text-sm font-bold text-text-primary text-right whitespace-nowrap">
        {measure === 'time' && value === 0 ? '—' : formatValue(value, measure)}
      </span>
      <span className="col-span-2 flex flex-wrap items-center gap-1.5 text-[11px] text-text-muted">
        {meta.join(' · ')}
        {others.length > 0 && (
          <>
            <span>· {row.foldedKeys ? 'tagged' : `split 1/${item.tags.length} with`}</span>
            {others.map(t => (
              <span
                key={t.id}
                className="inline-flex px-1.5 rounded-full text-[10.5px] font-bold leading-[17px] text-text-primary"
                style={{ backgroundColor: tint(t.color ?? 'var(--tm-accent)', 22) }}
              >
                {t.name}
              </span>
            ))}
          </>
        )}
      </span>
    </li>
  );
};

interface DetailProps {
  row: TagRow;
  total: number;
  measure: TagMeasure;
  kinds: Record<TagItemKind, boolean>;
  period: ReportPeriod;
  onBack: () => void;
}

const Detail: React.FC<DetailProps> = ({ row, total, measure, kinds, period, onBack }) => {
  const [showAll, setShowAll] = useState<Partial<Record<TagItemKind, boolean>>>({});
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => backRef.current?.focus(), []);
  const color = rowColor(row);
  return (
    <>
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className="self-start inline-flex items-center gap-1 pl-0.5 pr-2 py-1 rounded-md text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-surface-raised"
      >
        <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
        All tags
      </button>
      <h3 className={`flex items-center gap-2.5 m-0 font-display text-xl text-text-primary ${row.key === UNTAGGED_KEY ? 'italic' : ''}`}>
        <Swatch color={color} size="w-3.5 h-3.5" />
        {row.name}
      </h3>
      <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 m-0">
        <span className="font-display text-2xl sm:text-3xl text-text-primary">{formatValue(row.total, measure)}</span>
        <span className="text-xs sm:text-sm text-text-secondary">
          {percent(row.total, total)}% of your {measure === 'time' ? 'time' : 'things done'} {periodWord(period)}
        </span>
      </p>
      {row.key === UNTAGGED_KEY && (
        <p className="m-0 text-xs text-text-secondary rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--tm-accent-subtle)' }}>
          These have no tags. Tag a task, note or habit and its time moves to that tag here, for past periods too.
        </p>
      )}
      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {TAG_ITEM_KINDS.map(k => {
          const Icon = KIND_ICON[k];
          return (
            <div key={k} className="rounded-lg border border-border-subtle bg-surface-raised px-2.5 py-2 min-w-0">
              <div className="flex items-center gap-1 text-xs font-semibold text-text-secondary">
                <Icon className="w-3 h-3" aria-hidden />
                {KIND_LABEL[k]}
              </div>
              <div className="text-base sm:text-lg font-bold text-text-primary">{kinds[k] ? formatValue(row.byKind[k], measure) : '—'}</div>
              <div className="text-[11px] text-text-muted">{kinds[k] ? kindCount(k, row.counts[k]) : 'hidden'}</div>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TAG_ITEM_KINDS.filter(k => kinds[k]).map(k => {
          const Icon = KIND_ICON[k];
          const shares = row.shares
            .filter(s => s.item.kind === k)
            .sort((a, b) => b.value - a.value || a.item.title.localeCompare(b.item.title));
          const shown = showAll[k] ? shares : shares.slice(0, ITEMS_SHOWN);
          return (
            <section key={k} aria-label={KIND_LABEL[k]} className="min-w-0">
              <h4 className="flex items-center gap-1.5 m-0 mb-1.5 text-xs font-medium uppercase tracking-wide text-text-muted">
                <Icon className="w-3 h-3" aria-hidden />
                {KIND_LABEL[k]}
              </h4>
              {shares.length === 0 ? (
                <p className="m-0 text-xs sm:text-sm text-text-muted italic">None {periodWord(period)}.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-1 m-0 p-0 list-none">
                    {shown.map(s => <ShareItem key={`${s.item.kind}:${s.item.id}`} share={s} row={row} measure={measure} />)}
                  </ul>
                  {shares.length > ITEMS_SHOWN && (
                    <button
                      type="button"
                      onClick={() => setShowAll(prev => ({ ...prev, [k]: !prev[k] }))}
                      className="mt-1 text-xs font-medium text-[var(--tm-accent)] hover:underline"
                    >
                      {showAll[k] ? 'Show fewer' : `Show all ${shares.length}`}
                    </button>
                  )}
                </>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
};

// ── Card ────────────────────────────────────────────────────────────────────

interface ReportTagBreakdownProps {
  period: ReportPeriod;
  activity: CalendarActivity;
}

/**
 * "Where your time went": how much of the period each tag took, from completed
 * tasks, time in notes and habit check-ins, as a share bar over one row per
 * tag. Time (estimates plus note editing time) or Count, with Tasks / Notes /
 * Habits switched on or off; a row opens the tag's items.
 */
const ReportTagBreakdown: React.FC<ReportTagBreakdownProps> = ({ period, activity }) => {
  const [measure, setMeasure] = useState<TagMeasure>('time');
  const [kinds, setKinds] = useState<Record<TagItemKind, boolean>>({ task: true, note: true, habit: true });
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  const [open, setOpen] = useState<{ periodKey: string; key: string } | null>(null);

  const items = useMemo(
    () => collectTagItems(activity, period.start, period.end),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey],
  );
  const breakdown = useMemo(() => buildTagBreakdown(items, measure, kinds), [items, measure, kinds]);

  const openKey = open?.periodKey === periodKey ? open.key : null;
  const openRow = openKey ? breakdown.rows.find(r => r.key === openKey) ?? null : null;

  const toggleKind = (kind: TagItemKind) =>
    setKinds(prev => {
      // Keep at least one kind on.
      if (prev[kind] && TAG_ITEM_KINDS.filter(k => prev[k]).length === 1) return prev;
      return { ...prev, [kind]: !prev[kind] };
    });

  return (
    <section
      aria-label="Where your time went"
      onKeyDown={e => {
        if (e.key === 'Escape' && openKey) setOpen(null);
      }}
    >
      <CardShell icon={<TagIcon className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header="Where your time went">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface border border-border" role="group" aria-label="Measure">
            {(['time', 'count'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMeasure(m)}
                aria-pressed={measure === m}
                title={m === 'time'
                  ? 'Task and habit estimates, plus time spent editing notes'
                  : 'Tasks completed, notes worked on and habit check-ins'}
                className={`px-2 sm:px-2.5 py-1 rounded-md text-xs sm:text-sm font-medium transition-colors ${
                  measure === m ? 'bg-surface-raised text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {m === 'time' ? 'Time' : 'Count'}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Include">
            {TAG_ITEM_KINDS.map(k => {
              const Icon = KIND_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  aria-pressed={kinds[k]}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                    kinds[k] ? 'border-border-strong bg-surface-raised text-text-primary' : 'border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  <Icon className="w-3 h-3" aria-hidden />
                  {KIND_LABEL[k]}
                </button>
              );
            })}
          </div>
        </div>

        {openKey ? (
          openRow ? (
            <Detail
              key={openKey}
              row={openRow}
              total={breakdown.total}
              measure={measure}
              kinds={kinds}
              period={period}
              onBack={() => setOpen(null)}
            />
          ) : (
            <p className="m-0 text-xs sm:text-sm text-text-muted italic">
              Nothing here with these filters.{' '}
              <button type="button" onClick={() => setOpen(null)} className="not-italic font-medium text-[var(--tm-accent)] hover:underline">
                Back to all tags
              </button>
            </p>
          )
        ) : breakdown.total > 0 ? (
          <Overview
            breakdown={breakdown}
            measure={measure}
            kinds={kinds}
            period={period}
            onOpen={key => setOpen({ periodKey, key })}
          />
        ) : (
          <p className="m-0 text-xs sm:text-sm text-text-muted italic py-2">
            {measure === 'time'
              ? 'No estimated or tracked time to break down yet.'
              : 'Nothing done yet to break down.'}
          </p>
        )}
      </CardShell>
    </section>
  );
};

// ── Share bar ───────────────────────────────────────────────────────────────

const ALL_KINDS: Record<TagItemKind, boolean> = { task: true, note: true, habit: true };

interface ReportTagShareBarProps {
  period: ReportPeriod;
  activity: CalendarActivity;
  /** Opens the full "Where your time went" card. */
  onOpen: () => void;
}

/**
 * The report Overview's one-line "Where your time went": the period's time
 * as a share bar, with each tag's share under it. The whole card opens the
 * full breakdown.
 */
export const ReportTagShareBar: React.FC<ReportTagShareBarProps> = ({ period, activity, onOpen }) => {
  const periodKey = `${period.kind}:${toLocalDateStr(period.start)}`;
  const breakdown = useMemo(
    () => buildTagBreakdown(collectTagItems(activity, period.start, period.end), 'time', ALL_KINDS),
    // `periodKey` identifies the period; its Date objects change identity every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity, periodKey],
  );
  const { rows, total } = breakdown;
  const top = rows.find(r => r.key !== UNTAGGED_KEY && !r.foldedKeys);
  const summary = total > 0
    ? `${formatTagHours(total)} estimated and tracked ${periodWord(period)}${top ? `, most went to ${top.name} (${percent(top.total, total)}%)` : ''}`
    : 'No estimated or tracked time to break down yet';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Where your time went: ${summary}. Show by tag`}
      className="card-glass w-full text-left p-3 sm:p-4 flex flex-col gap-2 hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-accent)]"
    >
      <span className="flex items-center gap-1.5">
        <TagIcon className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} aria-hidden />
        <span className="text-xs sm:text-sm md:text-base text-text-muted font-medium uppercase tracking-wide">Where your time went</span>
        <ChevronRight className="w-4 h-4 ml-auto text-text-muted" aria-hidden />
      </span>
      {total > 0 ? (
        <>
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-lg font-bold text-text-primary">{formatTagHours(total)}</span>
            <span className="text-xs text-text-secondary">
              estimated and tracked {periodWord(period)}
              {top && (
                <>
                  {' · most went to '}
                  <span className="font-semibold text-text-primary">{top.name}</span> ({percent(top.total, total)}%)
                </>
              )}
            </span>
          </span>
          <span className="flex h-3 rounded-full overflow-hidden gap-0.5" aria-hidden="true">
            {rows.map(row => (
              <span key={row.key} className="min-w-[3px]" style={{ flex: `${row.total} 1 0`, backgroundColor: rowColor(row) }} />
            ))}
          </span>
          <span className="flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] sm:text-xs text-text-secondary" aria-hidden="true">
            {rows.map(row => (
              <span key={row.key} className="inline-flex items-center gap-1.5">
                <Swatch color={rowColor(row)} size="w-2 h-2" />
                <span className={row.key === UNTAGGED_KEY ? 'italic' : ''}>{row.name}</span>
                <span className="font-semibold text-text-primary">{percent(row.total, total)}%</span>
              </span>
            ))}
          </span>
        </>
      ) : (
        <span className="text-xs sm:text-sm text-text-muted italic">{summary}.</span>
      )}
    </button>
  );
};

export default ReportTagBreakdown;
