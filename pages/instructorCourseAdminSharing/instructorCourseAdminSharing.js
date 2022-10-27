const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const fs = require('fs-extra');
const async = require('async');
const ERR = require('async-stacktrace');
const logger = require('../../lib/logger');
const error = require('../../prairielib/lib/error');
const { InstructorSharing } = require('./instructorCourseAdminSharing.html')

router.get('/', function (req, res, next) {
  debug('GET /');

  console.log(res.locals);

  // TODO get stuff from query
  sharing_sets = [
    {
      name: 'derivatives',
      shared_to: [
        'calculus 1',
        'calculus 2'
      ]
    },
    {
      name: 'proofs',
      shared_to: [
      ]
    }
  ]

  res.send(InstructorSharing({
    sharing_name: 'test-course',
    sharing_id:  "qp4oumpo4wmrpq",
    sharing_sets: sharing_sets,
    resLocals: res.locals
  }));
});

router.post('/', (req, res, next) => {
  if (!res.locals.authz_data.has_course_permission_own) {
    return next(error.make(403, 'Access denied (must be course owner)'));
  }
});

module.exports = router;
