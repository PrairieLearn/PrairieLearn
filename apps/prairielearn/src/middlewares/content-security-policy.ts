import { Router } from 'express';

const router = Router();

router.all('/*', function (req, res, next) {
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
  //
  // Currently, we only use CSP to prevent PrairieLearn from being rendered in
  // an iframe.
  res.header('Content-Security-Policy', "frame-ancestors 'none';");

  // Added for backwards compatibility with older browsers.
  res.header('X-Frame-Options', 'DENY');

  next();
});

export default router;
