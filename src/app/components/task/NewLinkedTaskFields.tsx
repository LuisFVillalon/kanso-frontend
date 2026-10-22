import React from 'react';
import { Tag } from '@/app/types/task';
import { formatDueDateShort } from '@/app/utils/taskUtils';
import { dueDateStr, isDueAfterParent, shiftDateStr } from '@/app/utils/linkedTasks';
import { toggleById } from '@/app/hooks/useTaskHandlers';
import TaskFormFields, { TaskFormData } from './TaskFormFields';
import Callout from './Callout';

/** The task a new linked task leads up to, as the form has it now. */
export interface LinkedParentInfo {
  title: string;
  due_date: string | Date | null;
}

const QUICK_TITLE_MAX = 18;

/**
 * Every field of the task form for a task created as a linked task, plus
 * quick due dates relative to its parent, a note that its tags started as
 * the parent's, and a warning when it's due after the parent.
 */
const NewLinkedTaskFields: React.FC<{
  values: TaskFormData;
  onChange: (next: TaskFormData) => void;
  parent: LinkedParentInfo;
  tags: Tag[];
  activeTaskCount: number;
  usedPriorityLevels: number[];
}> = ({ values, onChange, parent, tags, activeTaskCount, usedPriorityLevels }) => {
  const parentDue = dueDateStr(parent.due_date);
  const due = dueDateStr(values.due_date);
  const parentName = parent.title.trim() || 'this task';
  const shortName = parentName.length > QUICK_TITLE_MAX ? `${parentName.slice(0, QUICK_TITLE_MAX)}…` : parentName;

  const quick = (label: string, date: string) => {
    const on = (due ?? '') === date;
    return (
      <button
        type="button"
        onClick={() => onChange({ ...values, due_date: date })}
        aria-pressed={on}
        className={`max-w-full truncate whitespace-nowrap rounded-full border px-2 text-[11.5px] hover:border-[var(--tm-accent)] hover:text-accent ${
          on ? 'border-[var(--tm-accent)] text-accent' : 'border-border text-text-secondary'
        }`}
        style={{ backgroundColor: 'var(--tm-surface)' }}
      >
        {label}
      </button>
    );
  };

  return (
    <>
      <TaskFormFields
        values={values}
        onChange={onChange}
        tags={tags}
        onToggleTag={tag => onChange({ ...values, tags: toggleById(values.tags, tag) })}
        activeTaskCount={activeTaskCount}
        usedPriorityLevels={usedPriorityLevels}
        dueDateExtra={parentDue && (
          <div className="flex flex-wrap gap-1.5 -mt-3" role="group" aria-label="Quick due dates">
            {quick(`Day before “${shortName}”`, shiftDateStr(parentDue, -1))}
            {quick('Same day', parentDue)}
            {quick('No date', '')}
          </div>
        )}
        tagsHint={<>Starts with “{parentName}”’s tags. Change them freely.</>}
      />
      {isDueAfterParent(due, parentDue) && (
        <Callout tone="warning">
          This is due after “{parentName}” ({formatDueDateShort(parentDue)}). Saving is still allowed.
        </Callout>
      )}
    </>
  );
};

export default NewLinkedTaskFields;
