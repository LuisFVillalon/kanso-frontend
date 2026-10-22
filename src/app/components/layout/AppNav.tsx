'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Archive, Blocks, CalendarDays, Ellipsis, FilePlus, FolderCog, House, LogOut, Moon, NotebookText,
  PanelLeftClose, PanelLeftOpen, Plus, Settings, SquarePlus, Sun, Trash2, type LucideIcon,
} from 'lucide-react';
import Logo from '@/app/components/common/Logo';
import { KansoMark } from '@/app/components/common/KansoLogo';
import Modal from '@/app/components/common/Modal';
import ProfileAvatar from '@/app/components/common/ProfileAvatar';
import { useMenu } from '@/app/hooks/useMenu';
import { useFocusTrap } from '@/app/hooks/useFocusTrap';
import { currentColorScheme, setColorScheme, type ColorScheme } from '@/app/lib/colorScheme';

export interface NavItem {
  href: string;
  label: string;
  /** The rail's label when it's collapsed, if shorter. */
  shortLabel?: string;
  icon: LucideIcon;
  /** Pressed after G to go here (see AppShell). */
  goKey?: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Home', icon: House, goKey: 'h' },
  { href: '/notes', label: 'Notes', icon: NotebookText, goKey: 'n' },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, goKey: 'c' },
  { href: '/archive', label: 'Archive', icon: Archive, goKey: 'a' },
  { href: '/trash', label: 'Recently deleted', shortLabel: 'Deleted', icon: Trash2 },
];

const [HOME, NOTES, CALENDAR, ARCHIVE, TRASH] = NAV_ITEMS;

export const isActivePath = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

interface AppNavProps {
  expanded: boolean;
  onToggleExpanded: () => void;
  profileName?: string | null;
  profileAvatar?: string | null;
  email?: string | null;
  isDemo?: boolean;
  onNewTask: () => void;
  onNewNote: () => void;
  onNewHabit: () => void;
  onSettings: () => void;
  onManageTags: () => void;
  onManageHabits: () => void;
  onLogout: () => void;
}

const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className="kbd" aria-hidden="true">{children}</kbd>
);

const MenuRow: React.FC<{
  icon: LucideIcon;
  label: string;
  onSelect: () => void;
  kbd?: string;
  danger?: boolean;
}> = ({ icon: Icon, label, onSelect, kbd, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onSelect}
    aria-keyshortcuts={kbd}
    className={`menu-row ${danger ? 'menu-row-danger' : ''}`}
  >
    <Icon className="w-4 h-4 flex-shrink-0" aria-hidden />
    <span className="flex-1 truncate">{label}</span>
    {kbd && <Kbd>{kbd}</Kbd>}
  </button>
);

/** Light / Dark, pinned over the OS setting: two radio menu items inside a menu, a radio group elsewhere. */
const AppearanceControl: React.FC<{ inMenu?: boolean }> = ({ inMenu }) => {
  const [scheme, setScheme] = useState<ColorScheme>(currentColorScheme);
  const pick = (next: ColorScheme) => {
    setColorScheme(next);
    setScheme(next);
  };
  return (
    <div className="menu-appearance">
      <span className="flex items-center gap-2.5">
        {scheme === 'dark' ? <Moon className="w-4 h-4" aria-hidden /> : <Sun className="w-4 h-4" aria-hidden />}
        Appearance
      </span>
      <div className="seg" role={inMenu ? 'group' : 'radiogroup'} aria-label="Appearance">
        {(['light', 'dark'] as const).map(option => (
          <button
            key={option}
            type="button"
            role={inMenu ? 'menuitemradio' : 'radio'}
            aria-checked={scheme === option}
            onClick={() => pick(option)}
            className="seg-btn"
          >
            {option === 'light' ? 'Light' : 'Dark'}
          </button>
        ))}
      </div>
    </div>
  );
};

const Who: React.FC<Pick<AppNavProps, 'profileName' | 'profileAvatar' | 'email' | 'isDemo'>> = ({
  profileName, profileAvatar, email, isDemo,
}) => (
  <div className="flex items-center gap-2.5 px-2.5 pt-2 pb-2.5 min-w-0">
    <ProfileAvatar avatar={profileAvatar} name={profileName} size={32} />
    <div className="min-w-0">
      <p className="text-sm font-bold text-text-primary truncate leading-tight flex items-center gap-1.5">
        <span className="truncate">{profileName?.trim() || 'Your account'}</span>
        {isDemo && (
          <span
            className="chip"
            title="A private sandbox with sample data, deleted after a day"
            style={{ backgroundColor: 'var(--tm-accent-subtle)', color: 'var(--tm-accent)' }}
          >
            demo
          </span>
        )}
      </p>
      {email && <p className="text-xs text-text-muted truncate leading-tight mt-0.5">{email}</p>}
    </div>
  </div>
);

