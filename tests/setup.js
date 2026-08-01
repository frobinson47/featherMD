// jsdom has no layout engine, so Range has no getClientRects/getBoundingClientRect
// (see https://github.com/jsdom/jsdom/issues/3729). CodeMirror 6's measure loop calls
// these during mount; without a stub it throws internally on every measure pass and
// spams stderr, even though it degrades gracefully and tests still pass.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    return [];
  };
}

if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  };
}
