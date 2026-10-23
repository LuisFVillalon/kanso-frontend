// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportNotePdf } from './notePdfExport';

const FONTS = new URL('../../../../public/fonts/pdf/', import.meta.url);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('exportNotePdf', { timeout: 30_000 }, () => {
  it('fetches the fonts again on the next export after a failed one', async () => {
    let online = false;
    const fetched: string[] = [];
    vi.stubGlobal('window', { location: { origin: 'https://kanso.test' } });
    vi.stubGlobal('fetch', async (src: string) => {
      fetched.push(src);
      if (!online) throw new TypeError('Failed to fetch');
      return new Response(await readFile(new URL(src.split('/').pop()!, FONTS)));
    });
    const note = {
      title: 'Cell biology',
      doc: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ATP' }] }] },
    };

    await expect(exportNotePdf(note)).rejects.toThrow('Failed to fetch');
    const failedFetches = fetched.length;

    online = true;
    const blob = await exportNotePdf(note);
    expect(fetched.length).toBeGreaterThan(failedFetches);
    expect(blob.size).toBeGreaterThan(0);
  });
});
