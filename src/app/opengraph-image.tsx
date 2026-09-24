import { ImageResponse } from 'next/og';

// Link-preview card (LinkedIn, Slack, iMessage, email). Rendered at build time.
export const alt = 'kanso: tasks, notes and habits in one calm place';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

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
          backgroundColor: '#F6F5F4',
          color: '#171717',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>kanso</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', fontSize: 76, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.15 }}>
          <span>Tasks, notes and habits in one&nbsp;</span>
          <span style={{ backgroundColor: '#FFB110', borderRadius: 9999, padding: '4px 32px' }}>calm</span>
          <span>&nbsp;place.</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#615D59' }}>
          <span>Next.js · FastAPI · Postgres · LLM</span>
          <span style={{ color: '#0075DE', fontWeight: 600 }}>Try the demo, no signup</span>
        </div>
      </div>
    ),
    size,
  );
}
