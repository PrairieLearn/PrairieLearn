// For the given question, sets Cross-Origin-Opener-Policy to 'same-origin' and
// Cross-Origin-Embedder-Policy: 'require-corp' if cross_origin_isolated is set to true
//
// Beneficial for questions that rely on SharedArrayBuffers.
module.exports = function (req, res, next) {
  if (res.locals.question.cross_origin_isolated === true) {
    res.set({
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    })
  }
  next();
}
