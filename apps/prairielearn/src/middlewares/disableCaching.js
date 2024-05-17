import { Router } from 'express';

const router = Router();

router.all('/*', function (req, res, next) {
  res.header('Cache-Control', 'max-age=0, no-cache, no-store, must-revalidate');

  next();
});

export default router;
