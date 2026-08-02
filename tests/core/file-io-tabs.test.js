// ========================================
// Feather MD -- File I/O: Tab-Aware Behavior (AUTO-016)
// ========================================
// Covers what AUTO-003's file-io.test.js doesn't: loadFileIntoNewTab()
// creating/activating a new tab without disturbing others, the MAX_TABS
// cap, watchActiveTabFile()'s watch/unwatch branching, and
// confirmDiscardChangesForTab()'s per-tab (possibly-inactive-tab) guard,
// including switching to a background tab before saving it.

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
import { setTauri } from '../../src/core/state.js';
import { config } from '../../src/core/config.js';
import * as tabsStore from '../../src/core/tabs.js';
import {
  initFileIO,
  loadFileIntoNewTab,
  confirmDiscardChangesForTab,
  syncGlobalsFromActiveTab,
  watchActiveTabFile,
} from '../../src/core/file-io.js';

function makeEditorAPI(initialValue = '') {
  let value = initialValue;
  return {
    getValue: vi.fn(() => value),
    setValue: vi.fn((v) => { value = v; }),
    focus: vi.fn(),
    createDocState: vi.fn((text = '') => ({ __fakeState: true, text })),
    getEditorState: vi.fn(() => ({ __fakeState: true, text: value })),
    applyEditorState: vi.fn((state) => { value = state?.text ?? value; }),
    getScrollRatio: vi.fn(() => 0),
    setScrollRatio: vi.fn(),
  };
}

let editorAPI;

beforeEach(() => {
  setTauri(false);
  tabsStore._resetForTests();
  tabsStore.initTabs({ __fakeState: true, text: '' });
  syncGlobalsFromActiveTab();
  isSaving = false;
  config.recentFiles = [];
  showUnsavedDialog.mockReset();
  writeTextFile.mockReset().mockResolvedValue(undefined);
  invoke.mockReset().mockResolvedValue(undefined);
  editorAPI = makeEditorAPI();
  initFileIO(editorAPI);
});

describe('loadFileIntoNewTab', () => {
  it('creates and activates a new tab without touching the previously active one', async () => {
    const firstTabId = tabsStore.getActiveTabId();

    await loadFileIntoNewTab('C:\\notes\\a.md', '# A');

    expect(tabsStore.getAllTabs().length).toBe(2);
    expect(tabsStore.getActiveTabId()).not.toBe(firstTabId);
    expect(tabsStore.getActiveTab().path).toBe('C:\\notes\\a.md');
    expect(tabsStore.getActiveTab().title).toBe('a.md');
    expect(editorAPI.getValue()).toBe('# A');
  });

  it('adds the opened file to recent files', async () => {
    await loadFileIntoNewTab('C:\\notes\\a.md', 'content');
    expect(config.recentFiles).toContain('C:\\notes\\a.md');
  });

  it('watches the new tab\'s file when running under Tauri', async () => {
    setTauri(true);
    await loadFileIntoNewTab('C:\\notes\\a.md', 'content');
    expect(invoke).toHaveBeenCalledWith('watch_file', { path: 'C:\\notes\\a.md' });
  });

  it('refuses to create a 7th tab beyond the cap, leaving existing tabs untouched', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) {
      await loadFileIntoNewTab(`C:\\notes\\${i}.md`, `content ${i}`);
    }
    expect(tabsStore.getAllTabs().length).toBe(tabsStore.MAX_TABS);
    const activeBefore = tabsStore.getActiveTabId();

    await loadFileIntoNewTab('C:\\notes\\overflow.md', 'nope');

    expect(tabsStore.getAllTabs().length).toBe(tabsStore.MAX_TABS);
    expect(tabsStore.getActiveTabId()).toBe(activeBefore);
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('6-tab limit'));
    consoleWarnSpy.mockRestore();
  });
});

