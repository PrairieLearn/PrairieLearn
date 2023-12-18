import { Router } from 'express';
import asyncHandler = require('express-async-handler');

const router = Router({ mergeParams: true });

router.get('/', asyncHandler((req, res) => {
  res.locals.navSubPage = 'lti13';
  res.send("OK");
}));

export default router;
