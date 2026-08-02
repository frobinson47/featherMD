// ========================================
// Feather MD -- Keyboard: Tab Shortcuts (AUTO-017)
// ========================================
// Covers Ctrl+T (new tab), Ctrl+W (close active tab), and Ctrl+Tab /
// Ctrl+Shift+Tab (cycle tabs), including that cycling wraps correctly and
// is a no-op with a single tab. Other keyboard.js bindings are mocked so
// this suite stays focused on the new tab shortcuts, not a full re-test of
// every existing binding.

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

vi.mock('../../src/core/file-io.js', () => ({
  openFile: vi.fn(),
  saveFile: vi.fn(),
  saveFileAs: vi.fn(),
  newFile: vi.fn(),
  confirmDiscardChanges: vi.fn().mockResolvedValue(true),
}));
vi.mock('../../src/core/sync.js', () => ({ setSyncEnabled: vi.fn() }));
vi.mock('../../src/ui/toolbar.js', () => ({
  setMenuChecked: vi.fn(),
  setActiveFontFamily: vi.fn(),
  setActiveTabSize: vi.fn(),
}));
vi.mock('../../src/ui/dialogs.js', () => ({
  toggleShortcutsModal: vi.fn(),
  openRecentFilesModal: vi.fn(),
}));
vi.mock('../../src/ui/themes.js', () => ({ cycleTheme: vi.fn() }));
vi.mock('../../src/ui/fullscreen.js', () => ({
  toggleFullscreen: vi.fn(),
  isFullscreenActive: vi.fn(() => false),
  exitFullscreen: vi.fn(),
}));
vi.mock('../../src/platform/window.js', () => ({
  hideToTray: vi.fn(),
  requestQuit: vi.fn(),
  isTrayActive: vi.fn(() => false),
}));

import * as tabsStore from '../../src/core/tabs.js';
import { initKeyboardShortcuts } from '../../src/core/keyboard.js';

function ctrlKey(key, shiftKey = false) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey, bubbles: true, cancelable: true }));
}

function makeEditorAPI() {
  return {
    setLineWrapping: vi.fn(),
    setLineNumbers: vi.fn(),
    setTabSize: vi.fn(),
    requestMeasure: vi.fn(),
  };
}

// initKeyboardShortcuts() registers document-level keydown listeners with no
// teardown -- calling it fresh per test would accumulate listeners across
// the whole file (each firing on every subsequent test's key dispatch,
// inflating call counts). Call it exactly once against a single, mutable
// handlers object; each test resets that object's methods and tabsStore's
// state instead of re-registering.
const tabHandlers = {
  onSwitchTab: vi.fn(),
  onCloseTab: vi.fn(),
  onNewTab: vi.fn(),
};

beforeAll(() => {
  initKeyboardShortcuts(makeEditorAPI(), tabHandlers);
});

beforeEach(() => {
  tabsStore._resetForTests();
  tabsStore.initTabs({ __fakeState: true });
  tabHandlers.onSwitchTab = vi.fn();
  tabHandlers.onCloseTab = vi.fn();
  tabHandlers.onNewTab = vi.fn();
  vi.clearAllMocks();
});

describe('Keyboard -- Ctrl+T (new tab)', () => {
  it('calls onNewTab', () => {
    ctrlKey('t');
    expect(tabHandlers.onNewTab).toHaveBeenCalledTimes(1);
  });

  it('works with the shifted key value too (Ctrl+Shift not held, but key reads "T" on some layouts)', () => {
    ctrlKey('T');
    expect(tabHandlers.onNewTab).toHaveBeenCalledTimes(1);
  });
});

describe('Keyboard -- Ctrl+W (close active tab)', () => {
  it('calls onCloseTab with the active tab id', () => {
    const activeId = tabsStore.getActiveTabId();
    ctrlKey('w');
    expect(tabHandlers.onCloseTab).toHaveBeenCalledWith(activeId);
  });
});

describe('Keyboard -- Ctrl+Tab / Ctrl+Shift+Tab (cycle tabs)', () => {
  it('does nothing with only one tab open', () => {
    ctrlKey('Tab');
    expect(tabHandlers.onSwitchTab).not.toHaveBeenCalled();
  });

  it('cycles forward to the next tab', () => {
    const tab1 = tabsStore.getActiveTabId();
    const tab2 = tabsStore.createTab({ __fakeState: true }).id;
    const tab3 = tabsStore.createTab({ __fakeState: true }).id;
    tabsStore.switchTab(tab1); // back to tab1, so "next" is deterministic

    ctrlKey('Tab');

    expect(tabHandlers.onSwitchTab).toHaveBeenCalledWith(tab2);
    void tab3;
  });

  it('cycles backward with Shift held', () => {
    const tab1 = tabsStore.getActiveTabId();
    tabsStore.createTab({ __fakeState: true });
    tabsStore.createTab({ __fakeState: true });
    tabsStore.switchTab(tab1); // back to tab1 (index 0)

    ctrlKey('Tab', true);

    // From index 0, backward wraps to the LAST tab.
    const all = tabsStore.getAllTabs();
    expect(tabHandlers.onSwitchTab).toHaveBeenCalledWith(all[all.length - 1].id);
  });

  it('wraps forward from the last tab back to the first', () => {
    const tab1 = tabsStore.getActiveTabId();
    tabsStore.createTab({ __fakeState: true }); // tab2, now active (last)

    ctrlKey('Tab');

    expect(tabHandlers.onSwitchTab).toHaveBeenCalledWith(tab1);
  });
});

describe('Keyboard -- no collisions with existing bindings', () => {
  it('Ctrl+T does not also trigger newFile (Ctrl+N is the separate, unrelated binding)', async () => {
    const { newFile } = await import('../../src/core/file-io.js');
    ctrlKey('t');
    expect(newFile).not.toHaveBeenCalled();
  });

  it('Ctrl+S (save) still works unaffected by the new tab bindings', async () => {
    const { saveFile } = await import('../../src/core/file-io.js');
    ctrlKey('s');
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(tabHandlers.onNewTab).not.toHaveBeenCalled();
    expect(tabHandlers.onCloseTab).not.toHaveBeenCalled();
  });
});