describe('watchActiveTabFile', () => {
  it('invokes watch_file when the active tab has a path (Tauri mode)', async () => {
    setTauri(true);
    tabsStore.setActiveTabFile('C:\\notes\\a.md', false, 'LF');
    await watchActiveTabFile();
    expect(invoke).toHaveBeenCalledWith('watch_file', { path: 'C:\\notes\\a.md' });
  });

  it('invokes unwatch_file when the active tab has no path (Tauri mode)', async () => {
    setTauri(true);
    tabsStore.setActiveTabFile(null, false, 'LF');
    await watchActiveTabFile();
    expect(invoke).toHaveBeenCalledWith('unwatch_file');
  });

  it('does nothing outside Tauri', async () => {
    setTauri(false);
    tabsStore.setActiveTabFile('C:\\notes\\a.md', false, 'LF');
    await watchActiveTabFile();
    expect(invoke).not.toHaveBeenCalled();
  });
});

describe('confirmDiscardChangesForTab', () => {
  it('returns true immediately for a clean tab, without prompting', async () => {
    const tabId = tabsStore.getActiveTabId();
    const result = await confirmDiscardChangesForTab(tabId);
    expect(result).toBe(true);
    expect(showUnsavedDialog).not.toHaveBeenCalled();
  });

  it('returns true for a dirty tab when the user discards', async () => {
    tabsStore.setActiveTabDirty(true);
    const tabId = tabsStore.getActiveTabId();
    showUnsavedDialog.mockResolvedValue('discard');

    const result = await confirmDiscardChangesForTab(tabId);
    expect(result).toBe(true);
  });

  it('returns false for a dirty tab when the user cancels', async () => {
    tabsStore.setActiveTabDirty(true);
    const tabId = tabsStore.getActiveTabId();
    showUnsavedDialog.mockResolvedValue('cancel');

    const result = await confirmDiscardChangesForTab(tabId);
    expect(result).toBe(false);
  });

  it('checks the TARGET tab\'s dirty flag, not the active tab\'s', async () => {
    // Active tab is clean; a background tab is dirty.
    const activeId = tabsStore.getActiveTabId();
    const bgTab = tabsStore.createTab({ __fakeState: true, text: 'bg' });
    tabsStore.setActiveTabDirty(true); // dirties the newly-created (now active) bg tab
    tabsStore.switchTab(activeId); // switch back; active tab is clean again
    showUnsavedDialog.mockResolvedValue('discard');

    const result = await confirmDiscardChangesForTab(bgTab.id);

    // The prompt fired for the dirty background tab even though the
    // currently-active tab is clean -- proves the check is per-tab, not a
    // read of the (clean) active tab's state.
    expect(showUnsavedDialog).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it('switches to a background dirty tab before saving it, so the right content is written', async () => {
    setTauri(true);
    const tab1Id = tabsStore.getActiveTabId();
    editorAPI.setValue('tab1 content');
    tabsStore.setActiveTabFile('C:\\notes\\tab1.md', true, 'LF');

    const tab2 = tabsStore.createTab(editorAPI.createDocState('tab2 content'));
    editorAPI.applyEditorState(tab2.editorState);
    tabsStore.setActiveTabFile('C:\\notes\\tab2.md', true, 'LF');
    // tab2 is now active and dirty; switch back to tab1 as the user's focus.
    const t1 = tabsStore.switchTab(tab1Id);
    editorAPI.applyEditorState(t1.editorState);

    showUnsavedDialog.mockResolvedValue('save');

    const result = await confirmDiscardChangesForTab(tab2.id);

    expect(result).toBe(true);
    expect(writeTextFile).toHaveBeenCalledWith('C:\\notes\\tab2.md', 'tab2 content');
    expect(tabsStore.getTab(tab2.id).isDirty).toBe(false);
    // The view ends up showing tab2 (the one that was just saved) -- the
    // guard switched to it and did not switch back afterward, matching
    // main.js's own closeTab flow which removes the tab right after.
    expect(tabsStore.getActiveTabId()).toBe(tab2.id);
  });
});
