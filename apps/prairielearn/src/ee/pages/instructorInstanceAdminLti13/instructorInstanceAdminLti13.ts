import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { loadSqlEquiv, queryRow } from '@prairielearn/postgres';
import { InstructorInstanceAdminLti13 } from './instructorInstanceAdminLti13.html';
import { selectLti13InstancesByCourseInstance } from '../../models/lti13Instance';
import { Lti13CourseInstanceSchema } from '../../../lib/db-types';


const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

// Check for permissions

router.get('/', asyncHandler(async (req, res) => {
  const lti13Instances = await selectLti13InstancesByCourseInstance(res.locals.course_instance.id);

  const lti13_instance_id = lti13Instances[0].id;

  res.redirect(`/pl/course_instance/${res.locals.course_instance.id}/instructor/instance_admin/lti13_instance/${lti13_instance_id}`);
}));

router.get('/:unsafe_lti13_instance_id', asyncHandler(async (req, res) => {
  res.locals.navSubPage = 'lti13';

  const lti13Instances = await selectLti13InstancesByCourseInstance(res.locals.course_instance.id);

  const lti13Instance = lti13Instances.find(li => li.id === req.params.unsafe_lti13_instance_id);
  console.log(lti13Instance);
  if (!lti13Instance) {
    throw new Error(`LTI 1.3 instance not found.`);
  }

  const lti13CourseInstance = await queryRow(sql.get_lci, {
    course_instance_id: res.locals.course_instance.id,
    lti13_instance_id: lti13Instance.id,
  }, Lti13CourseInstanceSchema);

  console.log(lti13CourseInstance);

  res.send(InstructorInstanceAdminLti13({
    resLocals: res.locals,
    lti13Instance,
    lti13Instances,
    lti13CourseInstance,
  }));
}));

router.post('/:unsafe_lti13_instance_id', asyncHandler(async (req, res) => {
  res.send('OK');
}));

export default router;
