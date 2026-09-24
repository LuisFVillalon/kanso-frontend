'use client';

import React, { useState } from 'react';
import {
  Search, Filter, FolderCog, Blocks, Menu, SquarePlus, FilePlus,
  ChevronsLeft, ChevronsRight, ChevronDown, LayoutList, CalendarClock,
  Siren, SquareCheck, Timer, History, NotebookText, Settings, LogOut, Loader2,
  CalendarDays, type LucideIcon,
} from 'lucide-react';
import { FilterType, Tag } from '@/app/types/task';
import ProfileAvatar from '@/app/components/common/ProfileAvatar';
import Modal from '@/app/components/common/Modal';
import { useAuth } from '@/app/context/AuthContext';

interface TaskControlsProps {
  searchTerm: string;
  onSearchChange: (term: string) => void;
  filter: FilterType;
  sortOrder: Record<FilterType, 'asc' | 'desc'>;
  onFilterChange: (filter: FilterType) => void;
  noteSortOrder: 'asc' | 'desc';
  onNoteSortToggle: () => void;
  selectedTags: Tag[];
  onTagToggle: (tag: Tag) => void;
  showTagDropdown: boolean;
  onTagDropdownToggle: () => void;
  tags: Tag[];
  searchPlaceholder?: string;
  onCreateTask?: () => void;
  onNewNote?: () => void | Promise<void>;
  onViewNotes?: () => void;
  onViewCalendar?: () => void;
  onEditTag?: () => void;
  onEditHabit?: () => void;
  menuCollapsed: boolean;
  onToggleMenu: () => void;
  profileName?: string | null;
  profileAvatar?: string | null;
  onSettings?: () => void;
  onLogout?: () => void;
}

const FILTERS: { key: FilterType; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'All', icon: LayoutList },
  { key: 'active', label: 'Due date', icon: CalendarClock },
  { key: 'priority', label: 'Priority', icon: Siren },
  { key: 'duration', label: 'Est. time', icon: Timer },
  { key: 'completed', label: 'Completed', icon: SquareCheck },
];

const NavAction: React.FC<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  collapsed: boolean;
}> = ({ icon: Icon, label, onClick, collapsed }) => (
  <button
    onClick={onClick}
    className={`sidebar-item ${collapsed ? 'justify-center' : ''}`}
    title={collapsed ? label : undefined}
    aria-label={label}
  >
    <span className="icon-dot">
      <Icon className="w-4 h-4" />
    </span>
    {!collapsed && <span className="flex-1 text-left truncate">{label}</span>}
  </button>
);

