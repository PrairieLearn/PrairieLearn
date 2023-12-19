import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { InstructorInstanceAdminLti13 } from './instructorInstanceAdminLti13.html';

const router = Router({ mergeParams: true });

// Check for permissions

router.get('/', asyncHandler(async (req, res) => {
  res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/1`);
}));

router.get('/:unsafe_lti13_instance_id', asyncHandler(async (req, res) => {
  res.locals.navSubPage = 'lti13';
  res.send(InstructorInstanceAdminLti13({
    resLocals: res.locals,
    lti13_instance_id: req.params.unsafe_lti13_instance_id,
  }));
}));

router.post('/:unsafe_lti13_instance_id', asyncHandler(async (req, res) => {
  res.send('OK');
}));

export default router;
