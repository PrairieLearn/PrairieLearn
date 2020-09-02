var path = require('path');
var express = require('express');
var router = express.Router();

const chunks = require('../../lib/chunks');
const ERR = require('async-stacktrace');

router.get('/*', function(req, res, next) {
    const filename = req.params[0];
    const coursePath = chunks.getRuntimeDirectoryForCourse(res.locals.course);
    const chunk = {
        'type': 'question',
        'questionId': res.locals.question.id,
    };
    chunks.ensureChunksForCourse(res.locals.course.id, chunk, (err) => {
        if (ERR(err, next)) return;

        const clientFilesDir = path.join(
            coursePath,
            'questions',
            res.locals.question.directory,
            'clientFilesQuestion',
        );
        res.sendFile(filename, {root: clientFilesDir});
    });
});

module.exports = router;
