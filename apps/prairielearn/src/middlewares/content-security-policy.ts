import { Router } from 'express';
import onHeaders from 'on-headers';

const router = Router();

router.all('/*', function (req, res, next) {
  // https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
  //
  // Currently, we only use CSP to prevent PrairieLearn from being rendered in
  // an iframe.
  res.header('Content-Security-Policy', "frame-ancestors 'none';");

  // Added for backwards compatibility with older browsers.
  res.header('X-Frame-Options', 'DENY');

  onHeaders(res, () => {
    if (res.getHeader('Content-Type') === 'application/pdf') {
      // Loosen CSP restrictions for PDF files, as they can cause issues if the file
      // is embedded, and are not expected to cause issues with XSS.
      res.header('Content-Security-Policy', "frame-ancestors 'self';");
      res.header('X-Frame-Options', 'SAMEORIGIN');
    }
  });

  next();
});

export default router;