export const TaskControls: React.FC<TaskControlsProps> = ({
  searchTerm,
  onSearchChange,
  filter,
  sortOrder,
  onFilterChange,
  noteSortOrder,
  onNoteSortToggle,
  selectedTags,
  onTagToggle,
  showTagDropdown,
  onTagDropdownToggle,
  tags,
  searchPlaceholder = 'Search tasks…',
  onCreateTask,
  onNewNote,
  onViewNotes,
  onViewCalendar,
  onEditTag,
  onEditHabit,
  menuCollapsed,
  onToggleMenu,
  profileName,
  profileAvatar,
  onSettings,
  onLogout,
}) => {
  const collapsed = menuCollapsed;
  const { isDemo } = useAuth();
  const [sortExpanded, setSortExpanded] = useState(true);
  const [tagsExpanded, setTagsExpanded] = useState(true);
  const [actionsExpanded, setActionsExpanded] = useState(true);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleNewNoteClick = async () => {
    if (!onNewNote || creatingNote) return;
    setCreatingNote(true);
    try {
      await onNewNote();
    } finally {
      setCreatingNote(false);
    }
  };

  const handleLogoutConfirm = async () => {
    setLoggingOut(true);
    try {
      await onLogout?.();
    } finally {
      setLoggingOut(false);
      setConfirmingLogout(false);
    }
  };

  const expandThenToggleTags = () => {
    if (collapsed) onToggleMenu();
    setTagsExpanded(true);
    if (!showTagDropdown) onTagDropdownToggle();
  };

  return (
    <>
      {/* Mobile hamburger — only needed while the drawer is off-canvas */}
      {collapsed && (
        <button
          onClick={onToggleMenu}
          className="fixed z-40 top-3 left-3 md:hidden flex items-center justify-center w-10 h-10 border border-border shadow-[var(--tm-shadow-md)]"
          style={{ backgroundColor: 'var(--tm-surface)', color: 'var(--tm-text-secondary)' }}
          aria-label="Open menu"
        >
          <Menu className="w-4 h-4" />
        </button>
      )}

      {/* Mobile backdrop while the drawer is open */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-40 bg-black/30 md:hidden animate-fade-backdrop"
          onClick={onToggleMenu}
          aria-hidden="true"
        />
      )}

      <aside
        className={`main-menu fixed inset-y-0 left-0 z-50 flex flex-col transition-[width,transform] duration-200 ease-out
          ${collapsed ? 'w-16 -translate-x-full md:translate-x-0' : 'w-72 translate-x-0'}`}
        style={{ backgroundColor: 'transparent' }}
        aria-label="Main menu"
      >
        {/* Brand + collapse toggle */}
        <div className="flex items-center h-14 px-3 border-b border-border-subtle flex-shrink-0 justify-between">
          {!collapsed && (
            <span className="flex items-center gap-2 pl-1">
              <span className="font-bold text-text-primary tracking-tight">kanso</span>
              {isDemo && (
                <span
                  className="chip"
                  title="A private sandbox with sample data, deleted after a day"
                  style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
                >
                  demo
                </span>
              )}
            </span>
          )}
          <button
            onClick={onToggleMenu}
            className={`flex items-center justify-center w-8 h-8 text-text-secondary hover:text-text-primary hover:bg-surface-raised transition-colors flex-shrink-0 ${collapsed ? 'mx-auto' : ''}`}
            aria-expanded={!collapsed}
            aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-border-subtle flex-shrink-0">
          {collapsed ? (
            <button
              onClick={onToggleMenu}
              className="w-10 h-10 flex items-center justify-center mx-auto text-text-muted hover:text-text-primary hover:bg-surface-raised transition-colors"
              title="Search"
              aria-label="Search"
            >
              <span className="icon-dot">
                <Search className="w-4 h-4" />
              </span>
            </button>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4 pointer-events-none" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="input-field pl-9"
              />
            </div>
          )}
        </div>

        {/* Create task / note */}
        {(onCreateTask || onNewNote) && (
          <div className="px-3 pt-3 flex-shrink-0 space-y-1.5">
            {onCreateTask && (
              <button
                onClick={onCreateTask}
                className={`sidebar-item btn-primary ${collapsed ? 'justify-center' : ''}`}
                style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
                title={collapsed ? 'Create Task' : undefined}
                aria-label="Create Task"
              >
                <SquarePlus className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="flex-1 text-left truncate">Create Task</span>}
              </button>
            )}
            {onNewNote && (
              <button
                onClick={handleNewNoteClick}
                disabled={creatingNote}
                className={`sidebar-item btn-primary disabled:opacity-70 disabled:cursor-wait ${collapsed ? 'justify-center' : ''}`}
                style={{ backgroundColor: 'var(--tm-accent)', color: 'var(--tm-accent-text)' }}
                title={collapsed ? 'Create Note' : undefined}
                aria-label="Create Note"
              >
                {creatingNote
                  ? <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                  : <FilePlus className="w-4 h-4 flex-shrink-0" />}
                {!collapsed && <span className="flex-1 text-left truncate">{creatingNote ? 'Creating…' : 'Create Note'}</span>}
              </button>
            )}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto scrollbar-custom px-3 py-3 space-y-5">
          {/* Sort & filter */}
          <div>
            {!collapsed && (
              <button
                onClick={() => setSortExpanded(prev => !prev)}
                className="sidebar-section-label-btn"
                aria-expanded={sortExpanded}
              >
                <span>Sort &amp; filter</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${sortExpanded ? '' : '-rotate-90'}`} />
              </button>
            )}
            {(collapsed || sortExpanded) && (
              <div className={`space-y-0.5 ${!collapsed ? 'mt-1' : ''}`}>
                {FILTERS.map(f => {
                  const Icon = f.icon;
                  const active = filter === f.key;
                  return (
                    <button
                      key={f.key}
                      onClick={() => onFilterChange(f.key)}
                      className={`sidebar-item ${active ? 'sidebar-item-active' : ''} ${collapsed ? 'justify-center' : ''}`}
                      title={collapsed ? f.label : undefined}
                      aria-pressed={active}
                    >
                      {active ? (
                        <Icon className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <span className="icon-dot">
                          <Icon className="w-4 h-4" />
                        </span>
                      )}
                      {!collapsed && <span className="flex-1 text-left truncate">{f.label}</span>}
                      {!collapsed && f.key !== 'all' && (
                        <span className="text-xs opacity-70 flex-shrink-0">
                          {sortOrder[f.key] === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  );
                })}
                {/* Notes order — independent of the task filters above; never
                    changes `filter`, so it can't reset or reorder tasks. */}
                <button
                  onClick={onNoteSortToggle}
                  className={`sidebar-item ${collapsed ? 'justify-center' : ''}`}
                  title={collapsed ? 'Notes order' : undefined}
                  aria-label="Toggle notes sort order"
                >
                  <span className="icon-dot">
                    <History className="w-4 h-4" />
                  </span>
                  {!collapsed && <span className="flex-1 text-left truncate">Notes order</span>}
                  {!collapsed && (
                    <span className="text-xs opacity-70 flex-shrink-0">
                      {noteSortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            {collapsed ? (
              <button
                onClick={expandThenToggleTags}
                className={`sidebar-item justify-center ${selectedTags.length > 0 ? 'sidebar-item-active' : ''}`}
                title="Tags"
                aria-label="Tags"
              >
                {selectedTags.length > 0 ? (
                  <Filter className="w-4 h-4" />
                ) : (
                  <span className="icon-dot">
                    <Filter className="w-4 h-4" />
                  </span>
                )}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setTagsExpanded(prev => !prev)}
                  className="sidebar-section-label-btn"
                  aria-expanded={tagsExpanded}
                >
                  <span>Tags{selectedTags.length > 0 ? ` (${selectedTags.length})` : ''}</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${tagsExpanded ? '' : '-rotate-90'}`} />
                </button>

                {tagsExpanded && (
                  <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto scrollbar-custom">
                    {tags.length === 0 && (
                      <p className="px-2.5 py-1.5 text-xs text-text-muted">No tags yet</p>
                    )}
                    {tags.map(tag => {
                      const checked = selectedTags.some(t => t.id === tag.id);
                      return (
                        <label
                          key={tag.id}
                          className={`sidebar-item cursor-pointer ${checked ? 'sidebar-item-active' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onTagToggle(tag)}
                            className="accent-accent flex-shrink-0"
                          />
                          <span className="w-2.5 h-2.5 flex-shrink-0" style={{ backgroundColor: tag.color }} />
                          <span className="flex-1 text-left truncate">{tag.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {selectedTags.length > 0 && (
                  <button
                    onClick={() => selectedTags.forEach(tag => onTagToggle(tag))}
                    className="mt-1.5 ml-2.5 text-xs font-medium text-text-muted hover:text-text-primary underline underline-offset-2"
                  >
                    Clear tags
                  </button>
                )}
              </>
            )}
          </div>

          {/* Quick actions */}
          <div>
            {!collapsed && (
              <button
                onClick={() => setActionsExpanded(prev => !prev)}
                className="sidebar-section-label-btn"
                aria-expanded={actionsExpanded}
              >
                <span>Quick actions</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${actionsExpanded ? '' : '-rotate-90'}`} />
              </button>
            )}
            {(collapsed || actionsExpanded) && (
              <div className={`space-y-0.5 ${!collapsed ? 'mt-1' : ''}`}>
                {onViewNotes && (
                  <NavAction icon={NotebookText} label="Manage notes" onClick={onViewNotes} collapsed={collapsed} />
                )}
                {onViewCalendar && (
                  <NavAction icon={CalendarDays} label="View Calendar" onClick={onViewCalendar} collapsed={collapsed} />
                )}
                {onEditTag && (
                  <NavAction icon={FolderCog} label="Manage tags" onClick={onEditTag} collapsed={collapsed} />
                )}
                {onEditHabit && (
                  <NavAction icon={Blocks} label="Manage habits" onClick={onEditHabit} collapsed={collapsed} />
                )}
              </div>
            )}
          </div>
        </div>

        {/* Account — profile, settings, logout */}
        {(onSettings || onLogout) && (
          <div className="border-t border-border-subtle p-3 flex-shrink-0 space-y-1.5">
            {!collapsed && profileName && (
              <div className="flex items-center gap-2.5 px-0.5 pb-1.5">
                <ProfileAvatar avatar={profileAvatar} name={profileName} size={32} />
                <div className="min-w-0">
                  <p className="text-[0.6875rem] uppercase tracking-wide text-text-muted leading-tight">Signed in as</p>
                  <p className="text-sm font-semibold text-text-primary truncate leading-tight">{profileName}</p>
                </div>
              </div>
            )}
            <div className="space-y-0.5">
              {onSettings && (
                collapsed ? (
                  <button
                    onClick={onSettings}
                    className="sidebar-item justify-center"
                    title="Account Settings"
                    aria-label="Account Settings"
                  >
                    <ProfileAvatar avatar={profileAvatar} name={profileName} size={28} />
                  </button>
                ) : (
                  <NavAction icon={Settings} label="Account Settings" onClick={onSettings} collapsed={collapsed} />
                )
              )}
              {onLogout && (
                <button
                  onClick={() => setConfirmingLogout(true)}
                  className={`sidebar-item ${collapsed ? 'justify-center' : ''}`}
                  style={{ color: 'var(--tm-danger)' }}
                  title={collapsed ? 'Logout' : undefined}
                  aria-label="Logout"
                >
                  <LogOut className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="flex-1 text-left truncate">Logout</span>}
                </button>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Logout confirmation */}
      {confirmingLogout && (
        <Modal onClose={() => setConfirmingLogout(false)} layer="top" panelClassName="modal-panel max-w-sm w-full p-6 space-y-4">
          <p className="text-center text-text-primary">Are you sure you want to log out?</p>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={() => setConfirmingLogout(false)}
              disabled={loggingOut}
              className="btn btn-secondary flex-1 py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleLogoutConfirm}
              disabled={loggingOut}
              className="btn flex-1 py-2 text-white flex items-center justify-center gap-1.5 disabled:cursor-wait"
              style={{ backgroundColor: 'var(--tm-danger)' }}
            >
              {loggingOut && <Loader2 className="w-4 h-4 animate-spin" />}
              {loggingOut ? 'Logging out…' : 'Logout'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
};

export default TaskControls;
