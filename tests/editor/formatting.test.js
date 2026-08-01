// ========================================
// Feather MD -- Markdown Formatting Commands (AUTO-010)
// ========================================
// Covers: wrapSelection, toggleLinePrefix, insertLink/insertImage,
// insertTable -- both the empty-selection (insert-with-placeholder) and
// non-empty-selection (wrap-existing-text) paths for each.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initEditor } from '../../src/editor/editor.js';

describe('Editor -- Formatting: wrapSelection (bold/italic/strikethrough/code)', () => {
  let container, api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initEditor(container, vi.fn());
  });

  it('inserts marker pairs with the cursor between them when nothing is selected', () => {
    api.wrapSelection('**', '**');
    expect(api.getValue()).toBe('****');
    const pos = api.getCursorPosition();
    // Cursor should sit exactly between the two marker pairs (col 3, 1-indexed).
    expect(pos.col).toBe(3);
  });

  it('wraps a non-empty selection and keeps the wrapped text selected', () => {
    api.setValue('hello world');
    api.setSelection(0, 5); // "hello"
    api.wrapSelection('**', '**');
    expect(api.getValue()).toBe('**hello** world');
    expect(api.getSelectedText()).toBe('hello');
  });

  it('supports asymmetric-looking calls consistently for italic', () => {
    api.setValue('word');
    api.setSelection(0, 4);
    api.wrapSelection('*', '*');
    expect(api.getValue()).toBe('*word*');
  });

  it('supports inline code wrapping', () => {
    api.setValue('const x = 1');
    api.setSelection(0, 11);
    api.wrapSelection('`', '`');
    expect(api.getValue()).toBe('`const x = 1`');
  });

  it('supports strikethrough wrapping', () => {
    api.setValue('deleted');
    api.setSelection(0, 7);
    api.wrapSelection('~~', '~~');
    expect(api.getValue()).toBe('~~deleted~~');
  });
});

describe('Editor -- Formatting: toggleLinePrefix (heading/list/blockquote)', () => {
  let container, api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initEditor(container, vi.fn());
  });

  it('adds a heading prefix to the current line', () => {
    api.setValue('Title');
    api.setSelection(0, 0);
    api.toggleLinePrefix('## ');
    expect(api.getValue()).toBe('## Title');
  });

  it('removes the heading prefix on a second toggle (idempotent)', () => {
    api.setValue('## Title');
    api.setSelection(0, 0);
    api.toggleLinePrefix('## ');
    expect(api.getValue()).toBe('Title');
  });

  it('adds a bullet-list prefix to every line touched by the selection', () => {
    api.setValue('one\ntwo\nthree');
    api.setSelection(0, 13); // spans all three lines
    api.toggleLinePrefix('- ');
    expect(api.getValue()).toBe('- one\n- two\n- three');
  });

  it('removes bullet-list prefixes from every line when the first line already has one', () => {
    api.setValue('- one\n- two\n- three');
    api.setSelection(0, 20);
    api.toggleLinePrefix('- ');
    expect(api.getValue()).toBe('one\ntwo\nthree');
  });

  it('toggles blockquote prefix on a single line', () => {
    api.setValue('a quote');
    api.setSelection(0, 0);
    api.toggleLinePrefix('> ');
    expect(api.getValue()).toBe('> a quote');
  });

  it('detects and strips a variable-width ordered-list prefix via detectPattern', () => {
    api.setValue('12. an item');
    api.setSelection(0, 0);
    api.toggleLinePrefix('1. ', /^\d+\.\s/);
    expect(api.getValue()).toBe('an item');
  });

  it('adds a literal "1. " ordered-list prefix when none exists', () => {
    api.setValue('an item');
    api.setSelection(0, 0);
    api.toggleLinePrefix('1. ', /^\d+\.\s/);
    expect(api.getValue()).toBe('1. an item');
  });

  it('only adds the prefix to lines that do not already have it, when adding', () => {
    // First line already has it, but toggle-decision is based on the FIRST
    // line in the selection -- if it already has the prefix, this is a
    // remove pass for every line that has it (lines without it are untouched).
    api.setValue('- one\ntwo\n- three');
    api.setSelection(0, 18);
    api.toggleLinePrefix('- ');
    expect(api.getValue()).toBe('one\ntwo\nthree');
  });
});

describe('Editor -- Formatting: insertLink / insertImage', () => {
  let container, api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initEditor(container, vi.fn());
  });

  it('inserts a link with default placeholder text and selects the url', () => {
    api.insertLink();
    expect(api.getValue()).toBe('[link text](url)');
    expect(api.getSelectedText()).toBe('url');
  });

  it('uses the current selection as the link label', () => {
    api.setValue('click here');
    api.setSelection(0, 10);
    api.insertLink();
    expect(api.getValue()).toBe('[click here](url)');
    expect(api.getSelectedText()).toBe('url');
  });

  it('inserts an image with default placeholder alt text and selects the url', () => {
    api.insertImage();
    expect(api.getValue()).toBe('![alt text](url)');
    expect(api.getSelectedText()).toBe('url');
  });

  it('uses the current selection as the image alt text', () => {
    api.setValue('a diagram');
    api.setSelection(0, 9);
    api.insertImage();
    expect(api.getValue()).toBe('![a diagram](url)');
    expect(api.getSelectedText()).toBe('url');
  });
});

describe('Editor -- Formatting: insertTable', () => {
  let container, api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initEditor(container, vi.fn());
  });

  it('inserts a 2x2 GFM table skeleton on an empty document and selects the first header cell', () => {
    api.insertTable();
    expect(api.getValue()).toContain('| Header 1 | Header 2 |');
    expect(api.getValue()).toContain('| -------- | -------- |');
    expect(api.getValue()).toContain('| Cell 1   | Cell 2   |');
    expect(api.getSelectedText()).toBe('Header 1');
  });

  it('prefixes a leading blank line when inserted after existing content on the same line', () => {
    api.setValue('some text');
    api.setSelection(9, 9); // end of "some text"
    api.insertTable();
    expect(api.getValue().startsWith('some text\n\n| Header 1')).toBe(true);
  });

  it('does not add extra blank lines when the cursor is already alone on an empty line', () => {
    api.setValue('before\n\nafter');
    api.setSelection(7, 7); // the empty line between "before" and "after"
    api.insertTable();
    expect(api.getValue()).toBe('before\n| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n\nafter');
  });
});
