'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { ResizableImage } from './extensions/ResizableImage';
import TiptapHighlight from '@tiptap/extension-highlight';
import TiptapTextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import {
  ChevronDown, ChevronUp, Type, Link2, FileText, Loader2,
  PanelLeftClose, PanelLeftOpen, LibraryBig, X,
} from 'lucide-react';
import { BottomFormattingBar, EditorToolbar, RING_STYLE } from './EditorToolbar';
import NoteSaveStatus from './NoteSaveStatus';
import NoteMoreMenu from './NoteMoreMenu';
import NoteDetails, { type NoteStats } from './NoteDetails';
import NoteOutline from './NoteOutline';
import NoteSelectionMenu, { repositionSelectionMenu } from './NoteSelectionMenu';
import LinkEditor from './LinkEditor';
import SlashMenu from './SlashMenu';
import { SlashCommand, createSlashMenuStore, slashCommandPluginKey } from './extensions/SlashCommand';
import { createTabKeyHandler } from './extensions/tabKeys';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import { describeError, fetchLearningResources } from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES } from './imageLimits';
import { LearningResourcesResponse } from '@/app/types/learningResources';
import { extractStructuredNoteContent } from '@/app/utils/noteContentExtractor';
import { useNotePdfExport } from '@/app/hooks/useNotePdfExport';
import { useNoteSession } from '@/app/hooks/useNoteSession';
import { useNoteAutosave } from '@/app/hooks/useNoteAutosave';
import { useElementWidth } from '@/app/hooks/useElementWidth';
import TagMultiSelect from '@/app/components/common/TagMultiSelect';

// Splits on whitespace and drops empty tokens, so blank/whitespace-only
// content (Tiptap's getText() for an "empty" doc) counts as zero words.
const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

/**
 * Below these editor widths the formatting tools move from the top bar to a
 * bar under the note, so the top bar never wraps. The Notes page's bar also
 * holds the sidebar toggle and Resources, so it needs more room.
 */
const TOP_FORMATTING_MIN_WIDTH = { notesPage: 700, overlay: 600 } as const;

type SidePanel = 'resources' | 'outline';

/** Focus mode's reading column. */
const FOCUS_COLUMN = 'w-full max-w-[46rem] mx-auto';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null;
  allTags: Tag[];
  onUpdate: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  /** The Notes page's extras: Resources, PDF export and focus mode. */
  showExtendedActions?: boolean;
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

