import { Router } from 'express';

import instructorInstanceAdminLti13 from '../pages/instructorInstanceAdminLti13/instructorInstanceAdminLti13.js';
import instructorInstanceAdminLti13Assessments from '../pages/instructorInstanceAdminLti13Assessments/instructorInstanceAdminLti13Assessments.js';
import instructorInstanceAdminLti13Settings from '../pages/instructorInstanceAdminLti13Settings/instructorInstanceAdminLti13Settings.js';

const router = Router({ mergeParams: true });

router.use('/', instructorInstanceAdminLti13);
router.use('/', instructorInstanceAdminLti13Assessments);
router.use('/', instructorInstanceAdminLti13Settings);

export default router;
