'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchCanvasCourseTags, saveCanvasCourseTags } from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import type { CanvasCourseTags } from '@/app/types/canvas';
import type { Tag } from '@/app/types/task';

const byCourseId = (list: CanvasCourseTags[]) => Object.fromEntries(list.map(c => [c.course_id, c.tags]));

/**
 * The tags each class's tasks start with when added from Canvas ("Use these
 * tags for every CS 460 task"), kept on the backend per Canvas course. Loads
 * once `enabled`; a backend without them reads as no choices, so every class
 * starts with its Canvas tag.
 */
export function useCanvasCourseTags(enabled: boolean) {
  const showToast = useToast();
  const [byCourse, setByCourse] = useState<Record<number, Tag[]>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetchCanvasCourseTags().then(
      list => { if (!cancelled) setByCourse(byCourseId(list)); },
      () => { /* No choices to show: each class starts with its Canvas tag. */ },
    );
    return () => { cancelled = true; };
  }, [enabled]);

  /** The tags a class's tasks start with, or null when the user hasn't chosen any. */
  const tagsOf = useCallback((courseId: number): Tag[] | null => byCourse[courseId] ?? null, [byCourse]);

  /**
   * Saves a class's tags (none clears the choice), showing them at once and
   * putting the old ones back if the save fails.
   */
  const save = useCallback(async (courseId: number, tags: Tag[]): Promise<boolean> => {
    let previous: Record<number, Tag[]> = {};
    setByCourse(prev => {
      previous = prev;
      const next = { ...prev };
      if (tags.length) next[courseId] = tags;
      else delete next[courseId];
      return next;
    });
    try {
      setByCourse(byCourseId(await saveCanvasCourseTags(courseId, tags.map(t => t.id))));
      return true;
    } catch (err) {
      console.error('Saving class tags failed:', err);
      setByCourse(previous);
      showToast("Couldn't save the tags for this class. Please try again.");
      return false;
    }
  }, [showToast]);

  return { tagsOf, save };
}
