// ========================================
// Feather MD -- Preview render-token / LRU cache tests (AUTO-006)
// ========================================
// Covers src/preview/preview.js's renderSeq monotonic-token pattern (a stale
// in-flight render must not land once a newer render has started) and the
// mermaidCache LRU (reuse on repeat content, eviction at the bound). Neither
// renderSeq nor the caches are exported -- per the task's own scope, this
// drives them indirectly through renderMarkdown's public surface and asserts
// on mock call counts / DOM state, not on the private internals themselves.
// MERMAID_CACHE_MAX (64) is mirrored here as a literal since it isn't
// exported; if preview.js's constant changes, the eviction test below needs
// updating to match.
//
// The caches are module-level singletons (by design -- they persist across
// renders within one app session), so they also persist across tests in this
// file. Every test therefore uses a unique diagram-label prefix so no test's
// cache entries can accidentally satisfy another test's assertions.
//
// Uses polling (waitFor), not a fixed count of flushed ticks: this file runs
// alongside 20+ other test files under Vitest's parallel pool, and a fixed
// number of setTimeout(0) hops is not a reliable proxy for "the async chain
// has settled" under variable system load -- it was, in an earlier version of
// this file, a real source of flakiness when run as part of the full suite.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const MERMAID_CACHE_MAX = 64;

// Deferred control per mermaid.render() call lets tests decide exactly when
// each render "finishes" -- necessary to reproduce a stale-render race.
let mermaidRenderCalls;
let pendingResolvers;

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    parse: vi.fn(async () => true),
    render: vi.fn((id, source) => {
      mermaidRenderCalls.push(source);
      return new Promise((resolve) => {
        pendingResolvers.push(() => resolve({ svg: `<svg data-src="${source}"></svg>` }));
      });
    }),
  },
}));

vi.mock('katex', () => ({
  default: {
    renderToString: vi.fn((tex) => `<span class="katex-stub">${tex}</span>`),
  },
}));

import { initPreview } from '../../src/preview/preview.js';
import mermaid from 'mermaid';
import katex from 'katex';

function createPreviewDOM() {
  const parentEl = document.createElement('div');
  const previewEl = document.createElement('div');
  parentEl.appendChild(previewEl);
  Object.defineProperty(parentEl, 'scrollHeight', { value: 1000, writable: true });
  Object.defineProperty(parentEl, 'clientHeight', { value: 200, writable: true });
  parentEl.scrollTop = 0;
  return previewEl;
}

async function waitFor(predicate, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, 0));
  }
  throw new Error('waitFor timed out');
}

function mermaidFence(label) {
  return `\`\`\`mermaid\ngraph TD; ${label};\n\`\`\`\n`;
}

// Waits for exactly one pending mermaid.render() call to arrive, resolves it,
// then waits for its SVG to actually land in the DOM before returning.
async function renderAndSettle(previewEl, renderMarkdown, label) {
  const callsBefore = mermaidRenderCalls.length;
  renderMarkdown(mermaidFence(label));
  await waitFor(() => mermaidRenderCalls.length > callsBefore);
  const resolver = pendingResolvers.shift();
  resolver();
  await waitFor(() => previewEl.querySelector(`svg[data-src*="${label}"]`) !== null);
}

beforeEach(() => {
  mermaidRenderCalls = [];
  pendingResolvers = [];
  mermaid.render.mockClear();
  mermaid.parse.mockClear();
  katex.renderToString.mockClear();
});

