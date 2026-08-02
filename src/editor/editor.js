// ========================================
// Feather MD - Editor Module (CodeMirror 6)
// ========================================

import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, keymap, drawSelection, dropCursor, rectangularSelection, crosshairCursor } from '@codemirror/view';
import { EditorState, Compartment, Annotation } from '@codemirror/state';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { defaultKeymap, history, historyKeymap, indentMore, indentLess } from '@codemirror/commands';
import { syntaxHighlighting, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap, autocompletion } from '@codemirror/autocomplete';
import { classHighlighter } from '@lezer/highlight';

// Compartments for dynamic reconfiguration
const lineNumbersCompartment = new Compartment();
const lineWrappingCompartment = new Compartment();
const tabSizeCompartment = new Compartment();

let editorView = null;
let onChangeCallback = null;
let onCursorActivityCallback = null;
let debounceTimer = null;

// CF-1: tag programmatic edits (setValue) on the transaction itself rather than
// a shared boolean. A module-level flag flipped synchronously around dispatch()
// could be read stale by the 150ms-debounced callback, letting a user keystroke
// that landed in the window be misclassified as programmatic (isDirty never
// flips -> silent data loss). An annotation travels with its transaction, so the
// classification is always read from the exact change that triggered it.
const programmaticChange = Annotation.define();

// Built once and shared across every tab's EditorState (AUTO-015): the
// listener body reads onChangeCallback/onCursorActivityCallback fresh on
// each firing rather than capturing them at construction time, so a single
// instance is safe to reuse in every buildExtensions() call -- no per-tab
// listener duplication, and callbacks stay correct regardless of which
// tab's state is currently live in the one shared EditorView.
const updateListener = EditorView.updateListener.of((update) => {
  if (update.docChanged) {
    const isProgrammatic = update.transactions.some((tr) => tr.annotation(programmaticChange));
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (onChangeCallback) {
        onChangeCallback(update.state.doc.toString(), isProgrammatic);
      }
    }, 150);
  }
  if (update.selectionSet && onCursorActivityCallback) {
    onCursorActivityCallback();
  }
});

/**
 * The standard extension set every tab's EditorState is built with. Shared
 * Compartment instances (module-level) are safe to reuse across multiple
 * EditorStates -- each state independently holds its own compartment
 * configuration, so per-tab line-numbers/wrapping/tab-size reconfiguration
 * (setLineNumbers/setLineWrapping/setTabSize) keeps working correctly no
 * matter which tab's state is currently active in the shared EditorView.
 */
function buildExtensions() {
  return [
    lineNumbersCompartment.of(lineNumbers()),
    lineWrappingCompartment.of(EditorView.lineWrapping),
    tabSizeCompartment.of([EditorState.tabSize.of(4), indentUnit.of('    ')]),
    history(),
    foldGutter(),
    drawSelection(),
    dropCursor(),
    indentOnInput(),
    syntaxHighlighting(classHighlighter, { fallback: true }),
    bracketMatching(),
    closeBrackets(),
    autocompletion(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightActiveLineGutter(),
    highlightSelectionMatches(),
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...searchKeymap,
      ...historyKeymap,
      ...foldKeymap,
      {
        key: 'Tab',
        run: (view) => {
          if (view.state.readOnly) return false;
          if (view.state.selection.ranges.some(r => !r.empty)) {
            return indentMore(view);
          }
          const size = view.state.tabSize || 4;
          const insert = ' '.repeat(size);
          view.dispatch(view.state.replaceSelection(insert));
          return true;
        },
        shift: indentLess,
      },
    ]),
    updateListener,
    EditorView.theme({
      '&': { height: '100%' },
      '.cm-scroller': { overflow: 'auto' },
    }),
  ];
}

/**
 * Build a fresh, standalone EditorState for a new tab (AUTO-015). Not yet
 * mounted anywhere -- pass it to applyEditorState() to display it, or store
 * it on a tabs.js tab record for later.
 */
function createDocState(text = '') {
  return EditorState.create({ doc: text, extensions: buildExtensions() });
}

/**
 * Initialize the CodeMirror 6 editor
 * @param {HTMLElement} domEl - Container element
 * @param {Function} onChange - Callback fired with doc string after 150ms debounce
 * @param {Function} [onCursorActivity] - Callback fired on selection/cursor changes (event-driven, no polling)
 * @returns {Object} Editor API
 */
