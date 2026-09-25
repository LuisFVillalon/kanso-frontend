'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { ResizableImage } from './extensions/ResizableImage';
import TiptapHighlight from '@tiptap/extension-highlight';
import TiptapUnderline from '@tiptap/extension-underline';
import TiptapTextAlign from '@tiptap/extension-text-align';
import { TableKit } from '@tiptap/extension-table';
import {
  ChevronDown, ChevronUp, Type, Download, Link2, FileText, Loader2,
  PanelLeftClose, PanelLeftOpen, Save, LibraryBig, X,
} from 'lucide-react';
import { EditorToolbar } from './EditorToolbar';
import { Note } from '@/app/types/notes';
import { Tag } from '@/app/types/task';
import { describeError, fetchLearningResources } from '@/app/lib/backend-api';
import { useToast } from '@/app/context/ToastContext';
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES } from './imageLimits';
import { LearningResourcesResponse } from '@/app/types/learningResources';
import { extractStructuredNoteContent } from '@/app/utils/noteContentExtractor';
import { useNotePdfExport } from '@/app/hooks/useNotePdfExport';
import { useNoteSession } from '@/app/hooks/useNoteSession';
import TagMultiSelect from '@/app/components/common/TagMultiSelect';

// Splits on whitespace and drops empty tokens, so blank/whitespace-only
// content (Tiptap's getText() for an "empty" doc) counts as zero words.
const countWords = (text: string) => {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note | null;
  allTags: Tag[];
  onUpdate: (id: number, changes: Partial<Pick<Note, 'title' | 'content' | 'tags'>>) => void | Promise<boolean>;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
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
  const [saveStatus, setSaveStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [emptyToast, setEmptyToast]     = useState(false);
  const [tagsOpen, setTagsOpen]         = useState(false);
  const [tagTogglingId, setTagTogglingId] = useState<number | null>(null);
  const [resourcesStatus, setResourcesStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [resourcesData, setResourcesData]     = useState<LearningResourcesResponse | null>(null);
  const [resourcesError, setResourcesError]   = useState('');
  const [resourcesOpen, setResourcesOpen]     = useState(false);
  const [wordCount, setWordCount]             = useState(0);

  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Editor setup ───────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5] },
      }),

      // Image: base64 data-URIs are stored in note HTML so images survive
      // page reloads without a separate upload service.
      ResizableImage.configure({
        allowBase64: true,
        HTMLAttributes: { class: 'note-img' },
      }),

      // Highlight: multicolor=true lets each mark carry its own background-color.
      TiptapHighlight.configure({ multicolor: true }),

      TiptapUnderline,

      TiptapTextAlign.configure({
        types: ['heading', 'paragraph'],
      }),

      TableKit.configure({ table: { resizable: true } }),
    ],
    content: note?.content ?? '',
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'notes-editor focus:outline-none min-h-[400px]' },

      // ── Tab indentation ────────────────────────────────────────────────────
      // Insert 4 spaces at the cursor when Tab is pressed outside a list.
      // Inside a list, StarterKit's built-in sink/lift behaviour is preserved
      // by returning false so ProseMirror continues its normal dispatch.
      handleKeyDown(view, event) {
        if (event.key !== 'Tab') return false;

        // Walk up the node ancestry; if any ancestor is a listItem, let
        // StarterKit handle the Tab (sinkListItem / liftListItem).
        const { $from } = view.state.selection;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'listItem') return false;
        }

        event.preventDefault();
        view.dispatch(view.state.tr.insertText('    '));
        return true;
      },

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
      const html = editor.getHTML();
      if (contentTimer.current) clearTimeout(contentTimer.current);
      contentTimer.current = setTimeout(() => {
        onUpdate(note.id, { content: html });
      }, 500);
    },
  });

  const { pdfLoading, pdfError, downloadPDF } = useNotePdfExport({ editor, title });
  // Return value unused here — the hook's side effect (opening/closing
  // note_sessions rows on the backend) still needs to run.
  useNoteSession(note);

  // Sync to active note — cancel in-flight debounces, update title + editor content.
  useEffect(() => {
    if (contentTimer.current) clearTimeout(contentTimer.current);
    if (titleTimer.current)   clearTimeout(titleTimer.current);
    setTitle(note?.title ?? '');
    setSaveStatus('idle');
    setResourcesOpen(false);
    setResourcesStatus('idle');
    setResourcesData(null);
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
    return () => {
      if (contentTimer.current) clearTimeout(contentTimer.current);
      if (titleTimer.current)   clearTimeout(titleTimer.current);
      if (savedTimer.current)   clearTimeout(savedTimer.current);
    };
  }, []);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!note) return;
    if (titleTimer.current) clearTimeout(titleTimer.current);
    titleTimer.current = setTimeout(() => {
      onUpdate(note.id, { title: value });
    }, 500);
  };

  const handleSave = async () => {
    if (!note || !editor) return;
    if (contentTimer.current) clearTimeout(contentTimer.current);
    if (titleTimer.current)   clearTimeout(titleTimer.current);
    setSaveStatus('saving');
    const result = await onUpdate(note.id, { title, content: editor.getHTML() });
    setSaveStatus(result === false ? 'error' : 'saved');
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
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

  const handleDownloadPDF = async () => {
    if (!note || !editor) return;

    if (editor.isEmpty) {
      setEmptyToast(true);
      setTimeout(() => setEmptyToast(false), 2500);
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

    if (resourcesOpen) {
      setResourcesOpen(false);
      return;
    }

    if (editor.isEmpty) {
      setEmptyToast(true);
      setTimeout(() => setEmptyToast(false), 2500);
      return;
    }

    setResourcesOpen(true);

    if (resourcesStatus === 'done' && resourcesData) return;
    if (resourcesStatus === 'loading') return;

    await runResourcesFetch();
  };

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
              className="flex px-2 py-1.5 rounded-md text-sm transition-colors"
              style={{ color: 'var(--tm-text-secondary)' }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--tm-surface-raised)';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--tm-text-primary)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--tm-text-secondary)';
              }}
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

  return (
    <div
      ref={containerRef}
      className="flex-1 flex flex-col overflow-hidden relative"
      style={{ backgroundColor: 'var(--tm-surface)' }}
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <EditorToolbar editor={editor} sidebarOpen={sidebarOpen} onToggleSidebar={onToggleSidebar}>
        {showExtendedActions && (
          <>
            {/* Learning Resources */}
            <button
              type="button"
              onClick={handleGetResources}
              title={resourcesOpen ? 'Close resources panel' : 'Get AI learning resources'}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              style={{
                color: resourcesOpen ? 'var(--tm-accent)' : 'var(--tm-text-secondary)',
                backgroundColor: resourcesOpen ? 'var(--tm-accent-subtle)' : undefined,
              }}
              onMouseEnter={e => {
                if (!resourcesOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--tm-surface-raised)';
              }}
              onMouseLeave={e => {
                if (!resourcesOpen) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
              }}
            >
              {resourcesStatus === 'loading' && !resourcesOpen
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <LibraryBig className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Resources</span>
            </button>

            {/* Download PDF */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              title="Download as PDF"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: 'var(--tm-text-secondary)' }}
              onMouseEnter={e => {
                if (!pdfLoading) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--tm-surface-raised)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '';
              }}
            >
              {pdfLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Download className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{pdfLoading ? 'Exporting…' : 'PDF'}</span>
            </button>
          </>
        )}

        {wordCount > 0 && (
          <span
            className="hidden sm:flex items-center gap-1 px-2 text-xs font-medium"
            style={{ color: 'var(--tm-text-muted)' }}
            title="Word count"
          >
            <Type className="w-3.5 h-3.5" />
            {wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}
          </span>
        )}

        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="btn flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium disabled:cursor-wait"
          style={saveStatus === 'saved' ? {
            backgroundColor: 'var(--tm-success-subtle)',
            color: 'var(--tm-success)',
          } : saveStatus === 'error' ? {
            backgroundColor: 'var(--tm-danger-subtle)',
            color: 'var(--tm-danger)',
          } : {
            backgroundColor: 'var(--tm-accent)',
            color: 'var(--tm-accent-text)',
          }}
        >
          {saveStatus === 'saving' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving…
            </>
          ) : saveStatus === 'saved' ? (
            'Saved ✓'
          ) : saveStatus === 'error' ? (
            'Failed to save'
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              Save
            </>
          )}
        </button>
      </EditorToolbar>

      {/* ── Main content: editor column + resources side panel ───────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor column */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* ── Title ──────────────────────────────────────────────────────── */}
          <div className="px-6 sm:px-10 pt-6 pb-2">
            <input
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder="Untitled Note"
              className="w-full text-2xl sm:text-3xl font-bold text-text-primary placeholder-text-muted focus:outline-none bg-transparent"
            />
          </div>

          {/* ── Tag picker (collapsible) ──────────────────────────────────────── */}
          {allTags.length > 0 && (
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

          <div className="mx-6 sm:mx-10 border-t border-border-subtle" />

          {/* ── Editor body ──────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 sm:px-10 py-4 scrollbar-custom">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* ── Resources side panel ──────────────────────────────────────────── */}
        <div
          className="shrink-0 flex flex-col border-l overflow-hidden transition-[width] duration-300 ease-in-out"
          style={{
            width: resourcesOpen ? '300px' : '0px',
            borderColor: 'var(--tm-border)',
            backgroundColor: 'var(--tm-surface-raised)',
          }}
        >
          <div className="w-[300px] flex flex-col h-full">
            {/* Panel header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b shrink-0"
              style={{ borderColor: 'var(--tm-border)' }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold" style={{ color: 'var(--tm-text-primary)' }}>Learning Resources</span>
                </div>
                {resourcesData?.topic && (
                  <div className="flex justify-start items-center gap-1 px-2 py-0.5 rounded-full w-fit" style={{ backgroundColor: 'var(--tm-accent-subtle)' }}>
                    <p className='text-xs'>Context caught: </p>
                    <span className="text-sm font-medium" style={{ color: 'var(--tm-accent)' }}>{resourcesData.topic}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setResourcesOpen(false)}
                className="p-1 rounded-md transition-colors"
                style={{ color: 'var(--tm-text-secondary)' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tm-surface)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto scrollbar-custom">
              {resourcesStatus === 'loading' && (
                <div className="px-4 py-10 flex flex-col items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--tm-accent)' }} />
                  <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>Analyzing your note…</p>
                </div>
              )}

              {resourcesStatus === 'error' && (
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

              {resourcesStatus === 'done' && resourcesData && resourcesData.message && (
                <div className="px-4 py-8 flex flex-col items-center gap-1 text-center">
                  <p className="text-sm" style={{ color: 'var(--tm-text-secondary)' }}>{resourcesData.message}</p>
                </div>
              )}

              {resourcesStatus === 'done' && resourcesData && !resourcesData.message && (
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
          /* Pastel highlight colors, so keep light-mode ink on them in dark mode too */
          color: #171717;
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