describe('Preview render cache -- Mermaid LRU reuse', () => {
  it('renders a diagram once, then reuses the cached SVG for identical source without calling mermaid.render again', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    await renderAndSettle(previewEl, renderMarkdown, 'reuse1-->reuse2');
    expect(mermaid.render).toHaveBeenCalledTimes(1);

    // Same source -> cache hit -> no new mermaid.render() call, so there's
    // nothing to resolve; just confirm the SVG is (still) present and the
    // call count didn't move.
    renderMarkdown(mermaidFence('reuse1-->reuse2'));
    await waitFor(() => previewEl.querySelector('svg') !== null);
    expect(mermaid.render).toHaveBeenCalledTimes(1);
  });

  it('calls mermaid.render again for different diagram source (no false cache hit)', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    await renderAndSettle(previewEl, renderMarkdown, 'distinct1-->x');
    await renderAndSettle(previewEl, renderMarkdown, 'distinct2-->y');

    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });
});

describe('Preview render cache -- Mermaid LRU eviction bound', () => {
  it(
    'evicts the least-recently-used entry once the cache exceeds its max size',
    async () => {
      const previewEl = createPreviewDOM();
      const { renderMarkdown } = initPreview(previewEl);

      // Fill the cache with MERMAID_CACHE_MAX distinct diagrams, one render call each.
      for (let i = 0; i < MERMAID_CACHE_MAX; i++) {
        await renderAndSettle(previewEl, renderMarkdown, `evict-n${i}`);
      }
      expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX);

      // One more distinct diagram pushes the cache past its bound, evicting n0 (LRU).
      await renderAndSettle(previewEl, renderMarkdown, 'evict-overflow');
      expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX + 1);

      // n0 was evicted -- re-rendering it must call render() again, not hit the cache.
      await renderAndSettle(previewEl, renderMarkdown, 'evict-n0');
      expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX + 2);

      // A recently-rendered diagram (n63, still within the bound) must still be cached.
      mermaid.render.mockClear();
      renderMarkdown(mermaidFence(`evict-n${MERMAID_CACHE_MAX - 1}`));
      await waitFor(() => previewEl.querySelector(`svg[data-src*="evict-n${MERMAID_CACHE_MAX - 1}"]`) !== null);
      expect(mermaid.render).not.toHaveBeenCalled();
    },
    20000,
  );
});

describe('Preview render cache -- stale render abandonment (renderSeq)', () => {
  it('does not let a slow, superseded render land after a newer render has already completed', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    // Start render #1 (slow -- its mermaid.render() promise is held open).
    renderMarkdown(mermaidFence('stale-first'));
    await waitFor(() => pendingResolvers.length === 1);
    const resolveFirst = pendingResolvers.shift();

    // Start render #2 before #1's diagram has resolved -- #2 supersedes #1's token.
    await renderAndSettle(previewEl, renderMarkdown, 'stale-second');

    // #2 finished first and landed correctly.
    expect(previewEl.querySelector('svg[data-src*="stale-second"]')).toBeTruthy();

    // Now let #1's stale render resolve. Its renderSeq no longer matches the
    // current one, so it must be discarded rather than overwriting #2's DOM.
    resolveFirst();
    await new Promise((r) => setTimeout(r, 50));

    expect(previewEl.querySelector('svg[data-src*="stale-second"]')).toBeTruthy();
    expect(previewEl.querySelector('svg[data-src*="stale-first"]')).toBeFalsy();
  });

  it('aborts a stale math render the same way when superseded before KaTeX resolves', async () => {
    // katex.renderToString is synchronous in the real module, but the awaited
    // loadKatex() import itself is what creates the async gap this test needs --
    // so this exercises the renderSeq guard right after that await, matching
    // the real code path (`if (!katex || seq !== renderSeq) return;`).
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    renderMarkdown('$staleMathFirst$');
    renderMarkdown('$staleMathSecond$');

    await waitFor(() => {
      const el = previewEl.querySelector('.fmd-math');
      return el !== null && el.innerHTML.includes('staleMathSecond');
    });

    // Only the second (current) render's math should ever be resolved into the DOM.
    const mathEls = previewEl.querySelectorAll('.fmd-math');
    expect(mathEls.length).toBe(1);
    expect(mathEls[0].innerHTML).toContain('staleMathSecond');
  });
});
