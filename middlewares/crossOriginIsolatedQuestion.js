/**
 * Allows questions to opt in to cross-origin isolation. This is useful for
 * questions that rely on advanced features like `SharedArrayBuffer`.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/API/crossOriginIsolated
 */
module.exports = function (req, res, next) {
  if (res.locals.question.cross_origin_isolated === true) {
    res.set({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
  }
  next();
};
