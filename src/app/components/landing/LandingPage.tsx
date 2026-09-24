'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight, BookOpenText, Check, Flame, LayoutDashboard, ListTodo,
  Loader2, ShieldCheck, Sparkles, Sunrise,
} from 'lucide-react';
import { useAuth } from '@/app/context/AuthContext';

const GITHUB = 'https://github.com/LuisFVillalon';

const FEATURES = [
  {
    icon: ListTodo,
    title: 'Tasks that fit your day',
    body: 'Due dates and times, priorities, tags and time estimates, with a calendar that shows the whole term at a glance.',
  },
  {
    icon: BookOpenText,
    title: 'Notes worth keeping',
    body: 'A rich-text editor with tables, highlights, images and PDF export. Editing time is tracked per note.',
  },
  {
    icon: Sparkles,
    title: 'Learn more from a note',
    body: 'An LLM reads a note and plans searches; real links are then filtered, checked and ranked without the model picking them.',
  },
  {
    icon: Flame,
    title: 'Habits and streaks',
    body: 'Daily check-ins, streaks and a history view, computed on your local calendar day rather than the server clock.',
  },
  {
    icon: Sunrise,
    title: 'A daily debrief',
    body: "What's overdue, what's due today, whether today's plan fits your available hours, and what to focus on next.",
  },
  {
    icon: LayoutDashboard,
    title: 'Make it yours',
    body: 'Drag-and-drop dashboard widgets, accent colors, notebook page styles, a focus mode and a doodle canvas.',
  },
];

const STACK = [
  {
    name: 'Web app',
    repo: 'kanso-frontend',
    items: ['Next.js 16 · React 19 · TypeScript', 'Tailwind CSS v4 · Tiptap editor', 'Deployed on Vercel'],
  },
  {
    name: 'API',
    repo: 'kanso-backend',
    items: ['FastAPI · SQLAlchemy 2 · Alembic', 'Postgres on Supabase', 'Deployed on Fly.io'],
  },
  {
    name: 'AI service',
    repo: 'kanso-ai',
    items: ['FastAPI · OpenAI or Gemini', 'DuckDuckGo search + link checks', 'Deployed on Fly.io'],
  },
];

const DETAILS = [
  'Supabase Auth JWTs verified on every request (ES256 via JWKS)',
  'Every query scoped to the signed-in user; the database is closed to direct client access',
  'Each demo visitor gets a private sandbox that cleans itself up after a day',
];

