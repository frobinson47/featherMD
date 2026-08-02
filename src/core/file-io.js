// File-system operations: open/save/save-as/new + recent-files list +
// unsaved-changes guard. Wraps Tauri plugin-fs with a browser fallback.
//
// AUTO-016: every operation targets the ACTIVE tab (src/core/tabs.js), not a
// single global document. Opening a file (File->Open, Recent Files) always
// creates and activates a NEW tab, up to the MAX_TABS cap -- it never
// discards an existing tab's content, so no discard-guard is needed for
// those paths anymore. newFile() (Ctrl+N) resets the ACTIVE tab in place
// (matching its pre-tabs meaning) and still guards on discard. Closing a
// dirty tab is guarded per-tab via confirmDiscardChangesForTab(), which
// switches to that tab first if it isn't already active so the normal
// save pipeline (always reads the live editor) operates on the right
// content.
//
// The Rust file watcher only ever tracks the ACTIVE tab's file
// (watchActiveTabFile()) -- per the 2026-08-01 "tabs feature scope"
// decision, background tabs' external changes are not detected until
// switched to. src/core/state.js's legacy globals (currentFilePath/
// isDirty/lineEnding) are kept in sync with the active tab via
// syncGlobalsFromActiveTab() so status-bar.js and other unchanged
// consumers keep working without becoming tab-aware themselves.

import { config, saveConfig } from './config.js';
import { isTauri } from './state.js';
import * as tabsStore from './tabs.js';
import { showUnsavedDialog } from '../ui/dialogs.js';
import { updateTitleBar, updateStatusBar } from '../ui/status-bar.js';
import { updateRecentFilesList } from '../ui/toolbar.js';

let _editorAPI = null;

// PERF-12: keep the isSaving echo-suppression window open long enough for
// the OS file watcher to emit and the listener to observe it. The native
// notify watcher fires within a few ms of write completion; 500ms is a
// generous, conservative ceiling.
const SAVE_ECHO_WINDOW_MS = 500;

export function initFileIO( editorAPI ) {
  _editorAPI = editorAPI;
}

function markSaveStart() {
  isSaving = true;
}

function markSaveEnd() {
  setTimeout( () => { isSaving = false; }, SAVE_ECHO_WINDOW_MS );
}

/**
 * Mirror the active tab's path/isDirty/lineEnding onto the legacy globals in
 * state.js. Call after any tabsStore mutation or tab switch so status-bar.js
 * (and anything else still reading the globals directly) reflects whichever
 * tab is now active.
 */
export function syncGlobalsFromActiveTab() {
  const tab = tabsStore.getActiveTab();
  currentFilePath = tab ? tab.path : null;
  isDirty = tab ? tab.isDirty : false;
  lineEnding = tab ? tab.lineEnding : 'LF';
}

/**
 * Point the Rust file watcher at the active tab's file, or unwatch if it
 * has none. Call after any tab switch/create/close and after any operation
 * that changes the active tab's path.
 */
export async function watchActiveTabFile() {
  if ( !isTauri() ) return;
  const tab = tabsStore.getActiveTab();
  try {
    const { invoke } = await import( '@tauri-apps/api/core' );
    if ( tab && tab.path ) {
      await invoke( 'watch_file', { path: tab.path } );
    } else {
      await invoke( 'unwatch_file' );
    }
  } catch ( e ) {
    console.error( 'Failed to update file watcher for active tab:', e );
  }
}

function notifyTabCapReached() {
  console.warn( `Cannot open another file: ${ tabsStore.MAX_TABS }-tab limit reached. Close a tab first.` );
}

export async function openFile() {
  if ( !tabsStore.canCreateTab() ) {
    notifyTabCapReached();
    return;
  }

  if ( isTauri() ) {
    try {
      const { open } = await import( '@tauri-apps/plugin-dialog' );
      const { readTextFile } = await import( '@tauri-apps/plugin-fs' );
      const selected = await open( {
        filters: [ { name: 'Markdown', extensions: [ 'md', 'markdown', 'txt' ] } ],
      } );
      if ( selected ) {
        const content = await readTextFile( selected );
        await loadFileIntoNewTab( selected, content );
      }
    } catch ( e ) {
      console.error( 'Failed to open file:', e );
    }
  } else {
    const input = document.createElement( 'input' );
    input.type = 'file';
    input.accept = '.md,.markdown,.txt';
    input.onchange = async () => {
      const file = input.files[ 0 ];
      if ( file ) {
        const text = await file.text();
        await loadFileIntoNewTab( file.name, text );
      }
    };
    input.click();
  }
}

