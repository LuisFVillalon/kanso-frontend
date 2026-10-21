'use client';

import React, { useEffect, useRef } from 'react';
import { Search } from 'lucide-react';

/** "/" doesn't jump to search while typing somewhere else. */
const SLASH_IGNORED = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="menu"]';

interface HeaderSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * The page header's search field. "/" anywhere on the page focuses it, and
 * Escape clears it (or, when it's already empty, leaves it).
 */
const HeaderSearch: React.FC<HeaderSearchProps> = ({
  value, onChange, placeholder = 'Search tasks & notes', className = '',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest(SLASH_IGNORED)) return;
      // A modal is open over the page.
      if (document.querySelector('.modal-overlay.fixed')) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <label className={`header-search ${className}`}>
      <Search className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span className="sr-only">Search tasks and notes</span>
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key !== 'Escape') return;
          if (value) onChange('');
          else inputRef.current?.blur();
        }}
        placeholder={placeholder}
        aria-keyshortcuts="/"
      />
      {!value && <kbd className="kbd" aria-hidden="true">/</kbd>}
    </label>
  );
};

export default HeaderSearch;
