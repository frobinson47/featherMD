// ========================================
// Feather MD -- Preview render-token / LRU cache tests (AUTO-006)
// ========================================
// Covers src/preview/preview.js's renderSeq monotonic-token pattern (a stale
// in-flight render must not land once a newer render has started) and the
// mathCache/mermaidCache LRU (reuse on repeat content, eviction at the bound).
// Neither renderSeq nor the caches are exported -- per the task's own scope,
// this drives them indirectly through renderMarkdown's public surface and
// asserts on mock call counts / DOM state, not on the private internals
// themselves. MERMAID_CACHE_MAX (64) is mirrored here as a literal since it
// isn't exported; if preview.js's constant changes, the eviction test below
// needs updating to match.
//
// The caches are module-level singletons (by design -- they persist across
// renders within one app session), so they also persist across tests in this
// file. Every test therefore uses a unique diagram-label prefix so no test's
// cache entries can accidentally satisfy another test's assertions.

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

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

function mermaidFence(label) {
  return `\`\`\`mermaid\ngraph TD; ${label};\n\`\`\`\n`;
}

async function resolveAllAndFlush() {
  await flushMicrotasks();
  pendingResolvers.forEach((resolve) => resolve());
  pendingResolvers = [];
  await flushMicrotasks();
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

    renderMarkdown(mermaidFence('reuse1-->reuse2'));
    await resolveAllAndFlush();

    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(previewEl.querySelector('svg')).toBeTruthy();

    renderMarkdown(mermaidFence('reuse1-->reuse2'));
    await resolveAllAndFlush();

    // Same source -> cache hit -> render() must not be called a second time.
    expect(mermaid.render).toHaveBeenCalledTimes(1);
    expect(previewEl.querySelector('svg')).toBeTruthy();
  });

  it('calls mermaid.render again for different diagram source (no false cache hit)', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    renderMarkdown(mermaidFence('distinct1-->x'));
    await resolveAllAndFlush();

    renderMarkdown(mermaidFence('distinct2-->y'));
    await resolveAllAndFlush();

    expect(mermaid.render).toHaveBeenCalledTimes(2);
  });
});

describe('Preview render cache -- Mermaid LRU eviction bound', () => {
  it('evicts the least-recently-used entry once the cache exceeds its max size', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    // Fill the cache with MERMAID_CACHE_MAX distinct diagrams, one render call each.
    for (let i = 0; i < MERMAID_CACHE_MAX; i++) {
      renderMarkdown(mermaidFence(`evict-n${i}`));
      await resolveAllAndFlush();
    }
    expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX);

    // One more distinct diagram pushes the cache past its bound, evicting n0 (LRU).
    renderMarkdown(mermaidFence('evict-overflow'));
    await resolveAllAndFlush();
    expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX + 1);

    // n0 was evicted -- re-rendering it must call render() again, not hit the cache.
    renderMarkdown(mermaidFence('evict-n0'));
    await resolveAllAndFlush();
    expect(mermaid.render).toHaveBeenCalledTimes(MERMAID_CACHE_MAX + 2);

    // A recently-rendered diagram (n63, still within the bound) must still be cached.
    mermaid.render.mockClear();
    renderMarkdown(mermaidFence(`evict-n${MERMAID_CACHE_MAX - 1}`));
    await resolveAllAndFlush();
    expect(mermaid.render).not.toHaveBeenCalled();
  });
});

describe('Preview render cache -- stale render abandonment (renderSeq)', () => {
  it('does not let a slow, superseded render land after a newer render has already completed', async () => {
    const previewEl = createPreviewDOM();
    const { renderMarkdown } = initPreview(previewEl);

    // Start render #1 (slow -- its mermaid.render() promise is held open).
    renderMarkdown(mermaidFence('stale-first'));
    await flushMicrotasks();
    expect(pendingResolvers.length).toBe(1);
    const resolveFirst = pendingResolvers[0];
    pendingResolvers = [];

    // Start render #2 before #1's diagram has resolved -- #2 supersedes #1's token.
    renderMarkdown(mermaidFence('stale-second'));
    await resolveAllAndFlush();

    // #2 finished first and landed correctly.
    expect(previewEl.querySelector('svg[data-src*="stale-second"]')).toBeTruthy();

    // Now let #1's stale render resolve. Its renderSeq no longer matches the
    // current one, so it must be discarded rather than overwriting #2's DOM.
    resolveFirst();
    await flushMicrotasks();

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
    await flushMicrotasks(10);

    // Only the second (current) render's math should ever be resolved into the DOM.
    const mathEls = previewEl.querySelectorAll('.fmd-math');
    expect(mathEls.length).toBe(1);
    expect(mathEls[0].innerHTML).toContain('staleMathSecond');
  });
});
