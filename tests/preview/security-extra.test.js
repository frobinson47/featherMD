// ========================================
// Feather MD -- Preview Sanitization: Additional Adversarial Coverage
// ========================================
// AUTO-005: fills gaps not covered by tests/security.test.js (which is pure
// static source-grepping, not runtime sanitization) or the existing XSS/math
// suites in preview.test.js and math-mermaid.test.js. Covers: the custom <pb>
// page-break tag (previously untested anywhere), the math tokenizer's raw-TeX
// escaping path against script/tag payloads, Mermaid's locked-down init
// config, and DOMPurify's USE_PROFILES:{html:true} excluding SVG/MathML.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn(async () => ({ svg: '<svg class="mmd-stub"><text>diagram</text></svg>' })),
  },
}));

import { initPreview } from '../../src/preview/preview.js';

function createPreviewDOM() {
  const parentEl = document.createElement('div');
  const previewEl = document.createElement('div');
  parentEl.appendChild(previewEl);
  Object.defineProperty(parentEl, 'scrollHeight', { value: 1000, writable: true });
  Object.defineProperty(parentEl, 'clientHeight', { value: 200, writable: true });
  parentEl.scrollTop = 0;
  return previewEl;
}

async function waitFor(predicate, timeout = 2000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 0));
  }
  return false;
}

// -- <pb> page-break tag: flatten logic + attribute stripping --

describe('Preview -- <pb> Tag Safety', () => {
  let previewEl, api;

  beforeEach(() => {
    previewEl = createPreviewDOM();
    api = initPreview(previewEl);
  });

  it('flattens <pb> as an empty block marker, moving trailing content out', () => {
    api.renderMarkdown('Before\n\n<pb>\n\nAfter');
    const pb = previewEl.querySelector('pb');
    expect(pb).toBeTruthy();
    expect(pb.childNodes.length).toBe(0);
    expect(previewEl.textContent).toContain('Before');
    expect(previewEl.textContent).toContain('After');
  });

  it('strips event handler attributes smuggled on a <pb> tag', () => {
    api.renderMarkdown('<pb onclick="alert(1)" onload="alert(2)">');
    expect(previewEl.innerHTML).not.toContain('onclick');
    expect(previewEl.innerHTML).not.toContain('onload');
    expect(previewEl.innerHTML).not.toContain('alert');
  });

  it('does not let a <script> tag survive by nesting inside <pb>', () => {
    api.renderMarkdown('<pb><script>alert("xss")</script></pb>');
    expect(previewEl.innerHTML).not.toContain('<script>');
    expect(previewEl.innerHTML).not.toContain('alert');
  });

  it('does not let an event-handler-bearing element survive by nesting inside <pb>', () => {
    api.renderMarkdown('<pb><img src="x" onerror="alert(1)"></pb>');
    expect(previewEl.innerHTML).not.toContain('onerror');
  });
});

// -- Math tokenizer: raw TeX escaping against injection --

describe('Preview -- Math Tokenizer Injection Resistance', () => {
  let previewEl, api;

  beforeEach(() => {
    previewEl = createPreviewDOM();
    api = initPreview(previewEl);
  });

  it('does not let a <script> tag inside $...$ survive as a live element', () => {
    api.renderMarkdown('$<script>alert(1)</script>$');
    expect(previewEl.querySelector('script')).toBeNull();
    expect(previewEl.innerHTML).not.toMatch(/<script>/i);
  });

  it('escapes a double-quote in raw TeX so it cannot break out of the data-tex attribute', () => {
    api.renderMarkdown('$a = "onmouseover=alert(1) x="b$');
    const span = previewEl.querySelector('.fmd-math-inline');
    expect(span).toBeTruthy();
    // The quote must not have broken out of the attribute into a real,
    // separately-parsed DOM attribute — it should round-trip as inert text
    // inside data-tex instead (the same property math-mermaid.test.js's
    // "keeps the data-tex placeholder attribute intact" test checks for `<`).
    expect(span.hasAttribute('onmouseover')).toBe(false);
    expect(span.getAttribute('data-tex')).toBe('a = "onmouseover=alert(1) x="b');
  });

  it('keeps an unclosed tag inside $$...$$ display math as an inert attribute string, never a live element', () => {
    api.renderMarkdown('$$<img src=x onerror=alert(1)>$$');
    const block = previewEl.querySelector('.fmd-math-display');
    expect(block).toBeTruthy();
    // No live <img> (with or without onerror) was ever created from this text —
    // it must stay a plain string inside data-tex, never parsed as markup.
    expect(previewEl.querySelector('img')).toBeNull();
    expect(block.getAttribute('data-tex')).toBe('<img src=x onerror=alert(1)>');
  });

  it('treats escaped currency amounts as plain text, never as a math node', () => {
    api.renderMarkdown('Invoice: \\$5 <script>alert(1)</script> \\$10');
    expect(previewEl.innerHTML).not.toContain('<script>');
    expect(previewEl.innerHTML).not.toContain('alert');
  });
});

