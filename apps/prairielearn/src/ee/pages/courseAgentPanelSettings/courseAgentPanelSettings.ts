import { Router } from 'express';
import { z } from 'zod';

import { parseRequestBody } from '@prairielearn/zod';

const router = Router();

const PutBodySchema = z.object({ open: z.boolean() });

// Remembers whether the course agent panel is open, so it stays open across
// page navigations. Mirrors the side nav's settings route.
router.put('/', (req, res) => {
  const body = parseRequestBody(req, PutBodySchema);
  req.session.course_agent_panel_open = body.open;
  res.sendStatus(204);
});

export default router;