export function initEditor(domEl, onChange, onCursorActivity) {
  onChangeCallback = onChange;
  onCursorActivityCallback = onCursorActivity || null;

  editorView = new EditorView({
    state: createDocState(''),
    parent: domEl,
  });

  return {
    getValue: () => editorView.state.doc.toString(),
    setValue,
    getScrollRatio,
    setScrollRatio,
    getCursorPosition,
    getSelectedText: () => {
      if (!editorView) return '';
      const { from, to } = editorView.state.selection.main;
      return editorView.state.sliceDoc(from, to);
    },
    setLineNumbers,
    setLineWrapping,
    setTabSize,
    searchAndHighlight,
    focus: () => editorView.focus(),
    getScrollDOM: () => editorView.scrollDOM,
    requestMeasure: () => { if (editorView) editorView.requestMeasure(); },
    wrapSelection,
    toggleLinePrefix,
    insertLink,
    insertImage,
    insertTable,
    setSelection: (from, to = from) => {
      if (!editorView) return;
      const docLen = editorView.state.doc.length;
      const clamp = (n) => Math.max(0, Math.min(docLen, n));
      editorView.dispatch({ selection: { anchor: clamp(from), head: clamp(to) } });
    },
    // ---- Tab-switching primitives (AUTO-015) ----
    createDocState,
    getEditorState: () => (editorView ? editorView.state : null),
    applyEditorState: (state) => {
      if (!editorView || !state) return;
      editorView.setState(state);
    },
  };
}

/**
 * Set the editor content (replaces all)
 */
function setValue(text) {
  if (!editorView) return;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: text,
    },
    annotations: programmaticChange.of(true),
  });
}

/**
 * Get scroll ratio: scrollTop / (scrollHeight - clientHeight)
 */
function getScrollRatio() {
  if (!editorView) return 0;
  const dom = editorView.scrollDOM;
  const max = dom.scrollHeight - dom.clientHeight;
  return max > 0 ? dom.scrollTop / max : 0;
}

/**
 * Set scroll ratio
 */
function setScrollRatio(ratio) {
  if (!editorView) return;
  const dom = editorView.scrollDOM;
  const max = dom.scrollHeight - dom.clientHeight;
  dom.scrollTop = ratio * max;
}

/**
 * Get cursor line and column
 */
function getCursorPosition() {
  if (!editorView) return { line: 1, col: 1 };
  const pos = editorView.state.selection.main.head;
  const line = editorView.state.doc.lineAt(pos);
  return { line: line.number, col: pos - line.from + 1 };
}

/**
 * Toggle line numbers
 */
function setLineNumbers(show) {
  if (!editorView) return;
  editorView.dispatch({
    effects: lineNumbersCompartment.reconfigure(show ? lineNumbers() : []),
  });
}

/**
 * Toggle line wrapping
 */
function setLineWrapping(wrap) {
  if (!editorView) return;
  editorView.dispatch({
    effects: lineWrappingCompartment.reconfigure(wrap ? EditorView.lineWrapping : []),
  });
}

/**
 * Set tab size
 */
function setTabSize(size) {
  if (!editorView) return;
  editorView.dispatch({
    effects: tabSizeCompartment.reconfigure([
      EditorState.tabSize.of(size),
      indentUnit.of(' '.repeat(size)),
    ]),
  });
}

/**
 * Search the document for `text` and select + scroll to the first match.
 * Used by the preview triple-click feature (ISSUE-16) to jump from preview
 * back to the corresponding source in the editor.
 *
 * The rendered preview strips markdown formatting (**bold** -> bold,
 * [text](url) -> text, `code` -> code), so an exact indexOf against the raw
 * source often fails. We use a multi-strategy approach:
 *   1. Exact match (works for plain prose).
 *   2. First-line match (works for headings, short paragraphs).
 *   3. Word-sequence search: extract the first few words from the rendered
 *      text, then scan the source for a line containing those words in order,
 *      allowing arbitrary markdown syntax between them.
 */
function searchAndHighlight(text) {
  if (!editorView || !text) return;

  const trimmed = text.trim();
  if (!trimmed) return;

  const doc = editorView.state.doc.toString();

  // Strategy 1: exact substring match
  let idx = doc.indexOf(trimmed);
  if (idx !== -1) {
    selectAndScroll(idx, idx + trimmed.length);
    return;
  }

  // Strategy 2: first line match
  const firstLine = trimmed.split('\n')[0].trim();
  if (firstLine.length > 3) {
    idx = doc.indexOf(firstLine);
    if (idx !== -1) {
      selectAndScroll(idx, idx + firstLine.length);
      return;
    }
  }

  // Strategy 3: word-sequence fuzzy search. Extract the first N words from
  // the rendered text and look for a source line that contains them in order.
  // This bridges the gap between rendered "This is bold text" and source
  // "This is **bold** text".
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  // Use up to the first 6 words for the search pattern — enough to be unique,
  // few enough to tolerate mid-word formatting.
  const searchWords = words.slice(0, 6);

  // Build a regex that matches these words in sequence with arbitrary chars
  // between them (non-greedy, single-line). Escape regex specials in each word.
  const escaped = searchWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(escaped.join('[\\s\\S]{0,20}?'));

  const match = pattern.exec(doc);
  if (match) {
    // Expand the selection to the full source line for context.
    const lineObj = editorView.state.doc.lineAt(match.index);
    selectAndScroll(lineObj.from, lineObj.to);
    return;
  }

  // Strategy 4: last resort — try each individual word (>= 4 chars) and jump
  // to the first unique occurrence.
  for (const word of words) {
    if (word.length < 4) continue;
    const wi = doc.indexOf(word);
    if (wi !== -1) {
      const lineObj = editorView.state.doc.lineAt(wi);
      selectAndScroll(lineObj.from, lineObj.to);
      return;
    }
  }
}

