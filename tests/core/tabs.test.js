// ========================================
// Feather MD -- Multi-Document Tab Model (AUTO-015 Phase 1)
// ========================================

import { describe, it, expect, beforeEach } from 'vitest';
import * as tabs from '../../src/core/tabs.js';

// Tabs only care about EditorState identity/equality in this test suite, not
// real CodeMirror behavior (that's covered by editor.js's own tests) -- plain
// tagged objects are enough to verify tabs.js's own bookkeeping.
let stateSeq = 0;
function fakeState(label) {
  return { __fakeState: true, id: ++stateSeq, label: label || `state-${stateSeq}` };
}

describe('Tabs -- initTabs', () => {
  beforeEach(() => {
    tabs._resetForTests();
  });

  it('starts with exactly one tab, active, titled Untitled', () => {
    const initial = fakeState('initial');
    tabs.initTabs(initial);
    const all = tabs.getAllTabs();
    expect(all.length).toBe(1);
    expect(all[0].title).toBe('Untitled');
    expect(all[0].isDirty).toBe(false);
    expect(tabs.getActiveTabId()).toBe(all[0].id);
    expect(tabs.getActiveTab().editorState).toBe(initial);
  });

  it('fires the onTabsChanged callback on init', () => {
    let calls = 0;
    tabs.initTabs(fakeState(), () => { calls++; });
    expect(calls).toBe(1);
  });
});

describe('Tabs -- createTab / MAX_TABS cap', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('creates and activates a new tab', () => {
    const before = tabs.getActiveTabId();
    const tab = tabs.createTab(fakeState('tab2'));
    expect(tab).toBeTruthy();
    expect(tabs.getAllTabs().length).toBe(2);
    expect(tabs.getActiveTabId()).toBe(tab.id);
    expect(tabs.getActiveTabId()).not.toBe(before);
  });

  it('numbers additional Untitled tabs sequentially', () => {
    tabs.createTab(fakeState());
    tabs.createTab(fakeState());
    const titles = tabs.getAllTabs().map((t) => t.title);
    expect(titles).toEqual(['Untitled', 'Untitled 2', 'Untitled 3']);
  });

  it('refuses to create a 7th tab beyond the 6-tab cap', () => {
    for (let i = 0; i < 5; i++) tabs.createTab(fakeState()); // now at 6 total
    expect(tabs.getAllTabs().length).toBe(tabs.MAX_TABS);
    expect(tabs.canCreateTab()).toBe(false);

    const result = tabs.createTab(fakeState());
    expect(result).toBeNull();
    expect(tabs.getAllTabs().length).toBe(tabs.MAX_TABS);
  });
});

describe('Tabs -- switchTab', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('switches the active tab and returns it', () => {
    const tab2 = tabs.createTab(fakeState('tab2'));
    const tab1Id = tabs.getAllTabs()[0].id;

    const result = tabs.switchTab(tab1Id);
    expect(result.id).toBe(tab1Id);
    expect(tabs.getActiveTabId()).toBe(tab1Id);
    expect(tab2.id).not.toBe(tab1Id);
  });

  it('returns null for an unknown tab id and leaves state unchanged', () => {
    const before = tabs.getActiveTabId();
    const result = tabs.switchTab(999999);
    expect(result).toBeNull();
    expect(tabs.getActiveTabId()).toBe(before);
  });
});

describe('Tabs -- saveActiveTabSnapshot', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('updates the active tab\'s editorState and scrollRatio', () => {
    const newState = fakeState('edited');
    tabs.saveActiveTabSnapshot(newState, 0.42);
    const active = tabs.getActiveTab();
    expect(active.editorState).toBe(newState);
    expect(active.scrollRatio).toBe(0.42);
  });

  it('preserves the snapshot across a switch away and back', () => {
    const tab1Id = tabs.getActiveTabId();
    const tab1State = fakeState('tab1-edited');
    tabs.saveActiveTabSnapshot(tab1State, 0.75);

    tabs.createTab(fakeState('tab2'));
    // tab2 is now active; switch back to tab1.
    const restored = tabs.switchTab(tab1Id);

    expect(restored.editorState).toBe(tab1State);
    expect(restored.scrollRatio).toBe(0.75);
  });
});

