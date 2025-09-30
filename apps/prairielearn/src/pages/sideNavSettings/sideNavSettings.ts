import { Router } from 'express';

const router = Router();

router.put('/', (req, res) => {
  req.session.side_nav_expanded = Boolean(req.body.side_nav_expanded);
  res.sendStatus(204);
});

export default router;