// ---- Markdown formatting toolbar commands (AUTO-010) ----

/**
 * Wrap the current selection in `before`/`after` markers (bold, italic,
 * strikethrough, inline code). With no selection, inserts `before + placeholder
 * + after` and selects the placeholder so typing replaces it immediately; with
 * a selection, the wrapped text stays selected so the marker pair is visible.
 */
function wrapSelection(before, after, placeholder = '') {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selectedText = editorView.state.sliceDoc(from, to);
  const inner = selectedText || placeholder;
  const insert = before + inner + after;
  const innerFrom = from + before.length;
  const innerTo = innerFrom + inner.length;

  editorView.dispatch({
    changes: { from, to, insert },
    selection: { anchor: innerFrom, head: innerTo },
    scrollIntoView: true,
  });
  editorView.focus();
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Toggle a line-start prefix (heading, blockquote, list marker) across every
 * line touched by the current selection. Whether the action adds or removes
 * is decided by the FIRST touched line: if it already has the prefix, every
 * touched line has it stripped; otherwise every touched line gets it added.
 *
 * `detectPattern` (optional) matches a variable-width existing prefix to
 * strip — used for ordered lists ("12. " as well as "1. "). Without it, the
 * literal `prefixText` itself is the only thing detected/stripped.
 *
 * Ordered-list toggling always adds a literal "1. " per line rather than
 * renumbering sequentially — a deliberate MVP simplification, not a bug.
 */
function toggleLinePrefix(prefixText, detectPattern) {
  if (!editorView) return;
  const pattern = detectPattern || new RegExp('^' + escapeRegExp(prefixText));
  const { from, to } = editorView.state.selection.main;
  const doc = editorView.state.doc;
  const startLine = doc.lineAt(from);
  const endLine = doc.lineAt(to);

  const shouldRemove = pattern.test(startLine.text);
  const changes = [];

  for (let lineNo = startLine.number; lineNo <= endLine.number; lineNo++) {
    const line = doc.line(lineNo);
    if (shouldRemove) {
      const match = pattern.exec(line.text);
      if (match) {
        changes.push({ from: line.from, to: line.from + match[0].length, insert: '' });
      }
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefixText });
    }
  }

  if (changes.length === 0) return;
  editorView.dispatch({ changes });
  editorView.focus();
}

/**
 * Insert a Markdown link. The selected text (or a "link text" placeholder)
 * becomes the link label; the "url" placeholder is selected afterward so the
 * user can type the destination immediately.
 */
function insertLink() {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selectedText = editorView.state.sliceDoc(from, to);
  const label = selectedText || 'link text';
  const url = 'url';
  const insert = `[${label}](${url})`;
  const urlFrom = from + 1 + label.length + 2;
  const urlTo = urlFrom + url.length;

  editorView.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlFrom, head: urlTo },
    scrollIntoView: true,
  });
  editorView.focus();
}

/**
 * Insert a Markdown image. Same shape as insertLink() with the alt-text/URL
 * roles, and the "url" placeholder selected for immediate typing.
 */
function insertImage() {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const selectedText = editorView.state.sliceDoc(from, to);
  const alt = selectedText || 'alt text';
  const url = 'url';
  const insert = `![${alt}](${url})`;
  const urlFrom = from + 2 + alt.length + 2;
  const urlTo = urlFrom + url.length;

  editorView.dispatch({
    changes: { from, to, insert },
    selection: { anchor: urlFrom, head: urlTo },
    scrollIntoView: true,
  });
  editorView.focus();
}

/**
 * Insert a default 2x2 GFM table skeleton at the cursor. Ensures the table
 * starts on its own blank line (GFM tables must not follow other content on
 * the same line) unless the cursor is already alone on an empty line.
 */
function insertTable() {
  if (!editorView) return;
  const { from, to } = editorView.state.selection.main;
  const line = editorView.state.doc.lineAt(from);
  const alreadyOnBlankLine = from === line.from && line.text.trim().length === 0;
  const prefix = alreadyOnBlankLine ? '' : '\n\n';
  const table = '| Header 1 | Header 2 |\n| -------- | -------- |\n| Cell 1   | Cell 2   |\n';
  const insert = prefix + table;
  const headerFrom = from + insert.indexOf('Header 1');
  const headerTo = headerFrom + 'Header 1'.length;

  editorView.dispatch({
    changes: { from, to, insert },
    selection: { anchor: headerFrom, head: headerTo },
    scrollIntoView: true,
  });
  editorView.focus();
}

function selectAndScroll(from, to) {
  if (!editorView) return;
  editorView.dispatch({
    selection: { anchor: from, head: to },
    scrollIntoView: true,
  });
  editorView.focus();
}