/** A static, simplified picture of the dashboard for the hero. */
function ProductMockup() {
  const tasks = [
    { title: 'Data structures problem set 4', tag: 'School', color: '#8b5cf6', due: 'Today 11:59 PM', done: false },
    { title: 'Team standup notes', tag: 'Work', color: '#3b82f6', due: 'Today 9:30 AM', done: true },
    { title: 'Review BST rotations for midterm', tag: 'School', color: '#8b5cf6', due: 'Tomorrow', done: false },
  ];
  return (
    <div className="rounded-xl p-4 sm:p-8" style={{ backgroundColor: '#FFB110' }}>
      <div
        className="rounded-lg overflow-hidden border"
        style={{ backgroundColor: 'var(--tm-surface)', borderColor: 'var(--tm-border)', boxShadow: 'var(--tm-shadow-product)' }}
      >
        <div className="flex items-center justify-between px-4 h-11 border-b" style={{ borderColor: 'var(--tm-border)' }}>
          <span className="text-sm font-semibold text-text-primary">Today</span>
          <span className="text-xs" style={{ color: 'var(--tm-text-muted)' }}>2 of 3 hours planned</span>
        </div>
        <ul className="divide-y" style={{ borderColor: 'var(--tm-border)' }}>
          {tasks.map(t => (
            <li key={t.title} className="flex items-center gap-3 px-4 py-3" style={{ borderColor: 'var(--tm-border-subtle)' }}>
              <span
                className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                style={t.done
                  ? { backgroundColor: 'var(--tm-accent)', borderColor: 'var(--tm-accent)' }
                  : { borderColor: 'var(--tm-wire)' }}
              >
                {t.done && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className={`flex-1 text-sm truncate ${t.done ? 'line-through' : ''}`}
                style={{ color: t.done ? 'var(--tm-text-muted)' : 'var(--tm-text-primary)' }}>
                {t.title}
              </span>
              <span className="chip hidden sm:inline-flex" style={{ backgroundColor: t.color, color: '#fff' }}>{t.tag}</span>
              <span className="text-xs whitespace-nowrap" style={{ color: 'var(--tm-text-muted)' }}>{t.due}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-3 px-4 py-3 border-t" style={{ borderColor: 'var(--tm-border)', backgroundColor: 'var(--tm-surface-raised)' }}>
          <Flame className="w-4 h-4" style={{ color: 'var(--tm-accent-2)' }} />
          <span className="text-sm text-text-primary">Morning meditation</span>
          <span className="ml-auto text-xs font-medium" style={{ color: 'var(--tm-text-secondary)' }}>10-day streak</span>
        </div>
      </div>
    </div>
  );
}

/** The signed-out home page: what kanso is, how it's built, and a one-click demo. */
export default function LandingPage() {
  const { startDemo, demoSeeding } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // On success the auth state changes and the home page swaps in the dashboard.
  const handleDemo = async () => {
    setError(null);
    const { error } = await startDemo();
    if (error) setError(error);
  };

  const demoButton = (
    <button type="button" onClick={handleDemo} disabled={demoSeeding}
      className="btn btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
      {demoSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
      {demoSeeding ? 'Setting up your demo…' : 'Try the demo, no signup'}
    </button>
  );

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--tm-bg)' }}>
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <span className="font-bold text-lg tracking-tight text-text-primary">kanso</span>
        <nav className="flex items-center gap-1">
          <Link href="/login" className="btn btn-outline border-transparent">Sign in</Link>
          <Link href="/signup" className="btn btn-secondary">Create account</Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="pt-12 sm:pt-20 pb-16 text-center">
          <h1 className="font-medium text-text-primary text-4xl sm:text-6xl leading-[1.15] sm:leading-[1.15] tracking-[-0.03em] max-w-3xl mx-auto">
            Tasks, notes and habits in one{' '}
            <span className="inline-block rounded-full px-4 sm:px-6 py-1 sm:py-2" style={{ backgroundColor: '#FFB110', color: '#000' }}>
              calm
            </span>{' '}
            place.
          </h1>
          <p className="mt-6 text-base sm:text-lg max-w-xl mx-auto" style={{ color: 'var(--tm-text-secondary)' }}>
            kanso (<span lang="ja">簡素</span>, &ldquo;simplicity&rdquo;) plans your day, keeps your notes and tracks your
            streaks, then tells you what to focus on next.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {demoButton}
            <a href={`${GITHUB}/kanso-frontend`} target="_blank" rel="noreferrer" className="btn btn-outline">
              View the code
            </a>
          </div>
          <p className="mt-3 text-xs" style={{ color: 'var(--tm-text-muted)' }}>
            The demo is a private sandbox with sample data. Nothing you do there is shared.
          </p>
          {error && (
            <p role="alert" className="mt-4 text-sm rounded-md px-3 py-2 inline-block"
              style={{ color: 'var(--tm-danger)', backgroundColor: 'var(--tm-danger-subtle)' }}>
              {error}
            </p>
          )}
          <div className="mt-12 sm:mt-16 max-w-3xl mx-auto text-left">
            <ProductMockup />
          </div>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20" aria-labelledby="features-heading">
          <h2 id="features-heading" className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight text-center">
            Everything on your plate, in one view
          </h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6">
                <Icon className="w-5 h-5 mb-4" style={{ color: 'var(--tm-accent)' }} />
                <h3 className="text-base font-semibold text-text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--tm-text-secondary)' }}>{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Architecture ─────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20" aria-labelledby="stack-heading">
          <h2 id="stack-heading" className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight text-center">
            How it&apos;s built
          </h2>
          <p className="mt-3 text-center text-sm max-w-xl mx-auto" style={{ color: 'var(--tm-text-secondary)' }}>
            Three services, three repositories. The web app talks to the API for data and to the AI
            service for note recommendations; Supabase handles sign-in.
          </p>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {STACK.map(({ name, repo, items }) => (
              <div key={name} className="card p-6 flex flex-col">
                <h3 className="text-base font-semibold text-text-primary">{name}</h3>
                <ul className="mt-3 space-y-1.5 text-sm flex-1" style={{ color: 'var(--tm-text-secondary)' }}>
                  {items.map(item => <li key={item}>{item}</li>)}
                </ul>
                <a href={`${GITHUB}/${repo}`} target="_blank" rel="noreferrer"
                  className="mt-5 text-sm font-medium inline-flex items-center gap-1 hover:underline"
                  style={{ color: 'var(--tm-accent)' }}>
                  {repo} <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            ))}
          </div>
          <ul className="mt-6 grid gap-3 md:grid-cols-3">
            {DETAILS.map(d => (
              <li key={d} className="flex gap-2 text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
                <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--tm-success)' }} />
                {d}
              </li>
            ))}
          </ul>
        </section>

        {/* ── Closing CTA ──────────────────────────────────────────────────── */}
        <section className="py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-semibold text-text-primary tracking-tight">See it with real data</h2>
          <p className="mt-3 text-sm" style={{ color: 'var(--tm-text-secondary)' }}>
            One click opens a sandbox with tasks, notes and habit streaks already filled in.
          </p>
          <div className="mt-6 flex justify-center">{demoButton}</div>
        </section>
      </main>

      <footer className="border-t" style={{ borderColor: 'var(--tm-border)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row gap-3 items-center justify-between text-sm"
          style={{ color: 'var(--tm-text-muted)' }}>
          <span>Built by Luis Fernando Villalon</span>
          <a href={GITHUB} target="_blank" rel="noreferrer" className="hover:underline">github.com/LuisFVillalon</a>
        </div>
      </footer>
    </div>
  );
}
