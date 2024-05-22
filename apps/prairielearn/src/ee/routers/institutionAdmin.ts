import { Router } from 'express';

import adminsRouter from '../pages/institutionAdminAdmins/institutionAdminAdmins.js';
import coursesRouter from '../pages/institutionAdminCourses/institutionAdminCourses.js';

const router = Router({ mergeParams: true });

router.use((req, res, next) => {
  // The navbar relies on this property.
  res.locals.urlPrefix = req.baseUrl;

  next();
});

router.use('/admins', adminsRouter);
router.use('/courses', coursesRouter);

export default router;