// -- Mermaid: locked-down init config (regression guard) --

describe('Preview -- Mermaid Security Config Lock-In', () => {
  let previewEl, api;

  beforeEach(async () => {
    previewEl = createPreviewDOM();
    api = initPreview(previewEl);
    const mermaidModule = await import('mermaid');
    mermaidModule.default.initialize.mockClear();
  });

  it('initializes Mermaid with securityLevel:strict and htmlLabels:false', async () => {
    api.renderMarkdown('```mermaid\nflowchart TD\nA-->B\n```');
    await waitFor(() => previewEl.querySelector('.fmd-mermaid'));

    const mermaidModule = await import('mermaid');
    expect(mermaidModule.default.initialize).toHaveBeenCalled();
    const config = mermaidModule.default.initialize.mock.calls[0][0];
    expect(config.securityLevel).toBe('strict');
    expect(config.flowchart).toEqual(expect.objectContaining({ htmlLabels: false }));
    expect(config.startOnLoad).toBe(false);
  });
});

// -- DOMPurify profile: SVG/MathML excluded (USE_PROFILES:{html:true}) --

describe('Preview -- Non-HTML Profile Exclusion (SVG/MathML)', () => {
  let previewEl, api;

  beforeEach(() => {
    previewEl = createPreviewDOM();
    api = initPreview(previewEl);
  });

  it('strips a raw <svg><script> payload (SVG namespace not in the allowed profile)', () => {
    api.renderMarkdown('<svg><script>alert(1)</script></svg>');
    expect(previewEl.querySelector('svg')).toBeNull();
    expect(previewEl.innerHTML).not.toContain('alert');
  });

  it('strips a raw <math> MathML payload (MathML namespace not in the allowed profile)', () => {
    api.renderMarkdown('<math><mtext><script>alert(1)</script></mtext></math>');
    expect(previewEl.querySelector('math')).toBeNull();
    expect(previewEl.innerHTML).not.toContain('alert');
  });

  it('strips an SVG onload handler even when embedded via an <img> fallback path', () => {
    api.renderMarkdown('<svg onload="alert(1)"></svg>');
    expect(previewEl.innerHTML).not.toContain('onload');
    expect(previewEl.innerHTML).not.toContain('alert');
  });
});

// -- data: URI handling --

describe('Preview -- data: URI Handling', () => {
  let previewEl, api;

  beforeEach(() => {
    previewEl = createPreviewDOM();
    api = initPreview(previewEl);
  });

  it('does not execute an HTML data: URI used as a link target', () => {
    api.renderMarkdown('[click](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)');
    // A data: href on a plain <a> is inert (clicking downloads/navigates, never
    // executes in-page) as long as it wasn't rewritten into something live; the
    // real regression to guard is the link handler not treating it as https/http
    // and routing it through the external-open path.
    const link = previewEl.querySelector('a');
    if (link) {
      expect(link.getAttribute('target')).toBeNull();
    }
    expect(previewEl.innerHTML).not.toContain('<script>');
  });

  it('allows a data: image URI to render as a plain, inert <img>', () => {
    api.renderMarkdown('![x](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)');
    const img = previewEl.querySelector('img');
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toMatch(/^data:image\/png/);
  });
});
