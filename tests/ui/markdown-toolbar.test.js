// ========================================
// Feather MD -- Markdown Toolbar Wiring (AUTO-010)
// ========================================
// Verifies each #markdown-toolbar button's data-action dispatches to the
// correct editor API call. Formatting logic itself is covered by
// tests/editor/formatting.test.js -- this suite is purely about the
// button-to-API wiring in src/ui/markdown-toolbar.js.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initMarkdownToolbar } from '../../src/ui/markdown-toolbar.js';

const ACTIONS = [
  'format-bold',
  'format-italic',
  'format-strikethrough',
  'format-code',
  'format-link',
  'format-image',
  'format-heading',
  'format-unordered-list',
  'format-ordered-list',
  'format-blockquote',
  'format-table',
];

function buildToolbarDOM() {
  const toolbar = document.createElement('div');
  toolbar.id = 'markdown-toolbar';
  for (const action of ACTIONS) {
    const btn = document.createElement('button');
    btn.setAttribute('data-action', action);
    toolbar.appendChild(btn);
  }
  document.body.appendChild(toolbar);
  return toolbar;
}

function makeMockEditorAPI() {
  return {
    wrapSelection: vi.fn(),
    toggleLinePrefix: vi.fn(),
    insertLink: vi.fn(),
    insertImage: vi.fn(),
    insertTable: vi.fn(),
  };
}

describe('Markdown Toolbar -- button-to-API wiring', () => {
  let toolbar, api;

  beforeEach(() => {
    document.body.innerHTML = '';
    toolbar = buildToolbarDOM();
    api = makeMockEditorAPI();
    initMarkdownToolbar(api);
  });

  it('does not throw when #markdown-toolbar is absent from the DOM', () => {
    document.body.innerHTML = '';
    expect(() => initMarkdownToolbar(makeMockEditorAPI())).not.toThrow();
  });

  it('bold button calls wrapSelection with ** markers', () => {
    toolbar.querySelector('[data-action="format-bold"]').click();
    expect(api.wrapSelection).toHaveBeenCalledWith('**', '**');
  });

  it('italic button calls wrapSelection with * markers', () => {
    toolbar.querySelector('[data-action="format-italic"]').click();
    expect(api.wrapSelection).toHaveBeenCalledWith('*', '*');
  });

  it('strikethrough button calls wrapSelection with ~~ markers', () => {
    toolbar.querySelector('[data-action="format-strikethrough"]').click();
    expect(api.wrapSelection).toHaveBeenCalledWith('~~', '~~');
  });

  it('code button calls wrapSelection with ` markers', () => {
    toolbar.querySelector('[data-action="format-code"]').click();
    expect(api.wrapSelection).toHaveBeenCalledWith('`', '`');
  });

  it('link button calls insertLink', () => {
    toolbar.querySelector('[data-action="format-link"]').click();
    expect(api.insertLink).toHaveBeenCalled();
  });

  it('image button calls insertImage', () => {
    toolbar.querySelector('[data-action="format-image"]').click();
    expect(api.insertImage).toHaveBeenCalled();
  });

  it('heading button calls toggleLinePrefix with "## "', () => {
    toolbar.querySelector('[data-action="format-heading"]').click();
    expect(api.toggleLinePrefix).toHaveBeenCalledWith('## ');
  });

  it('unordered-list button calls toggleLinePrefix with "- "', () => {
    toolbar.querySelector('[data-action="format-unordered-list"]').click();
    expect(api.toggleLinePrefix).toHaveBeenCalledWith('- ');
  });

  it('ordered-list button calls toggleLinePrefix with "1. " and a detect pattern', () => {
    toolbar.querySelector('[data-action="format-ordered-list"]').click();
    expect(api.toggleLinePrefix).toHaveBeenCalledWith('1. ', /^\d+\.\s/);
  });

  it('blockquote button calls toggleLinePrefix with "> "', () => {
    toolbar.querySelector('[data-action="format-blockquote"]').click();
    expect(api.toggleLinePrefix).toHaveBeenCalledWith('> ');
  });

  it('table button calls insertTable', () => {
    toolbar.querySelector('[data-action="format-table"]').click();
    expect(api.insertTable).toHaveBeenCalled();
  });
});