export async function saveFile() {
  const tab = tabsStore.getActiveTab();
  if ( isTauri() && tab && tab.path ) {
    try {
      markSaveStart();
      const { writeTextFile } = await import( '@tauri-apps/plugin-fs' );
      await writeTextFile( tab.path, _editorAPI.getValue() );
      tabsStore.setActiveTabDirty( false );
      syncGlobalsFromActiveTab();
      updateTitleBar();
      addToRecentFiles( tab.path );
    } catch ( e ) {
      console.error( 'Failed to save file:', e );
    } finally {
      markSaveEnd();
    }
  } else {
    await saveFileAs();
  }
}

export async function saveFileAs() {
  if ( isTauri() ) {
    try {
      const { save } = await import( '@tauri-apps/plugin-dialog' );
      const { writeTextFile } = await import( '@tauri-apps/plugin-fs' );
      const path = await save( {
        filters: [ { name: 'Markdown', extensions: [ 'md', 'markdown' ] } ],
      } );
      if ( path ) {
        markSaveStart();
        try {
          await writeTextFile( path, _editorAPI.getValue() );
          const prevTab = tabsStore.getActiveTab();
          const isSamePath = !!prevTab && path === prevTab.path;
          tabsStore.setActiveTabFile( path, false, prevTab ? prevTab.lineEnding : 'LF' );
          syncGlobalsFromActiveTab();
          updateTitleBar();
          addToRecentFiles( path );

          // If the user picked a different file, start watching the new one.
          if ( !isSamePath ) {
            await watchActiveTabFile();
          }
        } finally {
          markSaveEnd();
        }
      }
    } catch ( e ) {
      console.error( 'Failed to save file:', e );
    }
  } else {
    const tab = tabsStore.getActiveTab();
    const blob = new Blob( [ _editorAPI.getValue() ], { type: 'text/markdown' } );
    const url = URL.createObjectURL( blob );
    const a = document.createElement( 'a' );
    a.href = url;
    a.download = ( tab && tab.path ) || 'untitled.md';
    a.click();
    URL.revokeObjectURL( url );
    tabsStore.setActiveTabDirty( false );
    syncGlobalsFromActiveTab();
    updateTitleBar();
  }
}

export async function newFile() {
  if ( !await confirmDiscardChanges() ) return;

  _editorAPI.applyEditorState( _editorAPI.createDocState( '' ) );
  tabsStore.setActiveTabFile( null, false, 'LF' );
  syncGlobalsFromActiveTab();
  updateTitleBar();
  updateStatusBar( '' );
  _editorAPI.focus();

  await watchActiveTabFile();
}

/**
 * Load `content` into the ACTIVE tab in place (does not create a new tab).
 * Used for the external-file-changed-on-disk reload path, and (until
 * AUTO-017 makes them tab-aware) the CLI-arg / single-instance-forwarded
 * file paths in main.js.
 */
export function loadFileContent( path, content ) {
  const detectedLineEnding = content.includes( '\r\n' ) ? 'CRLF' : 'LF';
  _editorAPI.setValue( content );
  tabsStore.setActiveTabFile( path, false, detectedLineEnding );
  syncGlobalsFromActiveTab();
  updateTitleBar();
  updateStatusBar( content );
  _editorAPI.focus();

  if ( path ) {
    addToRecentFiles( path );
  }
  watchActiveTabFile();
}

/**
 * Create and activate a new tab containing `content` (AUTO-016). Used by
 * openFile()/onRecentFileSelect() so opening a file never disturbs other
 * open tabs. No-ops (via the caller's canCreateTab() check) rather than
 * silently exceeding MAX_TABS.
 */
