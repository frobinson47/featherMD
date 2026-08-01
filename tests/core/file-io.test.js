// ========================================
// Feather MD -- File I/O + State Contract Tests
// ========================================
// AUTO-003: pins down the contract between src/core/state.js's globals
// (currentFilePath, isDirty, lineEnding, isSaving) and src/core/file-io.js's
// use of them -- in particular the isSaving echo-suppression window
// (PERF-12) and confirmDiscardChanges()'s branching -- so a future change to
// either file, or to the tabs refactor built on top of them, has a test
// harness to diff against.
//
// UI-layer dependencies (dialogs/status-bar/toolbar) are mocked: this suite
// is about the state contract, not DOM rendering.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/ui/dialogs.js', () => ({
  showUnsavedDialog: vi.fn(),
}));
vi.mock('../../src/ui/status-bar.js', () => ({
  updateTitleBar: vi.fn(),
  updateStatusBar: vi.fn(),
}));
vi.mock('../../src/ui/toolbar.js', () => ({
  updateRecentFilesList: vi.fn(),
}));

// Complete stubs for every Tauri module file-io.js (via config.js's saveConfig,
// which every recent-files mutation triggers) or file-io.js itself dynamically
// imports in native mode. Kept complete -- not just the method each test
// exercises -- so saveConfig()'s native write path succeeds silently instead
// of logging a misleading "failed to save" error on every native-mode test.
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
  readTextFile: vi.fn().mockResolvedValue(''),
  exists: vi.fn().mockResolvedValue(false),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/api/path', () => ({
  appConfigDir: vi.fn().mockResolvedValue('/mock/config'),
  join: vi.fn((...parts) => parts.join('/')),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

import { showUnsavedDialog } from '../../src/ui/dialogs.js';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { setTauri } from '../../src/core/state.js';
import { config } from '../../src/core/config.js';
import {
  initFileIO,
  saveFile,
  saveFileAs,
  newFile,
  loadFileContent,
  removeRecentFile,
  clearRecentFiles,
  confirmDiscardChanges,
} from '../../src/core/file-io.js';

function makeEditorAPI(initialValue = '') {
  let value = initialValue;
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn((v) => { value = v; }),
    focus: vi.fn(),
  };
}

beforeEach(() => {
  setTauri(false);
  currentFilePath = null;
  isDirty = false;
  lineEnding = 'LF';
  isSaving = false;
  config.recentFiles = [];
  showUnsavedDialog.mockReset();
  writeTextFile.mockReset().mockResolvedValue(undefined);
  invoke.mockReset().mockResolvedValue(undefined);
  saveDialog.mockReset();
});

// -- confirmDiscardChanges() branching --

describe('State contract -- confirmDiscardChanges()', () => {
  it('returns true immediately without prompting when the buffer is clean', async () => {
    isDirty = false;
    const result = await confirmDiscardChanges();
    expect(result).toBe(true);
    expect(showUnsavedDialog).not.toHaveBeenCalled();
  });

  it('returns true when dirty and the user chooses discard', async () => {
    isDirty = true;
    showUnsavedDialog.mockResolvedValue('discard');
    const result = await confirmDiscardChanges();
    expect(result).toBe(true);
  });

  it('returns false when dirty and the user cancels', async () => {
    isDirty = true;
    showUnsavedDialog.mockResolvedValue('cancel');
    const result = await confirmDiscardChanges();
    expect(result).toBe(false);
  });

  it('saves and returns true when dirty and the user chooses save (native path)', async () => {
    setTauri(true);
    currentFilePath = 'C:\\notes\\a.md';
    isDirty = true;
    initFileIO(makeEditorAPI('content'));
    showUnsavedDialog.mockResolvedValue('save');

    const result = await confirmDiscardChanges();
    expect(result).toBe(true);
    expect(isDirty).toBe(false);
  });
});

// -- loadFileContent() state resets --

