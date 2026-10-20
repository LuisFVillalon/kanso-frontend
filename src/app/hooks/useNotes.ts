import { useState, useEffect, useCallback, useRef } from 'react';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import {
  fetchNotes,
  createNote as apiCreateNote,
  updateNote as apiUpdateNote,
  deleteNote as apiDeleteNote,
  archiveNote as apiArchiveNote,
  restoreNote as apiRestoreNote,
  reapStaleNoteSessions,
  describeError,
} from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';

/**
 * @param enabled - Set false to skip the initial fetch (e.g. no signed-in
 * user yet) — called from NotesProvider (context/NotesContext.tsx), which
 * gates this on auth so pages outside the signed-in app never fire it.
 */
export const useNotes = (enabled: boolean) => {
  const showToast = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Guards delete against a rapid double-click firing the request twice,
  // mirroring the pendingIds pattern in useHabits/useTasks.
  const pendingRef = useRef<Set<number>>(new Set());
  const [pendingNoteIds, setPendingNoteIds] = useState<Set<number>>(new Set());
  // Bumped only after an archive, delete or restore is confirmed by the
  // server, so the daily debrief can re-fetch without racing the request.
  const [archiveSyncToken, setArchiveSyncToken] = useState(0);

  // Mirrors `notes` so callbacks can read the latest state without a stale
  // closure (setState updates aren't visible synchronously).
  const notesRef = useRef<Note[]>([]);
  useEffect(() => { notesRef.current = notes; }, [notes]);

  // ── Draft notes ────────────────────────────────────────────────────────────
  // A newly created note is never persisted until the user actually edits it
  // (title, content, or tags). It lives locally under a negative "temp" id —
  // which stays its id for the rest of the session, even after the backend
  // record exists — so callers (active-note selection, overlays, URL params)
  // never have to react to an id swap.
  const nextTempId = useRef(-1);
  const isDraftId = (id: number) => id < 0;
  // tempId -> real backend id, populated once a draft is first persisted.
  const draftRealId = useRef<Map<number, number>>(new Map());
  // tempId -> in-flight creation request, so concurrent first-edits
  // (e.g. title + content debounces firing close together) create the
  // note exactly once.
  const draftCreating = useRef<Map<number, Promise<Note>>>(new Map());

  useEffect(() => {
    if (!enabled) return;
    // Best-effort maintenance — swallowed separately so a reap failure never
    // blocks note loading or surfaces as "Failed to load notes".
    reapStaleNoteSessions()
      .catch(() => {})
      .finally(() => {
        fetchNotes()
          .then(data => setNotes(data))
          .catch(() => setError('Failed to load notes'))
          .finally(() => setIsLoading(false));
      });
  }, [enabled]);

  const addNote = useCallback((title = 'Untitled Note'): Note => {
    const tempId = nextTempId.current--;
    const now = new Date().toISOString();
    const draft: Note = { id: tempId, title, content: '', tags: [], created_date: now, updated_date: now };
    setNotes(prev => [draft, ...prev]);
    return draft;
  }, []);

  const updateNote = useCallback(
    async (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>): Promise<boolean> => {
      setNotes(prev =>
        prev.map(note =>
          note.id === id ? { ...note, ...changes, updated_date: new Date().toISOString() } : note,
        ),
      );

      const realId = draftRealId.current.get(id);

      if (isDraftId(id) && realId === undefined) {
        // First real edit on a still-unsaved draft — persist it now.
        let creating = draftCreating.current.get(id);
        const isInitiator = !creating;

        if (!creating) {
          const base = notesRef.current.find(n => n.id === id);
          const payload = {
            title: base?.title ?? 'Untitled Note',
            content: base?.content ?? '',
            tags: base?.tags ?? [],
            ...changes,
          };
          creating = apiCreateNote(payload)
            .then(created => {
              draftRealId.current.set(id, created.id);
              draftCreating.current.delete(id);
              // Only patch server-confirmed metadata — title/content/tags may
              // have moved on locally since `payload` was captured. Stamping
              // persistedId here (rather than swapping `id`) lets consumers
              // that need the real backend id — e.g. useNoteSession — react
              // to the note becoming persisted without disturbing the stable
              // temp id everything else keys off.
              setNotes(prev =>
                prev.map(n =>
                  n.id === id
                    ? { ...n, persistedId: created.id, created_date: created.created_date, updated_date: created.updated_date }
                    : n,
                ),
              );
              return created;
            })
            .catch(err => {
              draftCreating.current.delete(id);
              throw err;
            });
          draftCreating.current.set(id, creating);
        }

        try {
          const created = await creating;
          // A follower call's changes weren't part of the creation payload —
          // push them now as a normal update against the real id.
          if (!isInitiator) {
            const updated = await apiUpdateNote(created.id, changes);
            setNotes(prev =>
              prev.map(n => (n.id === id ? { ...n, updated_date: updated.updated_date } : n)),
            );
          }
          return true;
        } catch {
          setError('Failed to save note');
          return false;
        }
      }

      const targetId = realId ?? id;
      try {
        const updated = await apiUpdateNote(targetId, changes);
        // Only patch the server-confirmed timestamp here — reapplying `changes`
        // would stomp any newer optimistic update (e.g. a second tag toggled
        // while this request was still in flight), causing the tag picker to
        // flicker and lose selections.
        setNotes(prev =>
          prev.map(note =>
            note.id === id ? { ...note, updated_date: updated.updated_date } : note,
          ),
        );
        return true;
      } catch {
        setError('Failed to save note');
        return false;
      }
    },
    [],
  );

  // Drops a draft note from local state if it was never actually edited
  // (still unpersisted — no real backend id, nothing in flight). Called when
  // the user navigates away from / closes a fresh, untouched draft, so it
  // doesn't linger in the list as a phantom "Untitled Note" until refresh.
  const discardDraft = useCallback((id: number) => {
    if (!isDraftId(id)) return;
    if (draftRealId.current.has(id) || draftCreating.current.has(id)) return;
    setNotes(prev => prev.filter(note => note.id !== id));
  }, []);

  // Puts a note restored from the Archive or Recently deleted page (or by an
  // Undo) back into the active list.
  const restoreNote = useCallback((restored: Note) => {
    setNotes(prev => [restored, ...prev.filter(note => note.id !== restored.id)]);
    setArchiveSyncToken(v => v + 1);
  }, []);

  // Brings a just-deleted note back from the trash, editing time included.
  const undoDelete = useCallback(async (backendId: number) => {
    try {
      restoreNote(await apiRestoreNote(backendId));
      showToast('Note restored.', 'success');
    } catch (err) {
      showToast(describeError(err, "Couldn't restore the note. You can still restore it from Recently deleted."));
    }
  }, [restoreNote, showToast]);

  const deleteNote = useCallback(async (id: number) => {
    if (pendingRef.current.has(id)) return;
    pendingRef.current.add(id);
    setPendingNoteIds(new Set(pendingRef.current));

    setNotes(prev => prev.filter(note => note.id !== id));

    const creating = draftCreating.current.get(id);
    const realId = draftRealId.current.get(id);

    try {
      if (isDraftId(id) && !creating && realId === undefined) {
        // Never made it to the backend — nothing to delete there.
      } else {
        const backendId = creating ? (await creating).id : realId ?? id;
        await apiDeleteNote(backendId);
        setArchiveSyncToken(v => v + 1);
        showToast('Note moved to Recently deleted. You can restore it for 30 days.', 'info', {
          label: 'Undo',
          onClick: () => undoDelete(backendId),
        });
      }
    } catch {
      setError('Failed to delete note');
    } finally {
      draftRealId.current.delete(id);
      draftCreating.current.delete(id);
      pendingRef.current.delete(id);
      setPendingNoteIds(new Set(pendingRef.current));
    }
  }, [showToast, undoDelete]);

  const archiveNote = useCallback(async (id: number) => {
    if (pendingRef.current.has(id)) return;
    const creating = draftCreating.current.get(id);
    const realId = draftRealId.current.get(id);
    // An untouched draft was never saved, so there is nothing to archive.
    if (isDraftId(id) && !creating && realId === undefined) {
      discardDraft(id);
      return;
    }

    pendingRef.current.add(id);
    setPendingNoteIds(new Set(pendingRef.current));

    const index = notesRef.current.findIndex(note => note.id === id);
    const archived = notesRef.current[index];
    setNotes(prev => prev.filter(note => note.id !== id));

    try {
      const backendId = creating ? (await creating).id : realId ?? id;
      await apiArchiveNote(backendId);
      setArchiveSyncToken(v => v + 1);
      showToast('Note archived. You can restore it from the Archive page.', 'info');
    } catch (err) {
      if (archived) {
        setNotes(prev => {
          if (prev.some(note => note.id === id)) return prev;
          const next = [...prev];
          next.splice(index, 0, archived);
          return next;
        });
      }
      showToast(describeError(err, "Couldn't archive the note, so it has been restored."));
    } finally {
      pendingRef.current.delete(id);
      setPendingNoteIds(new Set(pendingRef.current));
    }
  }, [discardDraft, showToast]);

  // Strips a deleted tag from every note still carrying it.
  const removeTagFromNotes = useCallback((tagId: number) => {
    setNotes(prev =>
      prev.map(note =>
        note.tags.some(t => t.id === tagId) ? { ...note, tags: note.tags.filter(t => t.id !== tagId) } : note,
      ),
    );
  }, []);

  // Puts a tag restored from the trash back on the notes (by backend id) that carry it.
  const addTagToNotes = useCallback((tag: Tag, noteIds: Set<number>) => {
    setNotes(prev =>
      prev.map(note =>
        noteIds.has(note.persistedId ?? note.id) && !note.tags.some(t => t.id === tag.id)
          ? { ...note, tags: [...note.tags, tag] }
          : note,
      ),
    );
  }, []);

  return {
    notes, isLoading, error, addNote, updateNote, deleteNote, archiveNote, restoreNote, removeTagFromNotes, addTagToNotes,
    discardDraft, pendingNoteIds, archiveSyncToken,
  };
};
