'use client';

// Always mounted (see TaskManager.tsx) as a fixed, full-viewport layer sitting
// behind the app's content — so the drawing sticks around as a background
// when the user leaves doodle mode instead of unmounting with the canvas.
// Rendered as the first child so plain DOM order (not z-index) keeps it
// visually behind later content — negative z-index would technically paint
// it "further back," but Chromium's hit-testing then loses it to <body>
// entirely, breaking pointer input even with pointer-events: auto.
// `active` toggles whether it captures pointer input; the toolbar itself
// lives in the header (see DoodleToolbar), controlling this canvas via
// props/ref.
//
// Persistence: localStorage is always the instant, synchronous local cache
// (written on every stroke) so the drawing never has a chance to be lost.
// The backend save (fetchDrawing/saveDrawingRemote/deleteDrawingRemote in
// lib/backend-api.ts) is the source of truth once it responds, but every
// call still silently falls back to the localStorage copy on failure (backend
// unreachable, request error, etc.) rather than surfacing anything to the
// user — since logout clears the localStorage cache (see TaskManager.tsx),
// a backend outage during a save is effectively invisible until the next
// login shows the drawing missing.

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { fetchDrawing, saveDrawingRemote, deleteDrawingRemote } from '@/app/lib/backend-api';
import { cacheDrawing, clearCachedDrawing, readCachedDrawing } from '@/app/lib/doodleDrawing';

const STROKE_WIDTH = 2.5;
const ERASER_WIDTH = 24;
const REMOTE_SAVE_DEBOUNCE_MS = 800;

export interface DoodleCanvasHandle {
  clear: () => void;
}

interface DoodleCanvasProps {
  active: boolean;
  color: string;
  isErasing: boolean;
}

const DoodleCanvas = forwardRef<DoodleCanvasHandle, DoodleCanvasProps>(({ active, color, isErasing }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const remoteSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');

    cacheDrawing(dataUrl);

    // Debounced backend save — every stroke-end calls saveDrawing(), but a
    // full-canvas PNG re-encode on every single stroke would be wasteful
    // over the network the way it isn't for the synchronous localStorage
    // write above, so only the last stroke in a burst actually sends.
    if (remoteSaveTimerRef.current) clearTimeout(remoteSaveTimerRef.current);
    remoteSaveTimerRef.current = setTimeout(() => {
      saveDrawingRemote(dataUrl).catch(() => {
        // Endpoint doesn't exist yet (or the request failed) — the
        // localStorage copy above is already the source of truth until it does.
      });
    }, REMOTE_SAVE_DEBOUNCE_MS);
  }, []);

  // Size the canvas to the viewport, preserving whatever is already drawn across resizes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width === 0 || height === 0) return;

      const prev = document.createElement('canvas');
      prev.width = canvas.width;
      prev.height = canvas.height;
      prev.getContext('2d')?.drawImage(canvas, 0, 0);

      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (prev.width && prev.height) {
        ctx.drawImage(prev, 0, 0, prev.width, prev.height, 0, 0, width, height);
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  // Restore a previously saved doodle once, after the canvas above has its
  // real size. Tries the backend first (source of truth once it exists),
  // falling back to the localStorage cache — unconditionally and silently,
  // since every backend call fails today until those endpoints ship.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const drawDataUrl = (dataUrl: string) => {
      const img = new Image();
      img.onload = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
      };
      img.src = dataUrl;
    };

    const loadFromLocalStorage = () => {
      const stored = readCachedDrawing();
      if (stored) drawDataUrl(stored);
    };

    fetchDrawing()
      .then(drawing => {
        if (!drawing) { loadFromLocalStorage(); return; }
        drawDataUrl(drawing.image_data_url);
        cacheDrawing(drawing.image_data_url);
      })
      .catch(loadFromLocalStorage);
  }, []);

  const getPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    canvasRef.current?.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !lastPointRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;

    const point = getPoint(e);
    ctx.globalCompositeOperation = isErasing ? 'destination-out' : 'source-over';
    ctx.strokeStyle = color;
    ctx.lineWidth = isErasing ? ERASER_WIDTH : STROKE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
  };

  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    lastPointRef.current = null;
    canvasRef.current?.releasePointerCapture(e.pointerId);
    saveDrawing();
  };

  useImperativeHandle(ref, () => ({
    clear: () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (remoteSaveTimerRef.current) clearTimeout(remoteSaveTimerRef.current);
      clearCachedDrawing();
      deleteDrawingRemote().catch(() => {
        // Endpoint doesn't exist yet (or the request failed) — the local clear above already stuck.
      });
    },
  }), []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 touch-none"
      style={{ cursor: isErasing ? 'cell' : 'crosshair', pointerEvents: active ? 'auto' : 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endStroke}
      onPointerLeave={endStroke}
    />
  );
});

DoodleCanvas.displayName = 'DoodleCanvas';

export default DoodleCanvas;