describe('State contract -- loadFileContent()', () => {
  it('sets currentFilePath, detects LF line ending, and clears the dirty flag', () => {
    const editorAPI = makeEditorAPI();
    initFileIO(editorAPI);
    isDirty = true;

    loadFileContent('C:\\notes\\a.md', 'line one\nline two');

    expect(currentFilePath).toBe('C:\\notes\\a.md');
    expect(lineEnding).toBe('LF');
    expect(isDirty).toBe(false);
    expect(editorAPI.setValue).toHaveBeenCalledWith('line one\nline two');
    expect(editorAPI.focus).toHaveBeenCalled();
  });

  it('detects CRLF line endings', () => {
    initFileIO(makeEditorAPI());
    loadFileContent('C:\\notes\\a.md', 'line one\r\nline two');
    expect(lineEnding).toBe('CRLF');
  });

  it('accepts a null path (in-memory content) without adding to recent files', () => {
    const editorAPI = makeEditorAPI();
    initFileIO(editorAPI);
    config.recentFiles = [];

    loadFileContent(null, 'scratch content');

    expect(currentFilePath).toBeNull();
    expect(config.recentFiles).toEqual([]);
  });

  it('adds a real path to recent files, most-recent-first', () => {
    initFileIO(makeEditorAPI());
    config.recentFiles = ['C:\\notes\\old.md'];

    loadFileContent('C:\\notes\\new.md', 'x');

    expect(config.recentFiles[0]).toBe('C:\\notes\\new.md');
    expect(config.recentFiles).toContain('C:\\notes\\old.md');
  });
});

// -- newFile() guard behavior --

describe('State contract -- newFile()', () => {
  it('resets state to a clean, path-less buffer when the buffer was already clean', async () => {
    const editorAPI = makeEditorAPI('old content');
    initFileIO(editorAPI);
    currentFilePath = 'C:\\notes\\a.md';
    isDirty = false;
    lineEnding = 'CRLF';

    await newFile();

    expect(currentFilePath).toBeNull();
    expect(isDirty).toBe(false);
    expect(lineEnding).toBe('LF');
    expect(editorAPI.setValue).toHaveBeenCalledWith('');
  });

  it('does NOT reset state when dirty and the user cancels the discard prompt', async () => {
    const editorAPI = makeEditorAPI('unsaved work');
    initFileIO(editorAPI);
    currentFilePath = 'C:\\notes\\a.md';
    isDirty = true;
    showUnsavedDialog.mockResolvedValue('cancel');

    await newFile();

    // Guard must short-circuit before touching any state.
    expect(currentFilePath).toBe('C:\\notes\\a.md');
    expect(editorAPI.setValue).not.toHaveBeenCalled();
  });
});

// -- saveFile() / isSaving echo-suppression window (PERF-12) --

describe('State contract -- saveFile() isSaving echo-suppression window', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('sets isSaving during the write and holds it true for the full echo window after completion', async () => {
    setTauri(true);
    currentFilePath = 'C:\\notes\\a.md';
    const editorAPI = makeEditorAPI('saved content');
    initFileIO(editorAPI);

    const savePromise = saveFile();
    await vi.advanceTimersByTimeAsync(0);
    await savePromise;

    // The write itself has finished (isDirty cleared), but the echo-suppression
    // window (500ms) has NOT yet elapsed -- isSaving must still read true here,
    // otherwise a file-watcher event racing in immediately after a save would
    // be misread as an external edit.
    expect(isDirty).toBe(false);
    expect(isSaving).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(isSaving).toBe(false);
  });

  it('still clears isSaving after the echo window even if the write fails', async () => {
    setTauri(true);
    currentFilePath = 'C:\\notes\\a.md';
    initFileIO(makeEditorAPI('content'));

    writeTextFile.mockRejectedValue(new Error('disk full'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    isDirty = true;
    const savePromise = saveFile();
    await vi.advanceTimersByTimeAsync(0);
    await savePromise;

    // A failed write must not silently clear the dirty flag (data loss), but
    // the echo-suppression window's cleanup must still run regardless.
    expect(isDirty).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(isSaving).toBe(false);

    consoleErrorSpy.mockRestore();
  });
});

// -- saveFileAs() watcher re-subscription contract --

describe('State contract -- saveFileAs() watcher re-subscription', () => {
  it('re-points the file watcher only when Save As targets a different path than before', async () => {
    setTauri(true);
    currentFilePath = 'C:\\notes\\old.md';
    initFileIO(makeEditorAPI('content'));

    saveDialog.mockResolvedValue('C:\\notes\\new.md');

    await saveFileAs();

    expect(currentFilePath).toBe('C:\\notes\\new.md');
    expect(isDirty).toBe(false);
    expect(invoke).toHaveBeenCalledWith('watch_file', { path: 'C:\\notes\\new.md' });
  });
});

// -- Recent files list mutation --

describe('State contract -- recent files list', () => {
  it('removeRecentFile drops only the matching path', () => {
    config.recentFiles = ['a.md', 'b.md', 'c.md'];
    removeRecentFile('b.md');
    expect(config.recentFiles).toEqual(['a.md', 'c.md']);
  });

  it('clearRecentFiles empties the list', () => {
    config.recentFiles = ['a.md', 'b.md'];
    clearRecentFiles();
    expect(config.recentFiles).toEqual([]);
  });
});
