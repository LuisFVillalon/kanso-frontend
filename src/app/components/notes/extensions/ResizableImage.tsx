'use client';

import React, { useCallback, useRef, useState } from 'react';
import TiptapImage from '@tiptap/extension-image';
import { NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

const MIN_WIDTH = 80;

// ─── ResizableImageComponent ───────────────────────────────────────────────────

const ResizableImageComponent: React.FC<NodeViewProps> = ({ node, updateAttributes, selected }) => {
  const { src, alt, title, width } = node.attrs as {
    src: string; alt?: string; title?: string; width?: number | null;
  };
  const imgRef = useRef<HTMLImageElement>(null);
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = imgRef.current?.getBoundingClientRect().width ?? 0;
    setDragging(true);

    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      updateAttributes({ width: Math.max(MIN_WIDTH, Math.round(startWidth + delta)) });
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [updateAttributes]);

  return (
    <NodeViewWrapper className="notes-image-wrapper" data-drag-handle>
      {/* An editor node view over an inline base64 data URL: there's nothing
          for next/image to optimize, and it needs a plain, resizable <img>. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        title={title}
        className="note-img"
        draggable={false}
        style={{
          width: width ? `${width}px` : undefined,
          outline: selected ? '2px solid var(--tm-accent)' : undefined,
          outlineOffset: selected ? '2px' : undefined,
        }}
      />
      {selected && (
        <span
          className={`notes-image-resize-handle${dragging ? ' is-dragging' : ''}`}
          onPointerDown={handlePointerDown}
        />
      )}
    </NodeViewWrapper>
  );
};

// ─── ResizableImage ─────────────────────────────────────────────────────────────
// Extends the base Image node with a persisted `width` attribute and a React
// node view that renders a drag handle for resizing the image in place.

export const ResizableImage = TiptapImage.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: element => {
          const styleWidth = element.style.width;
          if (styleWidth) return parseInt(styleWidth, 10) || null;
          const attrWidth = element.getAttribute('width');
          return attrWidth ? parseInt(attrWidth, 10) || null : null;
        },
        renderHTML: attributes => {
          if (!attributes.width) return {};
          return { style: `width: ${attributes.width}px` };
        },
      },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});

export default ResizableImage;
