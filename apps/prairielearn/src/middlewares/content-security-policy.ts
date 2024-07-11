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

  const originalResType: typeof res.type = res.type.bind(res);
  res.type = (type) => {
    if (type === 'application/pdf') {
      // Loosen CSP restrictions for PDF files, as they can cause issues if the file
      // is embedded, and are not expected to cause issues with XSS.
      res.header('Content-Security-Policy', "frame-ancestors 'self';");
      res.header('X-Frame-Options', 'SAMEORIGIN');
    }
    return originalResType(type);
  };

  next();
});

export default router;
