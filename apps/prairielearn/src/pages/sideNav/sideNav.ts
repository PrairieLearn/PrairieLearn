import { Router } from 'express';

import { html } from '@prairielearn/html';

const router = Router();

// TODO: move this out of pages

router.put('/', async (req, res) => {
  // The side nav is shown by default, which is why we use the ?? true here.
  req.session.show_side_nav = !(req.session.show_side_nav ?? true);
  res.status(200).send(html`<div></div>`);
});

export default router;
