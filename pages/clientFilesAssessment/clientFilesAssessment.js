var path = require('path');
var express = require('express');
var router = express.Router();

const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function(req, res, next) {
    const filename = req.params[0];
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    const chunk = {
        'type': 'clientFilesAssessment',
        'courseInstanceId': res.locals.course_instance.id,
        'assessmentId': res.locals.assessment.id,
    };
    chunks.ensureChunksForCourse(res.locals.course.id, chunk, (err) => {
        if (ERR(err, next)) return;

        const clientFilesDir = path.join(
            coursePath,
            'courseInstances',
            res.locals.course_instance.short_name,
            'assessments',
            res.locals.assessment.tid,
            'clientFilesAssessment',
        );
        res.sendFile(filename, {root: clientFilesDir});
    });
});

module.exports = router;
