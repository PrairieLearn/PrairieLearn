import { Router } from 'express';

const router = Router({ mergeParams: true });

// Placeholder to be enlarged later
router.all('/', (_req, res) => {
  res.redirect('/pl');
});

export default router;
