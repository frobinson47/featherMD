// ========================================
// Feather MD -- Editor State-Swap Primitives (AUTO-015 Phase 1)
// ========================================
// Covers createDocState/getEditorState/applyEditorState -- the primitives
// tabs rely on to switch documents without rebuilding the CodeMirror view.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initEditor } from '../../src/editor/editor.js';

describe('Editor -- state-swap primitives', () => {
  let container, api;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    api = initEditor(container, vi.fn());
  });

  it('createDocState builds a standalone state without mounting it', () => {
    const state = api.createDocState('hello world');
    expect(state).toBeTruthy();
    // The live view is untouched -- creating a state doesn't display it.
    expect(api.getValue()).toBe('');
  });

  it('getEditorState returns the live view\'s current state', () => {
    api.setValue('current content');
    const state = api.getEditorState();
    expect(state.doc.toString()).toBe('current content');
  });

  it('applyEditorState swaps the live document to the given state', () => {
    const otherState = api.createDocState('# Other document');
    api.applyEditorState(otherState);
    expect(api.getValue()).toBe('# Other document');
  });

  it('round-trips: save current state, apply another, then restore the first', () => {
    api.setValue('document A');
    const stateA = api.getEditorState();

    const stateB = api.createDocState('document B');
    api.applyEditorState(stateB);
    expect(api.getValue()).toBe('document B');

    api.applyEditorState(stateA);
    expect(api.getValue()).toBe('document A');
  });

  it('preserves cursor/selection position across a state swap and back', () => {
    api.setValue('line one\nline two\nline three');
    api.setSelection(9, 17); // "line two"
    const stateA = api.getEditorState();
    expect(api.getSelectedText()).toBe('line two');

    const stateB = api.createDocState('unrelated content');
    api.applyEditorState(stateB);
    expect(api.getSelectedText()).toBe('');

    api.applyEditorState(stateA);
    expect(api.getSelectedText()).toBe('line two');
  });

  it('applyEditorState is a no-op when given a falsy state', () => {
    api.setValue('unchanged');
    api.applyEditorState(null);
    expect(api.getValue()).toBe('unchanged');
  });

  it('each createDocState() call is independent -- editing one does not affect another', () => {
    const stateA = api.createDocState('A');
    const stateB = api.createDocState('B');

    api.applyEditorState(stateA);
    api.setValue('A modified');
    const stateAModified = api.getEditorState();

    api.applyEditorState(stateB);
    expect(api.getValue()).toBe('B');

    api.applyEditorState(stateAModified);
    expect(api.getValue()).toBe('A modified');
  });
});
