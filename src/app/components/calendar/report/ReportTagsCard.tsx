'use client';

import React, { useState } from 'react';
import { Sparkles, Tag, Tags } from 'lucide-react';
import { CardShell } from '@/app/components/stats/CardShell';
import type { CalendarActivity } from '@/app/types/activity';
import type { MoodCheckin } from '@/app/types/mood';
import type { ReportPeriod } from '@/app/utils/calendarReport';
import ReportCheckinTags from './ReportCheckinTags';
import ReportTagFeelings from './ReportTagFeelings';

export type TagSource = 'mine' | 'checkin';

const SOURCES: { value: TagSource; label: string; icon: React.ReactNode }[] = [
  { value: 'mine', label: 'Your task & note tags', icon: <Tag className="w-3.5 h-3.5" aria-hidden="true" /> },
  { value: 'checkin', label: 'Moments', icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> },
];

interface ReportTagsCardProps {
  activity: CalendarActivity;
  byDay: Map<string, MoodCheckin>;
  period: ReportPeriod;
  scopeLabel: string;
  restDays: number[];
  /** Average mood over the period, for the Moments' "your usual"; null without a daily check-in. */
  average: number | null;
  /** Daily check-ins behind that average. */
  logged: number;
  widen?: { label: string; onClick: () => void };
  /** A full-width card rather than Patterns' side column. */
  wide: boolean;
  headerAction?: React.ReactNode;
}

/**
 * A week's Mood › Patterns card, "Tags & moments": a switch in place swaps
 * "Your task & note tags" (how you felt on days you worked on each of your own tags)
 * and "Moments" (how mood went on days with each moment picked when checking
 * in). A month or year shows ReportPatterns instead.
 */
const ReportTagsCard: React.FC<ReportTagsCardProps> = ({ activity, byDay, period, scopeLabel, restDays, average, logged, widen, wide, headerAction }) => {
  const [source, setSource] = useState<TagSource>('mine');
  return (
    <CardShell icon={<Tags className="w-4 h-4" style={{ color: 'var(--tm-accent)' }} />} header={<span className="whitespace-nowrap">Tags &amp; moments</span>} headerAction={headerAction}>
      <div className={`flex p-0.5 rounded-lg bg-surface border border-border ${wide ? 'sm:self-start sm:min-w-[26rem]' : ''}`} role="tablist" aria-label="Tags or moments to show">
        {SOURCES.map(s => (
          <button
            key={s.value}
            type="button"
            role="tab"
            aria-selected={source === s.value}
            onClick={() => setSource(s.value)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
              source === s.value ? 'bg-accent-subtle text-accent shadow-sm font-semibold' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {s.icon}
            {s.label}
          </button>
        ))}
      </div>
      <p className="-mt-1 text-xs text-text-muted [@media(max-height:760px)]:hidden">
        {source === 'mine' ? 'How you felt on days you worked on each tag' : 'Moments you picked when checking in'}
      </p>
      {source === 'mine' ? (
        <ReportTagFeelings activity={activity} byDay={byDay} period={period} scopeLabel={scopeLabel} restDays={restDays} widen={widen} wide={wide} />
      ) : (
        <ReportCheckinTags byDay={byDay} period={period} average={average} logged={logged} scopeLabel={scopeLabel} />
      )}
    </CardShell>
  );
};

export default ReportTagsCard;
