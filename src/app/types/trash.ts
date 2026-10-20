export type TrashKind = 'task' | 'note' | 'tag' | 'habit';

/** One deleted item in the trash, as listed by GET /get-trash. */
export interface TrashItem {
  kind: TrashKind;
  id: number;
  /** A tag's name, otherwise the item's title. */
  title: string;
  deleted_at: string;
  /** When the item is permanently deleted unless restored first (30 days after deletion). */
  purge_at: string;
  /** Tasks only: the parent it was a subtask of. */
  parent_task_id?: number | null;
}
