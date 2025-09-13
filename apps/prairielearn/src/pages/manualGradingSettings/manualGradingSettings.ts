import { Router } from 'express';

const router = Router();

router.put('/', async (req, res) => {
  req.session.skip_graded_submissions = Boolean(req.body.skip_graded_submissions);
  res.sendStatus(204);
});

export default router;
