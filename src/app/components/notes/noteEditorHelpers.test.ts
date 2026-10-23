// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/app/lib/supabase', () => ({ supabase: {} }));
import { normalizeLinkHref } from './LinkEditor';
import { formatTimeSpent, readingMinutes } from './NoteDetails';
import { extractStructuredNoteContent } from '@/app/utils/noteContentExtractor';

describe('normalizeLinkHref', () => {
  it('keeps web, mail and phone links as typed', () => {
    expect(normalizeLinkHref('https://kanso.app/notes')).toBe('https://kanso.app/notes');
    expect(normalizeLinkHref('  http://example.com ')).toBe('http://example.com');
    expect(normalizeLinkHref('mailto:prof@school.edu')).toBe('mailto:prof@school.edu');
    expect(normalizeLinkHref('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('adds https:// to a bare address and mailto: to an email address', () => {
    expect(normalizeLinkHref('khanacademy.org/science')).toBe('https://khanacademy.org/science');
    expect(normalizeLinkHref('localhost:3000')).toBe('https://localhost:3000');
    expect(normalizeLinkHref('prof@school.edu')).toBe('mailto:prof@school.edu');
  });

  it('refuses scripts, data URLs and text that is not an address', () => {
    expect(normalizeLinkHref('javascript:alert(1)')).toBeNull();
    expect(normalizeLinkHref('data:text/html,hi')).toBeNull();
    expect(normalizeLinkHref('two words')).toBeNull();
    expect(normalizeLinkHref('   ')).toBeNull();
  });
});

describe('note details', () => {
  it('formats time spent', () => {
    expect(formatTimeSpent(20)).toBe('Under a minute');
    expect(formatTimeSpent(8 * 60 + 30)).toBe('8 min');
    expect(formatTimeSpent(60 * 60)).toBe('1 h');
    expect(formatTimeSpent(72 * 60)).toBe('1 h 12 min');
  });

  it('rounds reading time to whole minutes, at least one for any text', () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(40)).toBe(1);
    expect(readingMinutes(1000)).toBe(5);
  });
});

describe('extractStructuredNoteContent with checklists', () => {
  it('lists checklist items with their ticks for the AI resources request', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read chapter 4' }] }] },
          {
            type: 'taskItem', attrs: { checked: false }, content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'Practice problems' }] },
              { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Set 2' }] }] }] },
            ],
          },
        ],
      }],
    };
    const result = JSON.stringify(extractStructuredNoteContent('Week 4', doc, 'Read chapter 4 Practice problems Set 2'));
    expect(result).toContain('- [x] Read chapter 4');
    expect(result).toContain('- [ ] Practice problems');
    expect(result).toContain('  - [ ] Set 2');
  });
});
