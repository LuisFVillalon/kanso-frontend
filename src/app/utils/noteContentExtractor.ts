/**
 * Extracts a condensed, token-efficient representation of a note for the
 * AI learning-resources pipeline.
 *
 * Sending an entire note to the LLM burns tokens on prose that rarely helps
 * it infer a topic. Instead we pull out only the parts of a note that carry
 * signal about *what it's about*: the title, headings, highlighted text,
 * bullet/numbered list items, tables, and bold/italic/underline/strikethrough
 * runs. Plain, unstyled paragraph text is dropped entirely.
 *
 * Rather than flattening all of that into one run-on string, each category
 * is kept separate so the LLM receives structured sections. To bound token
 * usage the combined content is capped at MAX_CHARS, filled in order of
 * importance (title, headings, highlights, lists, styled text, tables) —
 * once a category can't fit in full, it and everything lower-priority is
 * left out entirely.
 */

import type { JSONContent } from '@tiptap/core';

const STYLE_MARKS = new Set(['bold', 'italic', 'underline', 'strike']);
const MAX_CHARS = 1500;

export interface StructuredNoteContent {
  title: string;
  headings: string[];
  highlights: string[];
  lists: string[];
  styledText: string[];
  tables: string[];
  /** Only populated when the note has none of the structured signals above. */
  plainText: string;
}

/** Wraps a text run in lightweight markdown-like markup for each mark it carries. */
function renderMarkedText(node: JSONContent): string {
  const text = node.text ?? '';
  if (!node.marks?.length) return text;

  return node.marks.reduce((out, mark) => {
    switch (mark.type) {
      case 'highlight':  return `==${out}==`;
      case 'bold':       return `**${out}**`;
      case 'italic':     return `*${out}*`;
      case 'underline':  return `_${out}_`;
      case 'strike':     return `~~${out}~~`;
      default:           return out;
    }
  }, text);
}

/** Which bucket a text run's marks belong to, in priority order (highlight beats plain style). */
function runCategory(node: JSONContent): 'highlight' | 'style' | null {
  if (!node.marks?.length) return null;
  if (node.marks.some(m => m.type === 'highlight')) return 'highlight';
  if (node.marks.some(m => STYLE_MARKS.has(m.type))) return 'style';
  return null;
}

/** Flattens a node subtree to its plain concatenated text, ignoring marks. */
function collectText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (!node.content) return '';
  return node.content.map(collectText).join('');
}

/** Collects the highlighted and styled text runs within a subtree, rendered with their markup. */
function collectNotableRuns(node: JSONContent, highlights: string[], styledText: string[]): void {
  if (node.type === 'text') {
    const category = runCategory(node);
    if (category === 'highlight') highlights.push(renderMarkedText(node));
    else if (category === 'style') styledText.push(renderMarkedText(node));
    return;
  }
  (node.content ?? []).forEach(child => collectNotableRuns(child, highlights, styledText));
}

const LIST_TYPES = new Set(['bulletList', 'orderedList', 'taskList']);

/** Bulleted, numbered and checklist items as "- text", "1. text" and "- [x] text" lines. */
function extractListItems(list: JSONContent, ordered: boolean, depth: number, lines: string[]): void {
  let index = 1;

  for (const item of list.content ?? []) {
    if (item.type !== 'listItem' && item.type !== 'taskItem') continue;

    const indent = '  '.repeat(depth);
    const checkbox = item.type === 'taskItem' ? (item.attrs?.checked ? ' [x]' : ' [ ]') : '';
    const bullet = (ordered ? `${index}.` : '-') + checkbox;
    const textParts: string[] = [];
    const nestedLists: JSONContent[] = [];

    for (const child of item.content ?? []) {
      if (LIST_TYPES.has(child.type ?? '')) {
        nestedLists.push(child);
      } else {
        const text = collectText(child).trim();
        if (text) textParts.push(text);
      }
    }

    lines.push(`${indent}${bullet} ${textParts.join(' ')}`.trimEnd());

    for (const nested of nestedLists) {
      extractListItems(nested, nested.type === 'orderedList', depth + 1, lines);
    }

    index += 1;
  }
}

