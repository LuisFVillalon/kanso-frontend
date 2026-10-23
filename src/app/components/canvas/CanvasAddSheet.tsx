'use client';

import React, { useEffect, useRef, useState } from 'react';
import { GraduationCap, ListPlus, Loader2, Plus, Search, Sparkles, Tag as TagIcon, X } from 'lucide-react';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { THEME_ACCENT_COLORS } from '@/app/lib/theme';
import type { CanvasItem } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';
import { dueLabel } from '@/app/utils/canvas';
import { canvasClassTag } from '@/app/utils/canvasTasks';

/** The backend's longest tag name (TAG_NAME_MAX). */
const TAG_NAME_MAX = 50;

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A tag as a colored pill: a graduation cap marks a class's Canvas tag, a
 * dashed outline one that doesn't exist yet (id 0, created with the task),
 * and `onRemove` adds an ×.
 */
export const TagPill: React.FC<{ tag: Tag; small?: boolean; canvas?: boolean; onRemove?: () => void }> = ({
  tag, small = false, canvas = false, onRemove,
}) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full font-semibold text-white leading-snug ${small ? 'px-[7px] py-px text-[11px]' : 'px-2.5 py-[3px] text-xs'}`}
    style={{
      backgroundColor: tag.color,
      ...(tag.id === 0 ? { outline: '1.5px dashed rgba(255,255,255,.75)', outlineOffset: '-3px' } : {}),
    }}
    title={tag.id === 0 ? 'New tag: created when you add the task' : undefined}
  >
    {canvas && <GraduationCap className="w-3 h-3 shrink-0 opacity-90" aria-label="The class tag from Canvas" />}
    {tag.name}
    {onRemove && (
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${tag.name}`}
        className="-mr-1 w-4 h-4 rounded-full inline-flex items-center justify-center bg-white/25 hover:bg-white/40"
      >
        <X className="w-3 h-3" />
      </button>
    )}
  </span>
);

interface CanvasAddSheetProps {
  /** "add" adds `item` to tasks; "class" chooses the tags a class's tasks start with. */
  mode: 'add' | 'class';
  /** The item to add, in "add" mode. */
  item: CanvasItem | null;
  /** The class's name, which its Canvas tag is called; null for an item with no class. */
  classLabel: string | null;
  /** The user's tags. */
  tags: Tag[];
  /** The tags it opens with: the class's chosen ones, else its Canvas tag. */
  initial: Tag[];
  /** `initial` is the class's chosen tags. */
  fromDefaults: boolean;
  /** "Use these tags for every … task" can be offered: the item has a class. */
  canRemember: boolean;
  now: Date;
  onClose: () => void;
  /** Adds the item or saves the class's tags; the sheet stays open (and usable) until it resolves. */
  onConfirm: (tags: Tag[], remember: boolean) => Promise<void>;
}

/**
 * The tag picker that opens from Add to tasks (and from a class's "Tags for
 * tasks"), as a sheet over the Canvas panel. It starts with the class's tags
 * (its Canvas tag unless the user chose others), and lets the user remove
 * any, add their own, or create one with a color. Enter adds or creates the
 * typed tag, or with nothing typed confirms; Backspace removes the last tag;
 * Escape closes.
 */
