// ========================================
// Feather MD — Multi-Document Tab Model (AUTO-015 Phase 1)
// ========================================
// Owns the list of open tabs and which one is active. Each tab holds its own
// CodeMirror EditorState snapshot (doc, cursor, selection, history) plus a
// scroll ratio (CodeMirror does not persist scroll position in EditorState,
// so it has to be tracked alongside it here). Switching tabs is just
// view.setState() + restoring the scroll ratio -- no re-parsing.
//
// Capped at MAX_TABS (6, per the 2026-08-01 decision recorded in
// .ai/DECISIONS.md) -- no overflow-scroll UI is built for more than that.
// Closing the last remaining tab replaces it with a fresh empty Untitled tab
// rather than leaving zero tabs open.
//
// File I/O, the Rust file watcher, and the unsaved-changes guard on close are
// deliberately NOT wired here -- see AUTO-016. Tabs in this phase are
// in-memory Untitled documents only; src/core/state.js's global
// currentFilePath/isDirty/lineEnding remain the source of truth for the
// single "currently open file" concept until AUTO-016 makes that per-tab.

export const MAX_TABS = 6;

let tabs = [];
let activeTabId = null;
let nextTabId = 1;
let onTabsChangedCallback = null;

function nextUntitledTitle() {
  const used = new Set(tabs.filter((t) => !t.path).map((t) => t.title));
  if (!used.has('Untitled')) return 'Untitled';
  let n = 2;
  while (used.has(`Untitled ${n}`)) n++;
  return `Untitled ${n}`;
}

function makeTab(editorState) {
  return {
    id: nextTabId++,
    path: null,
    title: nextUntitledTitle(),
    isDirty: false,
    lineEnding: 'LF',
    editorState,
    scrollRatio: 0,
  };
}

function notify() {
  if (onTabsChangedCallback) onTabsChangedCallback(getAllTabs(), activeTabId);
}

/**
 * Initialize the tab model with a single tab wrapping the editor's initial
 * (already-mounted) EditorState. Call once during app boot.
 */
export function initTabs(initialEditorState, onTabsChanged) {
  tabs = [makeTab(initialEditorState)];
  activeTabId = tabs[0].id;
  onTabsChangedCallback = onTabsChanged || null;
  notify();
}

/** Read-only snapshot of open tabs for rendering (no EditorState included). */
export function getAllTabs() {
  return tabs.map((t) => ({ id: t.id, path: t.path, title: t.title, isDirty: t.isDirty }));
}

export function getActiveTabId() {
  return activeTabId;
}

export function getActiveTab() {
  return tabs.find((t) => t.id === activeTabId) || null;
}

export function getTab(id) {
  return tabs.find((t) => t.id === id) || null;
}

export function canCreateTab() {
  return tabs.length < MAX_TABS;
}

/**
 * Create and activate a new tab wrapping the given (already-built, empty)
 * EditorState. Returns null without changing anything if MAX_TABS is
 * already open -- the caller (UI) should disable the "+" affordance in
 * that case rather than relying on this no-op.
 */
export function createTab(editorState) {
  if (!canCreateTab()) return null;
  const tab = makeTab(editorState);
  tabs.push(tab);
  activeTabId = tab.id;
  notify();
  return tab;
}

/**
 * Snapshot the currently active tab's live EditorState + scroll ratio before
 * switching away from it. The caller reads these from the live EditorView
 * immediately before calling switchTab()/closeTab() -- tabs.js has no direct
 * access to the view itself, only the state it's handed.
 */
export function saveActiveTabSnapshot(editorState, scrollRatio) {
  const tab = getActiveTab();
  if (!tab) return;
  if (editorState) tab.editorState = editorState;
  if (typeof scrollRatio === 'number') tab.scrollRatio = scrollRatio;
}

/** Switch the active tab. Returns the newly active tab, or null if id is unknown. */
export function switchTab(id) {
  const tab = getTab(id);
  if (!tab) return null;
  activeTabId = id;
  notify();
  return tab;
}

/**
 * Close a tab. If it was the last remaining tab, it is replaced with a fresh
 * empty Untitled tab (built from freshEditorStateFactory()) so the app never
 * ends up with zero tabs open.
 *
 * Returns the tab that is now active if the active tab changed as a result
 * (the caller must apply its EditorState to the view), or null if the closed
 * tab wasn't the active one (nothing for the caller to swap).
 */
export function closeTab(id, freshEditorStateFactory) {
  const idx = tabs.findIndex((t) => t.id === id);
  if (idx === -1) return null;

  const wasActive = activeTabId === id;
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    const fresh = makeTab(freshEditorStateFactory());
    tabs.push(fresh);
    activeTabId = fresh.id;
    notify();
    return fresh;
  }

  if (wasActive) {
    const nextIdx = Math.min(idx, tabs.length - 1);
    activeTabId = tabs[nextIdx].id;
    notify();
    return getActiveTab();
  }

  notify();
  return null;
}

/** Mark the active tab's dirty-dot state. No-ops if already at that value. */
export function setActiveTabDirty(dirty) {
  const tab = getActiveTab();
  if (tab && tab.isDirty !== dirty) {
    tab.isDirty = dirty;
    notify();
  }
}

/** Test-only reset so each test file starts from a clean module state. */
export function _resetForTests() {
  tabs = [];
  activeTabId = null;
  nextTabId = 1;
  onTabsChangedCallback = null;
}
