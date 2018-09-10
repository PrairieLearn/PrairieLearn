const express = require('express');
const router = express.Router();

// Pretty-print all JSON responses
router.use(require('./prettyPrintJson'));

// All course instance pages require authorization
router.use('/course_instances/:course_instance_id', [
    require('../../middlewares/authzCourseInstance'),
    require('../../middlewares/authzCourseInstanceHasInstructorView'),
]);

// ROUTES
router.use('/course_instances/:course_instance_id/assessments', require('./endpoints/courseInstanceAssessments'));

// If no earlier routes matched, 404 the route
router.use(require('./notFound'));

// Handle errors independently from the normal PL eror handling
router.use(require('./error'));

module.exports = router;