const NoteEditor: React.FC<NoteEditorProps> = ({
  note, allTags, onUpdate,
  sidebarOpen = true, onToggleSidebar,
  showExtendedActions = false,
}) => {
  const showToast = useToast();
  const [title, setTitle]               = useState(note?.title ?? '');
  const [emptyToast, setEmptyToast]     = useState(false);
  const [tagsOpen, setTagsOpen]         = useState(false);
  const [tagTogglingId, setTagTogglingId] = useState<number | null>(null);
  const [resourcesStatus, setResourcesStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [resourcesData, setResourcesData]     = useState<LearningResourcesResponse | null>(null);
  const [resourcesError, setResourcesError]   = useState('');
  const [sidePanel, setSidePanel]             = useState<SidePanel | null>(null);
  const [wordCount, setWordCount]             = useState(0);
  const [linkEditorOpen, setLinkEditorOpen]   = useState(false);
  const [details, setDetails]                 = useState<NoteStats | null>(null);
  const [focusMode, setFocusMode]             = useState(false);
  const [openedAt, setOpenedAt]               = useState(() => Date.now());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [measureRef, editorWidth] = useElementWidth<HTMLDivElement>();
  const setContainer = useCallback((el: HTMLDivElement | null) => {
    containerRef.current = el;
    measureRef(el);
  }, [measureRef]);

  const [slashStore] = useState(createSlashMenuStore);
  // Tab defers to the slash menu while it's open, so Tab picks the highlighted block.
  const [handleTabKey] = useState(() =>
    createTabKeyHandler(view => !!slashCommandPluginKey.getState(view.state)?.active),
  );

  const { status: saveStatus, savedAt, schedule, saveNow } = useNoteAutosave(note?.id ?? null, onUpdate);

  // ── Editor setup ───────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
        // Links open from the selection menu (or with the link's own Open),
        // so clicking one while writing just places the cursor.
        link: {
          openOnClick: false,
          defaultProtocol: 'https',
          HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
        },
      }),

      // Image: base64 data-URIs are stored in note HTML so images survive
      // page reloads without a separate upload service.
      ResizableImage.configure({
        allowBase64: true,
        HTMLAttributes: { class: 'note-img' },
      }),

      // Highlight: multicolor=true lets each mark carry its own background-color.
      TiptapHighlight.configure({ multicolor: true }),

      TiptapTextAlign.configure({
        types: ['heading', 'paragraph'],
      }),

      TableKit.configure({ table: { resizable: true } }),

      TaskList,
      TaskItem.configure({ nested: true }),

      SlashCommand.configure({ store: slashStore }),
    ],
    content: note?.content ?? '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'notes-editor focus:outline-none min-h-[400px]' },

      // Four-space Tab outside lists, checklists and tables; Shift+Tab and
      // Escape-then-Tab leave the editor (see tabKeys.ts).
      handleKeyDown: handleTabKey,

      // ── Image paste ───────────────────────────────────────────────────────
      // Intercept clipboard events that contain an image file, convert to a
      // base64 data-URI, then insert an <img> node into the document.
      handlePaste(view, event) {
        const items = Array.from(event.clipboardData?.items ?? []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (!imgItem) return false;

        event.preventDefault();
        const file = imgItem.getAsFile();
        if (!file) return false;
        if (file.size > MAX_IMAGE_BYTES) {
          showToast(IMAGE_TOO_LARGE_MESSAGE);
          return true;
        }

        const reader = new FileReader();
        reader.onload = readerEvent => {
          const src = readerEvent.target?.result as string;
          if (!src) return;
          const imageNode = view.state.schema.nodes.image;
          if (!imageNode) return;
          view.dispatch(
            view.state.tr.replaceSelectionWith(
              imageNode.create({ src }),
            ),
          );
        };
        reader.readAsDataURL(file);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      setWordCount(countWords(editor.getText()));
      if (!note) return;
      schedule({ content: editor.getHTML() });
    },
  });

  const { pdfLoading, pdfError, downloadPDF } = useNotePdfExport({ editor, title });
  // Time spent in this note on earlier visits (closed note_sessions rows); the
  // hook also opens and closes this visit's session on the backend.
  const pastSeconds = useNoteSession(note);

  // Sync to active note — update title + editor content. Edits still queued
  // for the previous note are sent by useNoteAutosave, not dropped.
  useEffect(() => {
    setTitle(note?.title ?? '');
    setSidePanel(null);
    setResourcesStatus('idle');
    setResourcesData(null);
    setLinkEditorOpen(false);
    setDetails(null);
    setOpenedAt(Date.now());
    if (editor) {
      editor.commands.setContent(note?.content ?? '', { emitUpdate: false });
      setWordCount(countWords(editor.getText()));
    }
    if (note) {
      containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  // `editor` excluded intentionally — setContent is imperative, not reactive.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  // `immediatelyRender: false` means `editor` is null on first render; once
  // it becomes available, seed the word count for the initially-loaded note.
  useEffect(() => {
    if (editor) setWordCount(countWords(editor.getText()));
  }, [editor]);

  useEffect(() => {
    slashStore.setActions({ pickImage: () => imageInputRef.current?.click() });
  }, [slashStore]);

  // The editor moves when focus mode or a side panel opens or closes; keep
  // the selection menu next to the selected text once the layout settles.
  useEffect(() => {
    if (!editor) return;
    const frame = requestAnimationFrame(() => repositionSelectionMenu(editor));
    const settled = setTimeout(() => repositionSelectionMenu(editor), 320);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
    };
  }, [editor, focusMode, sidePanel]);

  // Escape leaves focus mode, unless it's closing the slash menu or the link
  // editor first. Listens in the capture phase: the editor marks Escape as
  // handled before it would bubble up to the document.
  useEffect(() => {
    if (!focusMode) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || linkEditorOpen) return;
      if (editor && slashCommandPluginKey.getState(editor.state)?.active) return;
      setFocusMode(false);
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [focusMode, linkEditorOpen, editor]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!note) return;
    schedule({ title: value });
  };

  /** Ctrl+S, and Retry after a failed save: save the title and body now. */
  const saveNoteNow = () => {
    if (!note || !editor) return;
    void saveNow({ title, content: editor.getHTML() });
  };

  const handleShortcuts = (e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = e.key.toLowerCase();
    if (key === 's' && !e.shiftKey) {
      // Instead of the browser's "Save page as".
      e.preventDefault();
      saveNoteNow();
    } else if (key === 'k' && !e.shiftKey && editor?.view.dom.contains(e.target as Node)) {
      e.preventDefault();
      setLinkEditorOpen(true);
    } else if (key === 'f' && e.shiftKey && showExtendedActions) {
      e.preventDefault();
      setFocusMode(v => !v);
    }
  };

  const handleTagToggle = async (tag: Tag) => {
    if (!note || tagTogglingId !== null) return;
    setTagTogglingId(tag.id);
    const exists = note.tags.some(t => t.id === tag.id);
    try {
      await onUpdate(note.id, {
        tags: exists ? note.tags.filter(t => t.id !== tag.id) : [...note.tags, tag],
      });
    } finally {
      setTagTogglingId(null);
    }
  };

  const flashEmptyToast = () => {
    setEmptyToast(true);
    setTimeout(() => setEmptyToast(false), 2500);
  };

  const handleDownloadPDF = async () => {
    if (!note || !editor) return;

    if (editor.isEmpty) {
      flashEmptyToast();
      return;
    }

    await downloadPDF();
  };

  const runResourcesFetch = async () => {
    if (!note || !editor) return;

    setResourcesStatus('loading');
    setResourcesData(null);
    try {
      const condensed = extractStructuredNoteContent(title, editor.getJSON(), editor.getText());
      const data = await fetchLearningResources(condensed);
      setResourcesData(data);
      setResourcesStatus('done');
    } catch (err) {
      setResourcesError(describeError(err, "Couldn't fetch resources. Please try again."));
      setResourcesStatus('error');
    }
  };

  const handleGetResources = async () => {
    if (!note || !editor) return;

    if (sidePanel === 'resources') {
      setSidePanel(null);
      return;
    }

    if (editor.isEmpty) {
      flashEmptyToast();
      return;
    }

    setSidePanel('resources');

    if (resourcesStatus === 'done' && resourcesData) return;
    if (resourcesStatus === 'loading') return;

    await runResourcesFetch();
  };

  const toggleDetails = () => {
    if (details) {
      setDetails(null);
      return;
    }
    setDetails({
      words: wordCount,
      characters: editor?.state.doc.textContent.length ?? 0,
      timeSpentSeconds: pastSeconds + Math.max(0, Math.round((Date.now() - openedAt) / 1000)),
      savedAt,
    });
  };

  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editor) return;
    if (file.size > MAX_IMAGE_BYTES) {
      showToast(IMAGE_TOO_LARGE_MESSAGE);
      return;
    }

    const reader = new FileReader();
    reader.onload = readerEvent => {
      const src = readerEvent.target?.result as string;
      if (!src) return;
      editor.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
  };

  const pickImage = () => imageInputRef.current?.click();
  const openLinkEditor = () => setLinkEditorOpen(true);
  const closeLinkEditor = useCallback(() => setLinkEditorOpen(false), []);
  const closeDetails = useCallback(() => setDetails(null), []);

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!note) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--tm-surface)' }}>
        {onToggleSidebar && (
          <div
            className="hidden sm:flex items-center gap-0.5 px-4 py-2 border-b border-border-subtle shrink-0"
            style={{ backgroundColor: 'var(--tm-surface-raised)' }}
          >
            <button
              type="button"
              onClick={onToggleSidebar}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              className="flex px-2 py-1.5 rounded-md text-sm transition-colors text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]"
            >
              {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4" />}
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: 'var(--tm-surface-raised)' }}
            >
              <FileText className="w-8 h-8 text-text-muted" />
            </div>
            <h3 className="text-base font-semibold text-text-muted mb-1">No note selected</h3>
            <p className="text-sm text-text-muted">Select a note from the sidebar or create a new one</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const compact = editorWidth !== null
    && editorWidth < (onToggleSidebar ? TOP_FORMATTING_MIN_WIDTH.notesPage : TOP_FORMATTING_MIN_WIDTH.overlay);

  const resourcesOpen = sidePanel === 'resources';

  return (
    <div
      ref={setContainer}
      onKeyDown={handleShortcuts}
      className={focusMode
        ? 'fixed inset-0 z-40 flex flex-col overflow-hidden'
        : 'flex-1 flex flex-col overflow-hidden relative'}
      style={{ backgroundColor: 'var(--tm-surface)' }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      {focusMode ? (
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
          <NoteSaveStatus status={saveStatus} savedAt={savedAt} onRetry={saveNoteNow} />
          <button
            type="button"
            onClick={() => setFocusMode(false)}
            title="Leave focus mode (Esc)"
            className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium outline-none focus-visible:ring-2 transition-colors text-[var(--tm-text-secondary)] hover:text-[var(--tm-text-primary)] hover:bg-[var(--tm-surface-raised)]"
            style={{ ...RING_STYLE, border: '1px solid var(--tm-border)' }}
          >
            <X className="w-4 h-4" aria-hidden="true" />
            Leave focus
          </button>
        </div>
      ) : (
        <EditorToolbar
          editor={editor}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          showFormatting={!compact}
          onPickImage={pickImage}
          onEditLink={openLinkEditor}
        >
          <NoteSaveStatus status={saveStatus} savedAt={savedAt} onRetry={saveNoteNow} />

          {wordCount > 0 && (
            <button
              type="button"
              data-note-details-trigger
              onClick={toggleDetails}
              title="Words, reading time and time spent"
              aria-expanded={!!details}
              className="hidden @4xl:flex items-center gap-1 h-8 px-2 rounded-md text-xs font-medium outline-none transition-colors focus-visible:ring-2 text-[var(--tm-text-muted)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]"
              style={RING_STYLE}
            >
              <Type className="w-3.5 h-3.5" aria-hidden="true" />
              {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
            </button>
          )}

          {showExtendedActions && (
            <button
              type="button"
              onClick={handleGetResources}
              title={resourcesOpen ? 'Close resources panel' : 'Get AI learning resources'}
              aria-label="Resources"
              aria-pressed={resourcesOpen}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-1 hover:bg-[var(--tm-accent-subtle)]"
              style={{
                ...RING_STYLE,
                color: 'var(--tm-accent)',
                backgroundColor: resourcesOpen ? 'var(--tm-accent-subtle)' : undefined,
              }}
            >
              {resourcesStatus === 'loading' && !resourcesOpen
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <LibraryBig className="w-3.5 h-3.5" />}
              <span className="hidden @4xl:inline">Resources</span>
            </button>
          )}

          <div data-note-details-trigger className="contents">
            <NoteMoreMenu
              onDownloadPdf={showExtendedActions ? handleDownloadPDF : undefined}
              pdfLoading={pdfLoading}
              onShowDetails={toggleDetails}
              outlineOpen={sidePanel === 'outline'}
              onToggleOutline={() => setSidePanel(p => (p === 'outline' ? null : 'outline'))}
              onFocusMode={showExtendedActions ? () => setFocusMode(true) : undefined}
            />
          </div>

          {details && <NoteDetails stats={details} onClose={closeDetails} />}
        </EditorToolbar>
      )}

      {/* ── Main content: editor column + side panel ─────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* ── Title ──────────────────────────────────────────────────────── */}
          <div className={`px-6 sm:px-10 pb-2 ${focusMode ? `pt-14 ${FOCUS_COLUMN}` : 'pt-6'}`}>
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Untitled Note"
              aria-label="Note title"
              className="w-full text-2xl sm:text-3xl font-bold text-text-primary placeholder-text-muted focus:outline-none bg-transparent"
            />
          </div>

          {/* ── Tag picker (collapsible) ──────────────────────────────────────── */}
          {allTags.length > 0 && !focusMode && (
            <div className="px-6 sm:px-10 pb-3">
              <button
                type="button"
                onClick={() => setTagsOpen(v => !v)}
                aria-expanded={tagsOpen}
                aria-controls="note-tag-picker"
                className="flex items-center gap-1.5 text-xs font-medium mb-2 transition-opacity hover:opacity-70"
                style={{ color: 'var(--tm-text-muted)' }}
              >
                {tagsOpen
                  ? <ChevronUp className="w-3.5 h-3.5" />
                  : <ChevronDown className="w-3.5 h-3.5" />}

                {tagsOpen ? 'Hide tags' : (
                  note.tags.length > 0
                    ? (
                      <span className="flex items-center gap-1.5">
                        <span>Tags</span>
                        {note.tags.slice(0, 5).map(t => (
                          <span
                            key={t.id}
                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.color }}
                            title={t.name}
                          />
                        ))}
                        {note.tags.length > 5 && <span>+{note.tags.length - 5}</span>}
                      </span>
                    )
                    : 'Add tags'
                )}
              </button>

              <div
                id="note-tag-picker"
                role="region"
                aria-label="Tag picker"
                className="overflow-hidden transition-all duration-200"
                style={{ maxHeight: tagsOpen ? '160px' : '0px', opacity: tagsOpen ? 1 : 0 }}
              >
                <TagMultiSelect
                  tags={allTags}
                  isSelected={tag => note.tags.some(t => t.id === tag.id)}
                  onToggle={handleTagToggle}
                  gridClassName="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4 rounded-xl border border-border max-h-36 overflow-y-auto scrollbar-custom"
                  gridStyle={{ backgroundColor: 'var(--tm-surface-raised)' }}
                  buttonClassName="px-3 py-2 rounded-md text-sm font-medium transition-all hover:scale-100 active:scale-95 flex items-center justify-center gap-1.5 disabled:hover:scale-100"
                  unselectedBg="var(--tm-surface)"
                  scaleAnimation
                  togglingId={tagTogglingId}
                />
              </div>
            </div>
          )}

          <div className={focusMode ? `w-full ${FOCUS_COLUMN}` : ''}>
            <div className="mx-6 sm:mx-10 border-t border-border-subtle" />
          </div>

          {/* ── Editor body ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto scrollbar-custom">
            <div className={`px-6 sm:px-10 py-4 ${focusMode ? FOCUS_COLUMN : ''}`}>
              <EditorContent editor={editor} />
            </div>
          </div>

          {compact && !focusMode && (
            <BottomFormattingBar editor={editor} onPickImage={pickImage} onEditLink={openLinkEditor} />
          )}
        </div>

        {/* ── Side panel: Learning resources or Outline ─────────────────────── */}
        <div
          className="shrink-0 flex flex-col border-l overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{
            width: sidePanel && !focusMode ? (sidePanel === 'outline' ? '260px' : '300px') : '0px',
            borderColor: 'var(--tm-border)',
            backgroundColor: 'var(--tm-surface-raised)',
          }}
        >
          <div className={`${sidePanel === 'outline' ? 'w-[260px]' : 'w-[300px]'} flex flex-col h-full`}>
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'var(--tm-border)' }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold" style={{ color: 'var(--tm-text-primary)' }}>
                    {sidePanel === 'outline' ? 'Outline' : 'Learning Resources'}
                  </span>
                </div>
                {sidePanel === 'resources' && resourcesData?.topic && (
                  <div className="flex justify-start items-center gap-1 px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: 'var(--tm-accent-subtle)' }}>
                    <p className='text-xs'>Context caught: </p>
                    <span className="text-sm font-medium" style={{ color: 'var(--tm-accent)' }}>{resourcesData.topic}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSidePanel(null)}
                aria-label={sidePanel === 'outline' ? 'Close outline' : 'Close resources'}
                className="p-1 rounded-md transition-colors text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto scrollbar-custom">
              {sidePanel === 'outline' && <NoteOutline editor={editor} />}

              {sidePanel === 'resources' && resourcesStatus === 'loading' && (
                <div className="px-4 py-10 flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--tm-accent)' }} />
                  <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>Analyzing your note…</p>
                </div>
              )}

              {sidePanel === 'resources' && resourcesStatus === 'error' && (
                <div className="px-4 py-8 flex flex-col items-center gap-3 text-center">
                  <p className="text-sm" style={{ color: 'var(--tm-danger)' }}>{resourcesError}</p>
                  <button
                    type="button"
                    onClick={runResourcesFetch}
                    className="text-sm font-medium px-3 py-1.5 rounded-md transition-colors"
                    style={{ color: 'var(--tm-accent)', backgroundColor: 'var(--tm-accent-subtle)' }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {sidePanel === 'resources' && resourcesStatus === 'done' && resourcesData && resourcesData.message && (
                <div className="px-4 py-8 flex flex-col items-center gap-1 text-center">
                  <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>{resourcesData.message}</p>
                </div>
              )}

              {sidePanel === 'resources' && resourcesStatus === 'done' && resourcesData && !resourcesData.message && (
                <div className="px-3 py-3 flex flex-col gap-2.5">
                  {resourcesData.resources.map((r, i) => (
                    <a
                      key={i}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col gap-1.5 p-3 rounded-xl border transition-all"
                      style={{ border: '1px solid var(--tm-border)', backgroundColor: 'var(--tm-surface)' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--tm-accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--tm-border)')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0" style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}>
                          {r.activity_label} · {r.platform}
                        </span>
                        <Link2 className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--tm-text-muted)' }} />
                      </div>
                      <p className="text-sm font-medium text-text-primary">{r.title}</p>
                      <ul className="text-xs leading-relaxed list-disc pl-4 flex flex-col gap-0.5" style={{ color: 'var(--tm-text-muted)' }}>
                        {r.why.split(';').map(s => s.trim()).filter(Boolean).map((point, j) => (
                          <li key={j}>{point}</li>
                        ))}
                      </ul>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Floating editor UI ───────────────────────────────────────────── */}
      {editor && (
        <NoteSelectionMenu
          editor={editor}
          noteTags={note.tags}
          onEditLink={openLinkEditor}
          linkEditorOpen={linkEditorOpen}
        />
      )}
      {editor && linkEditorOpen && <LinkEditor editor={editor} onClose={closeLinkEditor} />}
      <SlashMenu store={slashStore} />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={handleImageFile}
      />

      {/* ── Toasts ───────────────────────────────────────────────────────── */}
      {emptyToast && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium pointer-events-none"
          style={{ backgroundColor: 'var(--tm-surface-raised)', color: 'var(--tm-text-secondary)', border: '1px solid var(--tm-border)', boxShadow: 'var(--tm-shadow-lg)' }}
        >
          Note is empty — add some content first.
        </div>
      )}
      {pdfError && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg text-sm font-medium pointer-events-none"
          style={{ backgroundColor: 'var(--tm-danger-subtle)', color: 'var(--tm-danger)', border: '1px solid var(--tm-danger)', boxShadow: 'var(--tm-shadow-lg)' }}
        >
          PDF export failed — please try again.
        </div>
      )}

      {/* ── Editor styles ─────────────────────────────────────────────────── */}
      <style jsx global>{`
        .notes-editor h1 {
          font-size: 1.75rem;
          font-weight: 700;
          color: var(--tm-text-primary);
          margin: 1rem 0 0.5rem;
          line-height: 1.2;
        }
        .notes-editor h2 {
          font-size: 1.35rem;
          font-weight: 700;
          color: var(--tm-text-primary);
          margin: 0.875rem 0 0.4rem;
          line-height: 1.3;
        }
        .notes-editor h3 {
          font-size: 1.15rem;
          font-weight: 700;
          color: var(--tm-text-primary);
          margin: 0.75rem 0 0.35rem;
          line-height: 1.35;
        }
        .notes-editor h4 {
          font-size: 1.05rem;
          font-weight: 600;
          color: var(--tm-text-primary);
          margin: 0.65rem 0 0.3rem;
          line-height: 1.4;
        }
        .notes-editor h5 {
          font-size: 0.95rem;
          font-weight: 600;
          color: var(--tm-text-primary);
          margin: 0.55rem 0 0.25rem;
          line-height: 1.4;
        }
        .notes-editor p {
          color: var(--tm-text-secondary);
          line-height: 1.7;
          margin-bottom: 0.5rem;
        }
        .notes-editor ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
          color: var(--tm-text-secondary);
        }
        .notes-editor ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin-bottom: 0.5rem;
          color: var(--tm-text-secondary);
        }
        .notes-editor li {
          margin-bottom: 0.25rem;
          line-height: 1.6;
        }
        .notes-editor strong {
          font-weight: 700;
          color: var(--tm-text-primary);
        }
        .notes-editor em {
          font-style: italic;
        }
        .notes-editor u {
          text-decoration: underline;
        }
        .notes-editor s {
          text-decoration: line-through;
        }

        /* Links, quotes, code and dividers (Tailwind's reset leaves them unstyled) */
        .notes-editor a {
          color: var(--tm-accent);
          text-decoration: underline;
          text-underline-offset: 2px;
          cursor: text;
        }
        .notes-editor blockquote {
          border-left: 3px solid var(--tm-border-strong);
          padding: 0.125rem 0 0.125rem 0.875rem;
          margin: 0.5rem 0;
        }
        .notes-editor blockquote p {
          color: var(--tm-text-muted);
        }
        .notes-editor code {
          font-family: var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.875em;
          padding: 0.1em 0.35em;
          border-radius: 4px;
          background-color: var(--tm-surface-raised);
          border: 1px solid var(--tm-border-subtle);
        }
        .notes-editor pre {
          margin: 0.5rem 0;
          padding: 0.625rem 0.75rem;
          border-radius: 8px;
          background-color: var(--tm-surface-raised);
          border: 1px solid var(--tm-border-subtle);
          white-space: pre-wrap;
        }
        .notes-editor pre code {
          padding: 0;
          border: 0;
          background: none;
          color: var(--tm-text-primary);
        }
        .notes-editor hr {
          border: 0;
          border-top: 1px solid var(--tm-border);
          margin: 1rem 0;
        }
        .notes-editor hr.ProseMirror-selectednode {
          border-top-color: var(--tm-accent);
        }

        /* Checklists */
        .notes-editor ul[data-type="taskList"] {
          list-style: none;
          padding-left: 0.125rem;
        }
        .notes-editor ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
        }
        .notes-editor ul[data-type="taskList"] li > label {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          height: 1.6em;
          user-select: none;
        }
        .notes-editor ul[data-type="taskList"] li > label input {
          width: 1rem;
          height: 1rem;
          margin: 0;
          cursor: pointer;
          accent-color: var(--tm-accent);
        }
        .notes-editor ul[data-type="taskList"] li > div {
          flex: 1;
          min-width: 0;
        }
        .notes-editor ul[data-type="taskList"] li > div > p {
          margin-bottom: 0;
        }
        .notes-editor ul[data-type="taskList"] li[data-checked="true"] > div {
          text-decoration: line-through;
          text-decoration-color: var(--tm-pencil);
        }
        .notes-editor ul[data-type="taskList"] li[data-checked="true"] > div p {
          color: var(--tm-text-muted);
        }

        /* Slash command: the "/query" being typed */
        .notes-editor .suggestion {
          color: var(--tm-accent);
        }

        /* Tables */
        .notes-editor .tableWrapper {
          overflow-x: auto;
          margin: 0.75rem 0;
        }
        .notes-editor table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
        }
        .notes-editor table td,
        .notes-editor table th {
          border: 1px solid var(--tm-border);
          padding: 0.4rem 0.6rem;
          vertical-align: top;
          position: relative;
          color: var(--tm-text-secondary);
        }
        .notes-editor table th {
          font-weight: 700;
          color: var(--tm-text-primary);
          background-color: var(--tm-surface-raised);
          text-align: left;
        }
        .notes-editor table .selectedCell {
          background-color: var(--tm-accent-subtle);
        }
        .notes-editor table .column-resize-handle {
          position: absolute;
          right: -2px;
          top: 0;
          bottom: 0;
          width: 4px;
          background-color: var(--tm-accent);
          pointer-events: none;
        }

        /* Highlight marks */
        .notes-editor mark {
          border-radius: 3px;
          padding: 0 2px;
          /* Pastel highlight colors, so keep light-mode ink on them in dark mode too.
             !important because Tiptap writes an inline color: inherit on every mark. */
          color: #171717 !important;
        }

        /* Pasted / inserted images */
        .notes-editor .note-img,
        .notes-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 8px;
          display: block;
          /* Subtle ring so images don't float invisibly on white */
          box-shadow: 0 0 0 1px var(--tm-border-subtle);
        }

        /* Resizable image wrapper (custom node view) */
        .notes-image-wrapper {
          position: relative;
          display: inline-block;
          max-width: 100%;
          margin: 0.75rem 0;
        }
        .notes-image-resize-handle {
          position: absolute;
          right: -6px;
          bottom: -6px;
          width: 14px;
          height: 14px;
          border-radius: 4px;
          background-color: var(--tm-accent);
          border: 2px solid var(--tm-surface);
          cursor: nwse-resize;
          touch-action: none;
        }
        .notes-image-resize-handle.is-dragging,
        .notes-image-resize-handle:hover {
          transform: scale(1.15);
        }
      `}</style>
    </div>
  );
};

export default NoteEditor;
