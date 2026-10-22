import React from 'react';

interface DragHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
  /** When true, renders as a block element (no hidden sm:flex wrapping). */
  alwaysVisible?: boolean;
  /** 'col' drags a vertical divider to resize width (default). 'row' drags a horizontal divider to resize height. */
  orientation?: 'col' | 'row';
}

const DragHandle: React.FC<DragHandleProps> = ({ onMouseDown, alwaysVisible = false, orientation = 'col' }) => {
  const isRow = orientation === 'row';
  return (
    <div
      onMouseDown={onMouseDown}
      className={`${alwaysVisible ? 'flex' : 'hidden sm:flex'} ${
        isRow ? 'h-2 w-full items-center cursor-row-resize' : 'w-2 shrink-0 items-stretch cursor-col-resize'
      } group`}
    >
      <div
        className={`rounded-full transition-colors duration-150 ${isRow ? 'my-auto h-px w-full' : 'mx-auto w-px'}`}
        style={{ backgroundColor: 'var(--tm-border)' }}
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--tm-accent)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--tm-border)')}
      />
    </div>
  );
};

export default DragHandle;
