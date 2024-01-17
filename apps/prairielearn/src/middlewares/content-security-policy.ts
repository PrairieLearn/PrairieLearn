import { Router } from 'express';

const router = Router();

router.all('/*', function (req, res, next) {
  // Prevent PrairieLearn from being rendered in an iframe.
  res.header('Content-Security-Policy', "frame-ancestors: 'none';");

  next();
});

export default router;