function extractTable(table: JSONContent): string {
  const rows: string[] = [];

  for (const row of table.content ?? []) {
    if (row.type !== 'tableRow') continue;
    const cells = (row.content ?? [])
      .filter(c => c.type === 'tableCell' || c.type === 'tableHeader')
      .map(c => collectText(c).trim());
    if (cells.some(Boolean)) rows.push(cells.join(' | '));
  }

  return rows.join('\n');
}

interface Collectors {
  headings: string[];
  highlights: string[];
  lists: string[];
  styledText: string[];
  tables: string[];
}

function walk(node: JSONContent, out: Collectors): void {
  switch (node.type) {
    case 'heading': {
      const level = Number(node.attrs?.level ?? 1);
      const text = collectText(node).trim();
      if (text) out.headings.push(`${'#'.repeat(level)} ${text}`);
      return;
    }
    case 'bulletList':
    case 'taskList':
      extractListItems(node, false, 0, out.lists);
      return;
    case 'orderedList':
      extractListItems(node, true, 0, out.lists);
      return;
    case 'table': {
      const table = extractTable(node);
      if (table) out.tables.push(table);
      return;
    }
    case 'paragraph':
      collectNotableRuns(node, out.highlights, out.styledText);
      return;
    default:
      // Containers we don't special-case (doc, blockquote, etc.) — recurse
      // so headings/lists/tables/styled text nested inside them still surface.
      (node.content ?? []).forEach(child => walk(child, out));
  }
}

/** Includes as many whole items as fit within `remaining` chars. */
function fitCategory(items: string[], remaining: number): { included: string[]; used: number; fullyIncluded: boolean } {
  const included: string[] = [];
  let used = 0;

  for (const item of items) {
    if (used + item.length > remaining) {
      return { included, used, fullyIncluded: false };
    }
    included.push(item);
    used += item.length;
  }

  return { included, used, fullyIncluded: true };
}

/**
 * Builds the condensed, structured note representation sent to the
 * learning-resources pipeline: title, headings, highlights, list items,
 * styled text runs, and table rows — kept as separate categories rather
 * than a single run-on string. Unstyled paragraph text is intentionally
 * omitted.
 *
 * The combined content is capped at MAX_CHARS, filled greedily in order of
 * importance (title > headings > highlights > lists > styled text > tables).
 * Once a category doesn't fully fit in the remaining budget, it and every
 * lower-priority category is left out entirely.
 *
 * If the note carries none of those signals (e.g. it's just plain
 * paragraphs), that omission would leave the pipeline with almost nothing
 * to work from — so we fall back to the first MAX_CHARS characters of the
 * note's plain text instead.
 */
export function extractStructuredNoteContent(title: string, doc: JSONContent, plainText: string): StructuredNoteContent {
  const collected: Collectors = { headings: [], highlights: [], lists: [], styledText: [], tables: [] };
  (doc.content ?? []).forEach(child => walk(child, collected));

  const trimmedTitle = title.trim().slice(0, MAX_CHARS);

  const result: StructuredNoteContent = {
    title: trimmedTitle,
    headings: [],
    highlights: [],
    lists: [],
    styledText: [],
    tables: [],
    plainText: '',
  };

  const hasStructuredContent =
    collected.headings.length > 0 ||
    collected.highlights.length > 0 ||
    collected.lists.length > 0 ||
    collected.styledText.length > 0 ||
    collected.tables.length > 0;

  if (!hasStructuredContent) {
    result.plainText = plainText.trim().slice(0, MAX_CHARS);
    return result;
  }

  let remaining = Math.max(0, MAX_CHARS - trimmedTitle.length);

  const categories: [keyof Collectors, string[]][] = [
    ['headings', collected.headings],
    ['highlights', collected.highlights],
    ['lists', collected.lists],
    ['styledText', collected.styledText],
    ['tables', collected.tables],
  ];

  for (const [key, items] of categories) {
    if (remaining <= 0) break;

    const { included, used, fullyIncluded } = fitCategory(items, remaining);
    result[key] = included;
    remaining -= used;

    if (!fullyIncluded) break;
  }

  return result;
}
