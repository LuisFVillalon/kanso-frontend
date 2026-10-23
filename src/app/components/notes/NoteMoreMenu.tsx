'use client';

import React, { useEffect, useId, useRef } from 'react';
import { Download, Ellipsis, Focus, Info, ListTree, Loader2 } from 'lucide-react';
import {
  MenuPanel, RING_STYLE, handleMenuArrowKeys, menuItemClass, useFocusOnOpen, usePopover,
} from './EditorToolbar';

interface NoteMoreMenuProps {
  /** Omitted where the editor doesn't offer PDF export (the home-panel overlays). */
  onDownloadPdf?: () => void;
  pdfLoading?: boolean;
  onShowDetails: () => void;
  outlineOpen: boolean;
  onToggleOutline: () => void;
  /** Omitted where focus mode isn't offered. */
  onFocusMode?: () => void;
}

/** "⋯": Download PDF, Note details, Outline and Focus mode. */
const NoteMoreMenu: React.FC<NoteMoreMenuProps> = ({
  onDownloadPdf, pdfLoading = false, onShowDetails, outlineOpen, onToggleOutline, onFocusMode,
}) => {
  const { open, setOpen, containerRef, triggerRef } = usePopover<HTMLButtonElement>();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useFocusOnOpen(open, menuRef);

  const items: { key: string; label: string; hint?: string; Icon: React.ElementType; checked?: boolean; disabled?: boolean; run: () => void }[] = [
    ...(onDownloadPdf ? [{ key: 'pdf', label: pdfLoading ? 'Exporting…' : 'Download PDF', Icon: pdfLoading ? Loader2 : Download, disabled: pdfLoading, run: onDownloadPdf }] : []),
    { key: 'details', label: 'Note details', Icon: Info, run: onShowDetails },
    { key: 'outline', label: 'Outline', Icon: ListTree, checked: outlineOpen, run: onToggleOutline },
    ...(onFocusMode ? [{ key: 'focus', label: 'Focus mode', hint: 'Ctrl+Shift+F', Icon: Focus, run: onFocusMode }] : []),
  ];

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
        title="More: PDF, note details, outline, focus mode"
        aria-label="More note actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className="flex items-center justify-center w-8 h-8 rounded-md outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 text-[var(--tm-text-secondary)] hover:bg-[var(--tm-surface)] hover:text-[var(--tm-text-primary)]"
        style={RING_STYLE}
      >
        <Ellipsis className="w-4 h-4" />
      </button>

      {open && (
        <MenuPanel
          panelRef={menuRef}
          anchorRef={triggerRef}
          placement="below"
          align="end"
          id={menuId}
          role="menu"
          aria-label="More note actions"
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

export default NoteMoreMenu;