const RailLink: React.FC<{ item: NavItem; active: boolean; expanded: boolean }> = ({ item, active, expanded }) => {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      aria-keyshortcuts={item.goKey && `g ${item.goKey}`}
      className="rail-item"
    >
      <span className="rail-pill"><Icon className="w-[18px] h-[18px]" aria-hidden /></span>
      <span className="rail-label">{expanded ? item.label : (item.shortLabel ?? item.label)}</span>
      {expanded && item.goKey && <Kbd>G {item.goKey.toUpperCase()}</Kbd>}
    </Link>
  );
};

const TabLink: React.FC<{ item: NavItem; active: boolean }> = ({ item, active }) => {
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className="tab-item">
      <span className="tab-pill"><Icon className="w-5 h-5" aria-hidden /></span>
      {item.shortLabel ?? item.label}
    </Link>
  );
};

/** A phone bottom sheet: Modal's backdrop and Escape, with focus held inside. */
const Sheet: React.FC<{ label: string; onClose: () => void; children: React.ReactNode }> = ({ label, onClose, children }) => {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);
  return (
    <Modal onClose={onClose} layer="raised" panelClassName="sheet-panel" overlayClassName="sheet-overlay">
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-grab" aria-hidden />
        {children}
      </div>
    </Modal>
  );
};

const SheetRow: React.FC<{
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  href?: string;
  current?: boolean;
  danger?: boolean;
}> = ({ icon: Icon, label, onClick, href, current, danger }) => {
  const body = (
    <>
      <Icon className="w-5 h-5 flex-shrink-0" aria-hidden />
      <span className="flex-1">{label}</span>
    </>
  );
  const className = `sheet-row ${danger ? 'menu-row-danger' : ''}`;
  return href ? (
    <Link href={href} onClick={onClick} aria-current={current ? 'page' : undefined} className={className}>{body}</Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>{body}</button>
  );
};

/**
 * The app's main navigation, on every signed-in page. From md up it's a
 * rail on the left (76px, labels under the icons; 224px expanded, with
 * keyboard hints); below md it's a bottom tab bar whose More tab opens a
 * sheet with everything else. It answers only "where am I, and where can I
 * go?" plus the two global menus: New, and the account menu on the avatar.
 */
