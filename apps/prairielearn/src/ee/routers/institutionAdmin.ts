import { Router } from 'express';

import { features } from '../../lib/features/index.js';
import adminsRouter from '../pages/institutionAdminAdmins/institutionAdminAdmins.js';
import coursesRouter from '../pages/institutionAdminCourses/institutionAdminCourses.js';

const router = Router({ mergeParams: true });

router.use(async (req, res, next) => {
  // The navbar relies on this property.
  res.locals.urlPrefix = req.baseUrl;

  const hasEnhancedNavigation = await features.enabled('enhanced-navigation', {
    institution_id: req.params.institution_id,
  });
  res.locals.has_enhanced_navigation = hasEnhancedNavigation;

  next();
});

router.use('/admins', adminsRouter);
router.use('/courses', coursesRouter);

export default router;
