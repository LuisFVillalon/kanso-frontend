import React from 'react';

interface CardShellProps {
  icon: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  headerAction?: React.ReactNode;
  /**
   * Dense dashboard-tile header (11px/600 uppercase label, tighter padding)
   * instead of the default responsive text-xs→md header. The root also gets
   * Tailwind's `group` class so a compact `headerAction` (the tile's
   * resize/expand/drag tool cluster) can reveal on hover/focus via
   * `group-hover:opacity-100` and stay visible on touch via
   * `[@media(hover:none)]:opacity-100`.
   */
  compact?: boolean;
}

export const CardShell: React.FC<CardShellProps> = ({ icon, header, children, headerAction, compact }) => {
  if (compact) {
    return (
      <div className="card-glass group h-full p-3.5 flex flex-col gap-2 overflow-hidden">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {header}
          </span>
          {headerAction && <div className="ml-auto flex items-center gap-1">{headerAction}</div>}
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className="card-glass h-full p-3 sm:p-4 lg:p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {icon}
        <span className="text-xs sm:text-sm md:text-base text-text-muted font-medium uppercase tracking-wide">
          {header}
        </span>
        {headerAction && <div className="ml-auto">{headerAction}</div>}
      </div>
      {children}
    </div>
  );
};