const AppNav: React.FC<AppNavProps> = ({
  expanded, onToggleExpanded, profileName, profileAvatar, email, isDemo,
  onNewTask, onNewNote, onNewHabit, onSettings, onManageTags, onManageHabits, onLogout,
}) => {
  const pathname = usePathname() ?? '/';
  const newMenu = useMenu();
  const accountMenu = useMenu();
  const [sheet, setSheet] = useState<'new' | 'more' | null>(null);
  const closeSheet = () => setSheet(null);

  // Runs an action from a menu: the menu closes first, handing focus back to its button.
  const fromMenu = (menu: ReturnType<typeof useMenu>, action: () => void) => () => {
    menu.close();
    action();
  };
  const fromSheet = (action: () => void) => () => {
    closeSheet();
    action();
  };

  const moreActive = isActivePath(pathname, ARCHIVE.href) || isActivePath(pathname, TRASH.href);

  return (
    <>
      <nav aria-label="Main" className="app-rail hidden md:flex" data-expanded={expanded || undefined}>
        <div className="rail-brand">
          {expanded ? <Logo className="h-7 w-auto" /> : <KansoMark className="h-8 w-8" title="kanso" />}
        </div>

        {/* The rail is the menus' positioning box, so they open just past its edge. */}
        <div>
          <button {...newMenu.triggerProps} className="rail-new">
            <Plus className="w-5 h-5" aria-hidden />
            <span>New</span>
          </button>
          {newMenu.open && (
            <div {...newMenu.menuProps} aria-label="Create" className="menu-pop rail-pop-new">
              <MenuRow icon={SquarePlus} label="New task" kbd="T" onSelect={fromMenu(newMenu, onNewTask)} />
              <MenuRow icon={FilePlus} label="New note" kbd="N" onSelect={fromMenu(newMenu, onNewNote)} />
              <MenuRow icon={Blocks} label="New habit" onSelect={fromMenu(newMenu, onNewHabit)} />
            </div>
          )}
        </div>

        {[HOME, NOTES, CALENDAR, ARCHIVE].map(item => (
          <RailLink key={item.href} item={item} active={isActivePath(pathname, item.href)} expanded={expanded} />
        ))}
        <div className="flex-1" />
        <RailLink item={TRASH} active={isActivePath(pathname, TRASH.href)} expanded={expanded} />

        <div className="rail-foot">
          <div className="min-w-0">
            <button {...accountMenu.triggerProps} aria-label="Account menu" className="rail-account">
              <ProfileAvatar avatar={profileAvatar} name={profileName} size={30} />
              {expanded && <span className="truncate">{profileName?.trim() || 'Account'}</span>}
            </button>
            {accountMenu.open && (
              <div {...accountMenu.menuProps} aria-label="Account" className="menu-pop rail-pop-account">
                <Who profileName={profileName} profileAvatar={profileAvatar} email={email} isDemo={isDemo} />
                <div className="menu-sep" role="separator" />
                <MenuRow icon={Settings} label="Settings" onSelect={fromMenu(accountMenu, onSettings)} />
                <AppearanceControl inMenu />
                <MenuRow icon={FolderCog} label="Manage tags" onSelect={fromMenu(accountMenu, onManageTags)} />
                <MenuRow icon={Blocks} label="Manage habits" onSelect={fromMenu(accountMenu, onManageHabits)} />
                <div className="menu-sep" role="separator" />
                <MenuRow icon={LogOut} label="Log out" danger onSelect={fromMenu(accountMenu, onLogout)} />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onToggleExpanded}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse navigation' : 'Expand navigation'}
            title={expanded ? 'Collapse (remembered)' : 'Expand (remembered)'}
            className="rail-icon-btn"
          >
            {expanded ? <PanelLeftClose className="w-[18px] h-[18px]" /> : <PanelLeftOpen className="w-[18px] h-[18px]" />}
          </button>
        </div>
      </nav>

      <nav aria-label="Main" className="app-tabbar md:hidden">
        <TabLink item={HOME} active={isActivePath(pathname, HOME.href)} />
        <TabLink item={NOTES} active={isActivePath(pathname, NOTES.href)} />
        <button
          type="button"
          onClick={() => setSheet('new')}
          aria-haspopup="dialog"
          aria-expanded={sheet === 'new'}
          aria-label="New"
          className="tab-item"
        >
          <span className="tab-fab"><Plus className="w-6 h-6" aria-hidden /></span>
        </button>
        <TabLink item={CALENDAR} active={isActivePath(pathname, CALENDAR.href)} />
        <button
          type="button"
          onClick={() => setSheet('more')}
          aria-haspopup="dialog"
          aria-expanded={sheet === 'more'}
          aria-current={moreActive ? 'page' : undefined}
          className="tab-item"
        >
          <span className="tab-pill"><Ellipsis className="w-5 h-5" aria-hidden /></span>
          More
        </button>
      </nav>

      {sheet === 'new' && (
        <Sheet label="Create" onClose={closeSheet}>
          <p className="px-2 pb-1.5 text-[0.6875rem] font-bold uppercase tracking-wide text-text-muted">Create</p>
          <SheetRow icon={SquarePlus} label="New task" onClick={fromSheet(onNewTask)} />
          <SheetRow icon={FilePlus} label="New note" onClick={fromSheet(onNewNote)} />
          <SheetRow icon={Blocks} label="New habit" onClick={fromSheet(onNewHabit)} />
        </Sheet>
      )}

      {sheet === 'more' && (
        <Sheet label="More" onClose={closeSheet}>
          <SheetRow icon={ARCHIVE.icon} label={ARCHIVE.label} href={ARCHIVE.href} current={isActivePath(pathname, ARCHIVE.href)} onClick={closeSheet} />
          <SheetRow icon={TRASH.icon} label={TRASH.label} href={TRASH.href} current={isActivePath(pathname, TRASH.href)} onClick={closeSheet} />
          <SheetRow icon={Blocks} label="Manage habits" onClick={fromSheet(onManageHabits)} />
          <SheetRow icon={FolderCog} label="Manage tags" onClick={fromSheet(onManageTags)} />
          <SheetRow icon={Settings} label="Settings" onClick={fromSheet(onSettings)} />
          <AppearanceControl />
          <SheetRow icon={LogOut} label="Log out" danger onClick={fromSheet(onLogout)} />
        </Sheet>
      )}
    </>
  );
};

export default AppNav;
