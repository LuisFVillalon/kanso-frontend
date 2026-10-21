import { ImageResponse } from 'next/og';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

// Link-preview card (LinkedIn, Slack, iMessage, email). Rendered at build time.
export const alt = 'kanso: tasks, notes and habits in one calm place';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// The brand lockup (k key + wordmark), outlined, so no font is needed for it.
const lockupData = await readFile(join(process.cwd(), 'brand/logo/kanso-lockup-horizontal.svg'), 'base64');
const lockupSrc = `data:image/svg+xml;base64,${lockupData}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          backgroundColor: '#F4EFE4',
          color: '#191817',
          fontFamily: 'sans-serif',
        }}
      >
        <img src={lockupSrc} width={291} height={90} alt="" />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 76, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>Keep it kanso.</div>
          <div style={{ marginTop: 16, fontSize: 34, color: '#4A4640' }}>Tasks, notes and habits in one calm place.</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#4A4640' }}>
          <span>Next.js · FastAPI · Postgres · LLM</span>
          <span style={{ color: '#191817', fontWeight: 600 }}>Try the demo, no signup</span>
        </div>
      </div>
    ),
    size,
  );
}
