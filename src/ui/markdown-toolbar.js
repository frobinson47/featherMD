// ========================================
// Feather MD — Markdown Formatting Toolbar (AUTO-010)
// ========================================
// Wires the #markdown-toolbar buttons (index.html) to the editor API's
// formatting commands (src/editor/editor.js). Follows the same
// data-action + querySelectorAll dispatch pattern as ui/toolbar.js's menu
// items, rather than a shared click-delegation listener, for consistency.

const ACTIONS = {
  'format-bold': (api) => api.wrapSelection('**', '**'),
  'format-italic': (api) => api.wrapSelection('*', '*'),
  'format-strikethrough': (api) => api.wrapSelection('~~', '~~'),
  'format-code': (api) => api.wrapSelection('`', '`'),
  'format-link': (api) => api.insertLink(),
  'format-image': (api) => api.insertImage(),
  // Single-level heading toggle (H2) rather than a full H1-H6 picker --
  // matches the toolbar's "one click, one obvious result" design; a level
  // picker can be layered on later if needed.
  'format-heading': (api) => api.toggleLinePrefix('## '),
  'format-unordered-list': (api) => api.toggleLinePrefix('- '),
  // Ordered-list toggle always adds a literal "1. " per line rather than
  // renumbering sequentially -- see editor.js's toggleLinePrefix() doc comment.
  'format-ordered-list': (api) => api.toggleLinePrefix('1. ', /^\d+\.\s/),
  'format-blockquote': (api) => api.toggleLinePrefix('> '),
  'format-table': (api) => api.insertTable(),
};

/**
 * Wire the markdown formatting toolbar to the given editor API.
 * Safe to call even if #markdown-toolbar isn't present in the DOM (no-ops).
 */
export function initMarkdownToolbar(editorAPI) {
  for (const [action, run] of Object.entries(ACTIONS)) {
    document.querySelectorAll(`[data-action="${action}"]`).forEach((btn) => {
      btn.addEventListener('click', () => {
        run(editorAPI);
      });
    });
  }
}