describe('Tabs -- closeTab', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('closing a non-active background tab does not change the active tab', () => {
    const tab1Id = tabs.getActiveTabId();
    const tab2 = tabs.createTab(fakeState('tab2')); // tab2 now active
    tabs.switchTab(tab1Id); // back to tab1

    const result = tabs.closeTab(tab2.id, () => fakeState('fresh'));

    expect(result).toBeNull(); // active tab (tab1) didn't change
    expect(tabs.getActiveTabId()).toBe(tab1Id);
    expect(tabs.getAllTabs().length).toBe(1);
  });

  it('closing the active tab activates a neighbor and returns it', () => {
    tabs.createTab(fakeState('tab2'));
    const tab3 = tabs.createTab(fakeState('tab3')); // tab3 active

    const result = tabs.closeTab(tab3.id, () => fakeState('fresh'));

    expect(result).toBeTruthy();
    expect(result.id).not.toBe(tab3.id);
    expect(tabs.getAllTabs().length).toBe(2);
    expect(tabs.getActiveTabId()).toBe(result.id);
  });

  it('closing the last remaining tab replaces it with a fresh Untitled tab, never zero tabs', () => {
    const onlyTabId = tabs.getActiveTabId();
    const freshState = fakeState('fresh');

    const result = tabs.closeTab(onlyTabId, () => freshState);

    expect(tabs.getAllTabs().length).toBe(1);
    expect(result).toBeTruthy();
    expect(result.id).not.toBe(onlyTabId);
    expect(result.editorState).toBe(freshState);
    expect(result.title).toBe('Untitled');
    expect(result.isDirty).toBe(false);
    expect(tabs.getActiveTabId()).toBe(result.id);
  });

  it('returns null for an unknown tab id', () => {
    const result = tabs.closeTab(999999, () => fakeState());
    expect(result).toBeNull();
    expect(tabs.getAllTabs().length).toBe(1);
  });
});

describe('Tabs -- setActiveTabDirty', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('sets the active tab\'s dirty flag', () => {
    tabs.setActiveTabDirty(true);
    expect(tabs.getActiveTab().isDirty).toBe(true);
    tabs.setActiveTabDirty(false);
    expect(tabs.getActiveTab().isDirty).toBe(false);
  });

  it('does not fire onTabsChanged when the value does not actually change', () => {
    let calls = 0;
    tabs._resetForTests();
    tabs.initTabs(fakeState(), () => { calls++; });
    calls = 0; // ignore the init call
    tabs.setActiveTabDirty(false); // already false -- no-op
    expect(calls).toBe(0);
    tabs.setActiveTabDirty(true);
    expect(calls).toBe(1);
  });

  it('only affects the active tab, not background tabs', () => {
    const tab1Id = tabs.getActiveTabId();
    tabs.setActiveTabDirty(true);
    tabs.createTab(fakeState('tab2')); // tab2 now active, clean by default

    expect(tabs.getActiveTab().isDirty).toBe(false);
    tabs.switchTab(tab1Id);
    expect(tabs.getActiveTab().isDirty).toBe(true);
  });
});

describe('Tabs -- setActiveTabFile', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('sets path/isDirty/lineEnding and derives the title from the basename', () => {
    tabs.setActiveTabFile('C:\\notes\\my-doc.md', true, 'CRLF');
    const active = tabs.getActiveTab();
    expect(active.path).toBe('C:\\notes\\my-doc.md');
    expect(active.title).toBe('my-doc.md');
    expect(active.isDirty).toBe(true);
    expect(active.lineEnding).toBe('CRLF');
  });

  it('regenerates a fresh Untitled title (excluding itself) when path is set back to null', () => {
    tabs.createTab(fakeState('tab2')); // "Untitled 2", now active
    tabs.setActiveTabFile('C:\\notes\\a.md', false, 'LF');
    expect(tabs.getActiveTab().title).toBe('a.md');

    // Reset this same tab back to untitled -- must not collide with "tab1"
    // (still titled "Untitled") and must not still think of itself as "a.md".
    tabs.setActiveTabFile(null, false, 'LF');
    expect(tabs.getActiveTab().title).toBe('Untitled 2');
  });

  it('does nothing when there is no active tab', () => {
    tabs._resetForTests();
    expect(() => tabs.setActiveTabFile('C:\\notes\\a.md', false, 'LF')).not.toThrow();
  });
});

describe('Tabs -- findTabByPath', () => {
  beforeEach(() => {
    tabs._resetForTests();
    tabs.initTabs(fakeState('tab1'));
  });

  it('returns null when no tab has a path', () => {
    expect(tabs.findTabByPath('C:\\notes\\a.md')).toBeNull();
  });

  it('returns null for a null/empty path', () => {
    expect(tabs.findTabByPath(null)).toBeNull();
    expect(tabs.findTabByPath('')).toBeNull();
  });

  it('finds a tab by exact path match', () => {
    tabs.setActiveTabFile('C:\\notes\\a.md', false, 'LF');
    const found = tabs.findTabByPath('C:\\notes\\a.md');
    expect(found).toBeTruthy();
    expect(found.id).toBe(tabs.getActiveTabId());
  });

  it('matches case-insensitively and across slash direction', () => {
    tabs.setActiveTabFile('C:\\Notes\\A.MD', false, 'LF');
    const found = tabs.findTabByPath('c:/notes/a.md');
    expect(found).toBeTruthy();
  });

  it('returns null when the path does not match any open tab', () => {
    tabs.setActiveTabFile('C:\\notes\\a.md', false, 'LF');
    expect(tabs.findTabByPath('C:\\notes\\b.md')).toBeNull();
  });
});
