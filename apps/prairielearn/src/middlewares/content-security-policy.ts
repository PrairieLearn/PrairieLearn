import { Router } from 'express';

const router = Router();

router.all('/*', function (req, res, next) {
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
  //
  // Currently, we only use CSP to prevent PrairieLearn from being rendered in
  // an iframe.
  res.header('Content-Security-Policy', "frame-ancestors: 'none';");

  next();
});

export default router;
