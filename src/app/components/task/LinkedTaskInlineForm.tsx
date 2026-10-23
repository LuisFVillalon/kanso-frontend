import React, { useEffect, useRef, useState } from 'react';
import { CornerDownRight, Loader2 } from 'lucide-react';
import { Tag, Task } from '@/app/types/task';
import { blankLinkedTaskForm } from '@/app/utils/linkedTasks';
import { TaskFormData } from './TaskFormFields';
import NewLinkedTaskFields from './NewLinkedTaskFields';
import Callout from './Callout';
import { TrailItem } from './ParentTrail';

interface LinkedTaskInlineFormProps {
  parent: Task;
  /** The tasks above `parent`, from its original task down to its own parent. */
  parents: TrailItem[];
  tags: Tag[];
  activeTaskCount: number;
  usedPriorityLevels: number[];
  /** Creates the task under `parent`; resolves to it, or false when it failed (and said why). */
  onCreate: (form: TaskFormData) => Promise<Task | false>;
  /** Called once a task is created; `more` is true for "Create and add another". */
  onCreated: (task: Task, more: boolean) => void;
  onCancel: () => void;
}

/**
 * "New linked task" under a task's card: every field of the task form, with
 * the parent's tags to start with and quick due dates relative to it. The
 * task is created right away as a linked task of `parent`, so it shows up in
 * the list as its own card. "Create and add another" keeps the form open
 * (and its due date) for the next one.
 */
const LinkedTaskInlineForm: React.FC<LinkedTaskInlineFormProps> = ({
  parent, parents, tags, activeTaskCount, usedPriorityLevels, onCreate, onCreated, onCancel,
}) => {
  const [values, setValues] = useState<TaskFormData>(() => blankLinkedTaskForm(parent.tags));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<false | 'one' | 'more'>(false);
  const formRef = useRef<HTMLFormElement>(null);

  const focusTitle = () => formRef.current?.querySelector<HTMLInputElement>('input[type="text"]')?.focus({ preventScroll: true });

  useEffect(() => {
    formRef.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    focusTitle();
  }, []);

  const submit = async (more: boolean) => {
    if (saving) return;
    if (!values.title.trim()) {
      setError('Give the linked task a title.');
      focusTitle();
      return;
    }
    setError(null);
    setSaving(more ? 'more' : 'one');
    const created = await onCreate(values);
    setSaving(false);
    if (!created) return;
    if (more) {
      setValues({ ...blankLinkedTaskForm(parent.tags), due_date: values.due_date });
      focusTitle();
    }
    onCreated(created, more);
  };

  const trail = [...parents, parent];

  return (
    <form
      ref={formRef}
      aria-label={`New linked task for ${parent.title}`}
      noValidate
      onSubmit={e => { e.preventDefault(); void submit(false); }}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
      }}
      className="rounded-xl border p-4 sm:px-5 animate-fade-in"
      style={{
        borderColor: 'var(--tm-accent)',
        backgroundColor: 'var(--tm-surface-raised)',
        boxShadow: '0 0 0 3px var(--tm-accent-subtle)',
      }}
    >
      <h4 className="text-[15px] font-semibold text-text-primary">New linked task</h4>
      <p className="flex flex-wrap items-center gap-1 mt-0.5 mb-4 text-[12.5px] text-text-muted">
        <CornerDownRight className="w-3 h-3 flex-shrink-0" aria-hidden />
        Leads up to
        {trail.map((t, i) => (
          <React.Fragment key={t.id}>
            {i > 0 && <span aria-hidden className="text-[var(--tm-pencil)]">›</span>}
            <b className="font-semibold text-text-primary">{t.title}</b>
          </React.Fragment>
        ))}
      </p>

      <div className="space-y-4">
        <NewLinkedTaskFields
          values={values}
          onChange={next => { setValues(next); if (error && next.title.trim()) setError(null); }}
          parent={parent}
          tags={tags}
          activeTaskCount={activeTaskCount}
          usedPriorityLevels={usedPriorityLevels}
        />
        {error && <Callout tone="danger" role="alert">{error}</Callout>}
      </div>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button type="button" onClick={onCancel} disabled={!!saving} className="btn btn-secondary px-4 py-2">
          Cancel
        </button>
        <button type="button" onClick={() => void submit(true)} disabled={!!saving} className="btn btn-secondary px-4 py-2">
          {saving === 'more' && <Loader2 className="w-4 h-4 animate-spin" />}
          Create and add another
        </button>
        <button type="submit" disabled={!!saving} className="btn btn-primary px-4 py-2">
          {saving === 'one' && <Loader2 className="w-4 h-4 animate-spin" />}
          Create linked task
        </button>
      </div>
    </form>
  );
};

export default LinkedTaskInlineForm;
