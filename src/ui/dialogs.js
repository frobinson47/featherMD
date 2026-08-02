// Custom modal dialogs (unsaved-changes prompt, shortcuts help).

import { config, saveConfig } from '../core/config.js';

/**
 * Show the 3-button unsaved-changes dialog.
 *
 * Keyboard contract (ISSUE-8):
 *   - Tab / Shift+Tab cycle the three buttons (browser default; Save is focused
 *     on open so Enter activates Save by default).
 *   - Enter activates the focused button (browser default).
 *   - Escape cancels.
 *   - Single-letter shortcuts (no modifiers): S = Save, N = Don't Save,
 *     C = Cancel. Ignored when a modifier key is held so they do not collide
 *     with Ctrl+S etc.
 *
 * @returns {Promise<'save'|'discard'|'cancel'>}
 */
export function showUnsavedDialog() {
  return new Promise( ( resolve ) => {
    const dialog = document.getElementById( 'unsaved-dialog' );
    const btnSave = document.getElementById( 'unsaved-btn-save' );
    const btnDiscard = document.getElementById( 'unsaved-btn-discard' );
    const btnCancel = document.getElementById( 'unsaved-btn-cancel' );

    dialog.hidden = false;
    setTimeout( () => btnSave.focus(), 50 );

    function cleanup( result ) {
      dialog.hidden = true;
      btnSave.removeEventListener( 'click', onSave );
      btnDiscard.removeEventListener( 'click', onDiscard );
      btnCancel.removeEventListener( 'click', onCancel );
      dialog.removeEventListener( 'click', onOverlayClick );
      document.removeEventListener( 'keydown', onKeydown, true );
      resolve( result );
    }

    function onSave() { cleanup( 'save' ); }
    function onDiscard() { cleanup( 'discard' ); }
    function onCancel() { cleanup( 'cancel' ); }
    function onOverlayClick( e ) {
      if ( e.target === dialog ) cleanup( 'cancel' );
    }
    function onKeydown( e ) {
      if ( e.key === 'Escape' ) {
        e.preventDefault();
        e.stopPropagation();
        cleanup( 'cancel' );
        return;
      }
      // Ignore key shortcuts when any modifier is held — protects global
      // bindings (Ctrl+S, Alt+Z, etc.) from firing while the modal is open.
      if ( e.ctrlKey || e.metaKey || e.altKey || e.shiftKey ) return;

      const key = e.key.toLowerCase();
      if ( key === 's' ) {
        e.preventDefault();
        e.stopPropagation();
        cleanup( 'save' );
      } else if ( key === 'n' ) {
        e.preventDefault();
        e.stopPropagation();
        cleanup( 'discard' );
      } else if ( key === 'c' ) {
        e.preventDefault();
        e.stopPropagation();
        cleanup( 'cancel' );
      }
    }

    btnSave.addEventListener( 'click', onSave );
    btnDiscard.addEventListener( 'click', onDiscard );
    btnCancel.addEventListener( 'click', onCancel );
    dialog.addEventListener( 'click', onOverlayClick );
    // Capture phase so we beat the global keyboard.js listener for unmodified
    // S / N / C / Escape while the modal is open.
    document.addEventListener( 'keydown', onKeydown, true );
  } );
}

export function toggleShortcutsModal() {
  const modal = document.getElementById( 'shortcuts-modal' );
  modal.hidden = !modal.hidden;
}

export function initShortcutsModal() {
  const modal = document.getElementById( 'shortcuts-modal' );
  const closeBtn = document.getElementById( 'btn-close-shortcuts' );
  closeBtn?.addEventListener( 'click', () => {
    modal.hidden = true;
  } );
  modal?.addEventListener( 'click', ( e ) => {
    if ( e.target === modal ) modal.hidden = true;
  } );
  // Keyboard-first: Escape dismisses the modal while it is open.
  document.addEventListener( 'keydown', ( e ) => {
    if ( e.key === 'Escape' && modal && !modal.hidden ) {
      e.preventDefault();
      e.stopPropagation();
      modal.hidden = true;
    }
  } );
}

export function openRecentFilesModal() {
  const modal = document.getElementById( 'recent-files-modal' );
  if ( modal ) modal.hidden = false;
}

export function closeRecentFilesModal() {
  const modal = document.getElementById( 'recent-files-modal' );
  if ( modal ) modal.hidden = true;
}

// ---- Send To Settings modal (AUTO-013/014) ----

export function initSendToSettingsModal() {
  const modal = document.getElementById( 'send-to-settings-modal' );
  const discordInput = document.getElementById( 'discord-webhook-input' );
  const threadInput = document.getElementById( 'thread-url-input' );
  const btnSave = document.getElementById( 'send-to-settings-btn-save' );
  const btnCancel = document.getElementById( 'send-to-settings-btn-cancel' );
  if ( !modal ) return;

  function close() {
    modal.hidden = true;
  }

  btnSave?.addEventListener( 'click', () => {
    config.discordWebhookUrl = ( discordInput?.value || '' ).trim();
    config.threadUrl = ( threadInput?.value || '' ).trim();
    saveConfig();
    close();
  } );
  btnCancel?.addEventListener( 'click', close );
  modal.addEventListener( 'click', ( e ) => {
    if ( e.target === modal ) close();
  } );
  document.addEventListener( 'keydown', ( e ) => {
    if ( e.key === 'Escape' && !modal.hidden ) {
      e.preventDefault();
      close();
    }
  } );
}

/**
 * Open the Send To Settings modal, pre-filled with the currently saved values.
 */
export function openSendToSettingsModal() {
  const modal = document.getElementById( 'send-to-settings-modal' );
  const discordInput = document.getElementById( 'discord-webhook-input' );
  const threadInput = document.getElementById( 'thread-url-input' );
  if ( !modal ) return;
  if ( discordInput ) discordInput.value = config.discordWebhookUrl || '';
  if ( threadInput ) threadInput.value = config.threadUrl || '';
  modal.hidden = false;
  setTimeout( () => discordInput?.focus(), 50 );
}

export function initRecentFilesModal() {
  const modal = document.getElementById( 'recent-files-modal' );
  const closeBtn = document.getElementById( 'btn-close-recent' );
  closeBtn?.addEventListener( 'click', closeRecentFilesModal );
  modal?.addEventListener( 'click', ( e ) => {
    if ( e.target === modal ) closeRecentFilesModal();
  } );
  // Keyboard-first: Escape dismisses the modal while it is open.
  document.addEventListener( 'keydown', ( e ) => {
    if ( e.key === 'Escape' && modal && !modal.hidden ) {
      e.preventDefault();
      closeRecentFilesModal();
    }
  } );
}
