const util = require('util');
const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const _ = require('lodash');

const error = require('@prairielearn/prairielib/error');
const assessment = require('../../lib/assessment');
const studentAssessmentInstance = require('../shared/studentAssessmentInstance');

router.get('/', function(req, res, next) {
    if (res.locals.assessment.type !== 'Exam') return next();
    
    var retval = {
        serverRemainingMS: res.locals.assessment_instance_remaining_ms,
        serverTimeLimitMS: res.locals.assessment_instance_time_limit_ms,
    };
    res.send(JSON.stringify(retval));
});

module.exports = router;