const CanvasAddSheet: React.FC<CanvasAddSheetProps> = ({
  mode, item, classLabel, tags, initial, fromDefaults, canRemember, now, onClose, onConfirm,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<Tag[]>(initial);
  const [query, setQuery] = useState('');
  const [newColor, setNewColor] = useState(() => THEME_ACCENT_COLORS[(tags.length + 1) % THEME_ACCENT_COLORS.length].value);
  const [remember, setRemember] = useState(mode === 'class' || fromDefaults);
  const [busy, setBusy] = useState(false);

  useFocusTrap(sheetRef);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const label = classLabel ?? 'this class';
  const canvasTag = canvasClassTag(classLabel, tags);
  const q = query.trim().replace(/\s+/g, ' ');
  const isChosen = (name: string) => selected.some(t => sameName(t.name, name));
  const options = tags.filter(t => !isChosen(t.name) && (!q || t.name.toLowerCase().includes(q.toLowerCase())));
  const offerCanvasTag = !!canvasTag && canvasTag.id === 0 && !isChosen(canvasTag.name)
    && (!q || canvasTag.name.toLowerCase().includes(q.toLowerCase()));
  const exists = !!q && (tags.some(t => sameName(t.name, q)) || isChosen(q) || (!!canvasTag && sameName(canvasTag.name, q)));
  const empty = selected.length === 0;
  const isCanvas = (tag: Tag) => !!classLabel && sameName(tag.name, classLabel);

  const pick = (tag: Tag) => {
    setSelected(prev => [...prev, tag]);
    setQuery('');
    inputRef.current?.focus();
  };
  const create = () => {
    if (!q) return;
    pick({ id: 0, name: q.slice(0, TAG_NAME_MAX), color: newColor });
    const i = THEME_ACCENT_COLORS.findIndex(c => c.value === newColor);
    setNewColor(THEME_ACCENT_COLORS[(i + 1) % THEME_ACCENT_COLORS.length].value);
  };
  const remove = (tag: Tag) => {
    setSelected(prev => prev.filter(t => t !== tag));
    inputRef.current?.focus();
  };
  const confirm = async () => {
    if (busy || (mode === 'class' && empty)) return;
    setBusy(true);
    try {
      await onConfirm(selected, canRemember && remember);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!q) {
        void confirm();
        return;
      }
      const match = options.find(t => sameName(t.name, q));
      if (match) pick(match);
      else if (canvasTag && sameName(canvasTag.name, q) && !isChosen(q)) pick(canvasTag);
      else if (!exists) create();
      else setQuery('');
    } else if (e.key === 'Backspace' && !query && selected.length) {
      setSelected(prev => prev.slice(0, -1));
    }
  };

  let hint: React.ReactNode;
  if (fromDefaults && mode === 'add') {
    hint = <><Sparkles className="w-3 h-3 inline -mt-0.5" /> Your usual tags for {label}.</>;
  } else if (!canvasTag || !isChosen(canvasTag.name)) {
    hint = classLabel
      ? `No class tag from Canvas. ${mode === 'add' ? 'The task still shows' : 'Tasks still show'} “From Canvas · ${classLabel}”.`
      : null;
  } else {
    hint = <><GraduationCap className="w-3 h-3 inline -mt-0.5" /> marks the class tag from Canvas. {canvasTag.id === 0
      ? `It’s new: kanso creates it with the first ${mode === 'add' ? 'task you add' : 'task you add from this class'}.`
      : 'It’s already one of your tags.'}</>;
  }

  const title = mode === 'add' ? 'Add to tasks' : `Tags for ${label} tasks`;

  return (
    <div
      className="absolute inset-0 z-10"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}
    >
      <div className="absolute inset-0 animate-fade-in" style={{ backgroundColor: 'var(--tm-scrim)' }} onClick={onClose} aria-hidden />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 flex flex-col max-h-[88%] px-4 pt-3.5 pb-4 border-t border-border rounded-t-2xl rounded-b-xl bg-surface-raised"
        style={{ boxShadow: 'var(--tm-shadow-lg)' }}
      >
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-bold text-text-primary">{title}</h3>
            <p className="text-[12.5px] text-text-secondary mt-0.5">
              {mode === 'add' && item ? (
                <><b className="font-semibold text-text-primary">{item.title}</b>{classLabel && ` · ${classLabel}`}{item.due_at && ` · due ${dueLabel(item.due_at, now)}`}</>
              ) : (
                `Every ${label} task you add from Canvas starts with these tags. You can still change them each time.`
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="btn btn-ghost p-1 text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto mt-3 -mx-1 px-1">
          <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-text-secondary">
            <TagIcon className="w-3 h-3" />Tags
          </div>
          <div className="flex flex-wrap gap-1.5 min-h-[30px] p-2 rounded-[10px] border border-border bg-surface" data-testid="canvas-sheet-selected">
            {selected.length > 0
              ? selected.map(tag => <TagPill key={`${tag.id}-${tag.name}`} tag={tag} canvas={isCanvas(tag)} onRemove={() => remove(tag)} />)
              : <span className="px-0.5 py-[3px] text-xs text-text-muted">No tags. {mode === 'add' ? 'The task' : 'Each task'} will still say which class it&apos;s from.</span>}
          </div>
          {hint && <p className="mt-1.5 text-[11.5px] text-text-muted">{hint}</p>}

          <div className="flex items-center gap-1.5 mt-3 px-2.5 py-[7px] rounded-[9px] border border-border bg-surface focus-within:border-accent">
            <Search className="w-3.5 h-3.5 shrink-0 text-text-muted" aria-hidden />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              maxLength={TAG_NAME_MAX}
              placeholder="Add one of your tags or create one…"
              aria-label="Find or create a tag"
              autoComplete="off"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[13px] text-text-primary"
            />
          </div>

          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {offerCanvasTag && (
              <button type="button" onClick={() => pick(canvasTag!)} className={OPTION}>
                <GraduationCap className="w-3 h-3" />{canvasTag!.name}
                <span className="text-[11px] text-text-muted">from Canvas</span>
              </button>
            )}
            {options.map(tag => (
              <button key={tag.id} type="button" onClick={() => pick(tag)} className={OPTION}>
                <span aria-hidden className="w-[9px] h-[9px] rounded-full" style={{ backgroundColor: tag.color }} />
                {tag.name}
                {isCanvas(tag) && <GraduationCap className="w-3 h-3" aria-label="The class tag from Canvas" />}
              </button>
            ))}
            {q && !exists && (
              <button type="button" onClick={create} className={`${OPTION} border-dashed`} style={{ borderColor: 'var(--tm-accent)', color: 'var(--tm-accent)' }}>
                <Plus className="w-3 h-3" />Create “{q}”
              </button>
            )}
            {options.length === 0 && !offerCanvasTag && !(q && !exists) && (
              <span className="text-xs text-text-muted">{q ? 'Already on this task.' : 'All your tags are on this task.'}</span>
            )}
          </div>

          {q && !exists && (
            <div role="group" aria-label="Color for the new tag" className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11.5px] text-text-muted mr-0.5">Color</span>
              {THEME_ACCENT_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setNewColor(c.value); inputRef.current?.focus(); }}
                  aria-label={c.label}
                  aria-pressed={newColor === c.value}
                  title={c.label}
                  className="w-5 h-5 rounded-full border-2"
                  style={{ backgroundColor: c.value, borderColor: newColor === c.value ? 'var(--tm-text-primary)' : 'transparent' }}
                />
              ))}
            </div>
          )}

          {mode === 'add' && canRemember && (
            <label className={`flex gap-2 items-start mt-3.5 text-[12.5px] text-text-secondary ${empty ? 'opacity-60' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={remember}
                disabled={empty}
                onChange={e => setRemember(e.target.checked)}
                className="mt-0.5"
                style={{ accentColor: 'var(--tm-accent)' }}
              />
              <span>Use these tags for every {label} task I add from Canvas</span>
            </label>
          )}
          {canRemember && empty && (
            <p className="mt-1 text-[11.5px] text-text-muted">{mode === 'add' ? 'Remembering' : 'Saving'} tags for {label} needs at least one tag.</p>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3.5">
          <span className="hidden sm:inline mr-auto text-[11px] text-text-muted">
            <kbd className="px-1 rounded border border-border-strong border-b-2 text-[10.5px] font-sans">Enter</kbd>{' '}
            {q ? (exists ? 'adds the tag' : 'creates the tag') : mode === 'add' ? 'adds the task' : 'saves'}
          </span>
          <button type="button" onClick={onClose} className="btn btn-ghost ml-auto sm:ml-0">Cancel</button>
          <button type="button" onClick={() => void confirm()} disabled={busy || (mode === 'class' && empty)} className="btn btn-primary disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === 'add' && <ListPlus className="w-4 h-4" />}
            {mode === 'add' ? 'Add task' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

const OPTION = 'inline-flex items-center gap-1.5 px-[11px] py-[5px] rounded-full border border-border bg-surface text-[12.5px] font-medium text-text-primary transition-colors hover:border-border-strong';

export default CanvasAddSheet;
