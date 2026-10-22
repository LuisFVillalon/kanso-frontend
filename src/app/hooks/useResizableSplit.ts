import { useRef, useCallback } from 'react';

interface UseResizableSplitOptions {
  /** Lower clamp in px (omit to skip clamping). */
  min?: number;
  /** Upper clamp in px (omit to skip clamping). */
  max?: number;
  /**
   * 'left'/'right' measure horizontally from the container's left/right edge (column resize).
   * 'top'/'bottom' measure vertically from the container's top/bottom edge (row resize).
   */
  anchor?: 'left' | 'right' | 'top' | 'bottom';
  onResize: (px: number) => void;
  onResizingChange?: (isResizing: boolean) => void;
}

/**
 * Returns a pointerdown handler that drives a draggable panel-resize interaction
 * for mouse, touch and pen. Attach it to the drag-handle element's onPointerDown prop.
 */
export function useResizableSplit(
  containerRef: React.RefObject<HTMLElement | null>,
  { min, max, anchor = 'left', onResize, onResizingChange }: UseResizableSplitOptions,
) {
  const isDragging = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture?.(e.pointerId);
      isDragging.current = true;
      onResizingChange?.(true);
      const isVertical = anchor === 'top' || anchor === 'bottom';
      document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev: PointerEvent) => {
        if (!isDragging.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let raw: number;
        switch (anchor) {
          case 'left': raw = ev.clientX - rect.left; break;
          case 'right': raw = rect.right - ev.clientX; break;
          case 'top': raw = ev.clientY - rect.top; break;
          case 'bottom': raw = rect.bottom - ev.clientY; break;
        }
        if (min !== undefined) raw = Math.max(min, raw);
        if (max !== undefined) raw = Math.min(max, raw);
        onResize(raw);
      };

      const onUp = () => {
        isDragging.current = false;
        onResizingChange?.(false);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [containerRef, min, max, anchor, onResize, onResizingChange],
  );

  return onPointerDown;
}
