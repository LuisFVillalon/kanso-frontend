import React from 'react';
import { Check, Flame } from 'lucide-react';

const TASKS = [
  { title: 'Finish the lab report', chip: 'Due today', chipClass: 'bg-accent-2-subtle text-accent-2', done: false },
  { title: 'Review lecture 6 notes', chip: 'Study', chipClass: 'bg-accent-subtle text-accent', done: false },
  { title: 'Email the project group', chip: 'Done', chipClass: 'bg-success-subtle text-success', done: true },
];

// One week of a habit streak: filled = logged.
const STREAK = [true, true, true, true, true, false, true];

/**
 * Decorative product preview for the auth split screen (lg and up). Static and
 * aria-hidden — sample content only, in the shape of the dashboard's daily
 * debrief, task list, habit streak and a tagged note.
 */
const AuthShowcase: React.FC = () => (
  <aside
    aria-hidden
    className="relative m-3 hidden overflow-hidden rounded-lg bg-sky-wash lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-16"
  >
    <p className="max-w-[440px] text-[32px] leading-[1.15] font-medium tracking-[-0.03em] text-midnight-ink">
      Plan the day, keep the notes, build the streak.
    </p>

    <div className="relative mt-10 w-full max-w-[400px]">
      {/* Sticky note peeking out from behind the notebook card; only where the panel is wide enough */}
      <div className="absolute top-12 left-[340px] hidden w-60 rotate-[4deg] rounded-lg bg-marigold py-4 pr-4 pl-[76px] text-black shadow-product min-[1360px]:block">
        <p className="text-xs font-medium uppercase tracking-[0.08em] opacity-70">Note</p>
        <p className="mt-1.5 font-semibold">Recursion, week 6</p>
        <p className="mt-1 text-sm leading-5 opacity-80">Base case first, then shrink the problem.</p>
        <span className="chip mt-3 bg-black/10 text-black">cs-310</span>
      </div>

      <div className="card relative overflow-hidden shadow-product">
        <div className="coil" />
        <div className="p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted">Daily debrief</span>
            <span className="chip bg-accent-subtle text-accent">2 due today</span>
          </div>
          <p className="mt-2 text-lg font-semibold tracking-tight text-text-primary">Start with the lab report.</p>
          <p className="text-sm text-text-secondary">It&apos;s due today and has been open the longest.</p>

          <ul className="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
            {TASKS.map(t => (
              <li key={t.title} className="flex items-center gap-3 py-2.5">
                <span
                  className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border ${
                    t.done ? 'border-success bg-success text-white' : 'border-[var(--tm-wire)]'
                  }`}
                >
                  {t.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className={`flex-1 text-sm ${t.done ? 'text-text-muted line-through' : 'text-text-primary'}`}>
                  {t.title}
                </span>
                <span className={`chip ${t.chipClass}`}>{t.chip}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex items-center gap-3">
            <Flame className="h-4 w-4 text-saffron" />
            <span className="flex-1 text-sm text-text-primary">Morning run</span>
            <span className="flex gap-1">
              {STREAK.map((on, i) => (
                <span key={i} className={`h-2.5 w-2.5 rounded-full ${on ? 'bg-marigold' : 'bg-surface-raised'}`} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  </aside>
);

export default AuthShowcase;