export async function loadFileIntoNewTab( path, content ) {
  if ( !tabsStore.canCreateTab() ) {
    notifyTabCapReached();
    return;
  }

  tabsStore.saveActiveTabSnapshot( _editorAPI.getEditorState(), _editorAPI.getScrollRatio() );

  const detectedLineEnding = content.includes( '\r\n' ) ? 'CRLF' : 'LF';
  const newState = _editorAPI.createDocState( content );
  const tab = tabsStore.createTab( newState );
  if ( !tab ) return; // race with the cap check above; extremely unlikely, but stay safe

  tabsStore.setActiveTabFile( path, false, detectedLineEnding );
  _editorAPI.applyEditorState( tab.editorState );
  _editorAPI.setScrollRatio( 0 );
  syncGlobalsFromActiveTab();
  updateTitleBar();
  updateStatusBar( content );
  _editorAPI.focus();

  if ( path ) {
    addToRecentFiles( path );
  }
  await watchActiveTabFile();
}

export async function onRecentFileSelect( filePath ) {
  if ( !tabsStore.canCreateTab() ) {
    notifyTabCapReached();
    return;
  }

  if ( isTauri() ) {
    try {
      const { readTextFile } = await import( '@tauri-apps/plugin-fs' );
      const content = await readTextFile( filePath );
      await loadFileIntoNewTab( filePath, content );
    } catch ( e ) {
      console.error( 'Failed to open recent file natively:', e );
    }
  } else {
    console.warn( 'Browser mode cannot read local paths from disk.' );
  }
}

function addToRecentFiles( path ) {
  if ( !config.recentFiles ) config.recentFiles = [];
  config.recentFiles = config.recentFiles.filter( p => p !== path );
  config.recentFiles.unshift( path );
  if ( config.recentFiles.length > 10 ) config.recentFiles.pop();
  saveConfig();
  updateRecentFilesList( config.recentFiles, onRecentFileSelect, removeRecentFile, clearRecentFiles );
}

export function removeRecentFile( path ) {
  if ( !config.recentFiles ) return;
  config.recentFiles = config.recentFiles.filter( p => p !== path );
  saveConfig();
  updateRecentFilesList( config.recentFiles, onRecentFileSelect, removeRecentFile, clearRecentFiles );
}

export function clearRecentFiles() {
  config.recentFiles = [];
  saveConfig();
  updateRecentFilesList( config.recentFiles, onRecentFileSelect, removeRecentFile, clearRecentFiles );
}

/**
 * Returns true if it is safe to proceed (clean buffer, user saved, or
 * explicitly discarded). Returns false to abort. Operates on the ACTIVE
 * tab via the legacy `isDirty` global (kept in sync with it) -- used by
 * newFile(), the CLI-arg reload paths, and the app-reload shortcut, all of
 * which act on whatever tab is currently active.
 */
export async function confirmDiscardChanges() {
  if ( !isDirty ) return true;
  const response = await showUnsavedDialog();
  if ( response === 'save' ) {
    await saveFile();
    return !isDirty;
  }
  return response === 'discard';
}

/**
 * Per-tab discard guard for closing a SPECIFIC tab (AUTO-016), which may not
 * be the currently active one. If the user chooses to save, this switches
 * to that tab first (so saveFile()'s "always save the live editor's
 * content" assumption stays correct), saves it, then reports success.
 */
export async function confirmDiscardChangesForTab( tabId ) {
  const tab = tabsStore.getTab( tabId );
  if ( !tab || !tab.isDirty ) return true;

  const response = await showUnsavedDialog();
  if ( response === 'discard' ) return true;
  if ( response !== 'save' ) return false;

  if ( tabId !== tabsStore.getActiveTabId() ) {
    tabsStore.saveActiveTabSnapshot( _editorAPI.getEditorState(), _editorAPI.getScrollRatio() );
    const target = tabsStore.switchTab( tabId );
    _editorAPI.applyEditorState( target.editorState );
    _editorAPI.setScrollRatio( target.scrollRatio || 0 );
    syncGlobalsFromActiveTab();
    updateTitleBar();
    updateStatusBar( _editorAPI.getValue() );
    await watchActiveTabFile();
  }

  await saveFile();
  return !tabsStore.getTab( tabId ).isDirty;
}
