// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import { createTabKeyHandler } from './tabKeys';

let editor: Editor | null = null;

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const makeEditor = (content: string, defer?: () => boolean) => {
  editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem.configure({ nested: true }), TableKit],
    content,
    editorProps: { handleKeyDown: createTabKeyHandler(defer) },
  });
  return editor;
};

/** Runs the editor's keydown props the way ProseMirror does; true when one handled the key. */
const press = (e: Editor, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, ...init });
  const handled = e.view.someProp('handleKeyDown', f => f(e.view, event)) ?? false;
  return { handled, prevented: event.defaultPrevented };
};

describe('note editor Tab key', () => {
  it('indents a paragraph with four spaces', () => {
    const e = makeEditor('<p>Hello</p>');
    e.commands.setTextSelection(1);
    expect(press(e, 'Tab')).toEqual({ handled: true, prevented: true });
    expect(e.getText()).toBe('    Hello');
  });

  it('never takes Shift+Tab, so focus can move back out of the editor', () => {
    const e = makeEditor('<p>Hello</p>');
    e.commands.setTextSelection(1);
    expect(press(e, 'Tab', { shiftKey: true }).prevented).toBe(false);
    expect(e.getText()).toBe('Hello');
  });

  it('lets Tab move focus on after Escape, then indents again', () => {
    const e = makeEditor('<p>Hello</p>');
    e.commands.setTextSelection(1);
    press(e, 'Escape');
    expect(press(e, 'Tab').prevented).toBe(false);
    expect(e.getText()).toBe('Hello');
    expect(press(e, 'Tab').prevented).toBe(true);
    expect(e.getText()).toBe('    Hello');
  });

  it('forgets an Escape once another key is pressed', () => {
    const e = makeEditor('<p>Hello</p>');
    e.commands.setTextSelection(1);
    press(e, 'Escape');
    press(e, 'a');
    expect(press(e, 'Tab').prevented).toBe(true);
  });

  it('leaves Tab to checklists, so items nest instead of gaining spaces', () => {
    const e = makeEditor('<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>One</p></li><li data-type="taskItem" data-checked="false"><p>Two</p></li></ul>');
    e.commands.setTextSelection(e.state.doc.content.size - 3);
    press(e, 'Tab');
    expect(e.getText()).not.toContain('    ');
    expect((e.getJSON() as JSONContent).content?.[0].content?.[0].content?.[1]?.type).toBe('taskList');
  });

  it('leaves Tab to tables, which move to the next cell', () => {
    const e = makeEditor('<table><tr><td><p>A</p></td><td><p>B</p></td></tr></table>');
    e.commands.setTextSelection(4);
    const before = e.state.selection.from;
    press(e, 'Tab');
    expect(e.getText()).not.toContain('    ');
    expect(e.state.selection.from).toBeGreaterThan(before);
  });

  it('defers while something else owns Tab, such as the slash menu', () => {
    const e = makeEditor('<p>Hello</p>', () => true);
    e.commands.setTextSelection(1);
    expect(press(e, 'Tab').prevented).toBe(false);
    expect(e.getText()).toBe('Hello');
  });
});
