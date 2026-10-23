'use client';

import React, { useEffect, useId, useRef } from 'react';
import { ChevronDown, Download, Ellipsis, Info, ListTree, Loader2 } from 'lucide-react';
import { KansoKeyIcon } from '@/app/components/common/KansoLogo';
import {
  MenuPanel, RING_STYLE, handleMenuArrowKeys, menuItemClass, useFocusOnOpen, usePopover,
} from './EditorToolbar';

interface MenuItem {
  key: string;
  label: string;
  hint?: string;
  Icon: React.ElementType;
  checked?: boolean;
  disabled?: boolean;
  run: () => void;
}

const pdfItem = (onDownloadPdf: () => void, pdfLoading: boolean): MenuItem => ({
  key: 'pdf', label: pdfLoading ? 'Exporting…' : 'Download PDF', Icon: pdfLoading ? Loader2 : Download, disabled: pdfLoading, run: onDownloadPdf,
});

interface NoteActionMenuProps {
  items: MenuItem[];
  pdfLoading: boolean;
  /** The trigger's accessible name and tooltip, and the menu's label. */
  name: string;
  /** A text trigger with a caret ("Export ▾"); otherwise the ⋯ icon. */
  text?: string;
}

/** A note-row dropdown of actions; stays open while a PDF exports, then closes. */
const NoteActionMenu: React.FC<NoteActionMenuProps> = ({ items, pdfLoading, name, text }) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFocusOnOpen(open, menuRef);

  // The PDF item reads "Exporting…" while busy; close once it finishes.
  const wasLoading = useRef(pdfLoading);
  useEffect(() => {
    if (wasLoading.current && !pdfLoading) setOpen(false);
    wasLoading.current = pdfLoading;
  }, [pdfLoading, setOpen]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        title={name}
        aria-label={name}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={`flex items-center justify-center gap-1 h-8 rounded-md outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)] ${text ? 'pl-2.5 pr-2 text-sm font-medium' : 'w-8'}`}
        style={RING_STYLE}
      >
        {text ? (
          <>
            <Download className="w-3.5 h-3.5" aria-hidden="true" />
            {text}
            <ChevronDown className="w-3 h-3" aria-hidden="true" />
          </>
        ) : <Ellipsis className="w-4 h-4" />}
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement="below"
          align="end"
          id={menuId}
          role="menu"
          aria-label={name}
          onKeyDown={handleMenuArrowKeys}
          className="py-1 min-w-[13rem]"
        >
          {items.map(({ key, label, hint, Icon, checked, disabled, run }) => (
            <button
              key={key}
              type="button"
              role={checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
              aria-checked={checked}
              disabled={disabled}
              onClick={() => {
                run();
                if (key !== 'pdf') setOpen(false);
              }}
              className={`${menuItemClass} disabled:cursor-wait`}
              style={{ ...RING_STYLE, color: checked ? 'var(--tm-accent)' : 'var(--tm-text-primary)' }}
            >
              <Icon className={`w-4 h-4 shrink-0 ${key === 'pdf' && pdfLoading ? 'animate-spin' : ''}`} style={{ color: checked ? 'var(--tm-accent)' : 'var(--tm-text-muted)' }} aria-hidden="true" />
              {label}
              {hint && <span className="ml-auto pl-4 text-xs" style={{ color: 'var(--tm-text-muted)' }}>{hint}</span>}
            </button>
          ))}
        </MenuPanel>
      )}
    </div>
  );
};

interface NoteMoreMenuProps {
  /** Omitted where PDF export isn't offered (the home-panel overlays), or sits in the bar's Export menu. */
  onDownloadPdf?: () => void;
  pdfLoading?: boolean;
  onShowDetails: () => void;
  /** Omitted where the outline has its own button in the bar. */
  outlineOpen?: boolean;
  onToggleOutline?: () => void;
  /** Omitted where focus mode isn't offered, or has its own button in the bar. */
  onFocusMode?: () => void;
}

/** "⋯": Note details, plus whichever of PDF, Outline and Focus mode the bar has no room for. */
const NoteMoreMenu: React.FC<NoteMoreMenuProps> = ({
  onDownloadPdf, pdfLoading = false, onShowDetails, outlineOpen = false, onToggleOutline, onFocusMode,
}) => (
  <NoteActionMenu
    name="More note actions"
    pdfLoading={pdfLoading}
    items={[
      ...(onDownloadPdf ? [pdfItem(onDownloadPdf, pdfLoading)] : []),
      { key: 'details', label: 'Note details', Icon: Info, run: onShowDetails },
      ...(onToggleOutline ? [{ key: 'outline', label: 'Outline', Icon: ListTree, checked: outlineOpen, run: onToggleOutline }] : []),
      ...(onFocusMode ? [{ key: 'focus', label: 'Focus mode', hint: 'Ctrl+Shift+F', Icon: KansoKeyIcon, run: onFocusMode }] : []),
    ]}
  />
);

/** "Export ▾": Download PDF. */
export const NoteExportMenu: React.FC<{ onDownloadPdf: () => void; pdfLoading?: boolean }> = ({ onDownloadPdf, pdfLoading = false }) => (
  <NoteActionMenu name="Export" text="Export" pdfLoading={pdfLoading} items={[pdfItem(onDownloadPdf, pdfLoading)]} />
);

export default NoteMoreMenu;
