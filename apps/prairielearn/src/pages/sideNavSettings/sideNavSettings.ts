import { Router } from 'express';

const router = Router();

router.put('/', async (req, res) => {
  const new_state = Boolean(req.body.side_nav_expanded);
  req.session.side_nav_expanded = new_state;
  res.status(200).json({
    side_nav_expanded: new_state,
  });
});

export default router;
