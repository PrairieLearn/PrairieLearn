var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var express = require('express');
var router = express.Router();

var validate = require('../../lib/validator').validateFromFile;
var config = require('../../lib/config');
var logger = require('../../lib/logger');
var filePaths = require('../../lib/file-paths');
var assessments = require('../../assessments');


router.post('/', function(req, res, next) {

    if (req.body.event === 'autograder_result') {
        validate(req.body, 'schemas/webhookAutograderResult.json', (err, data) => {
            if (ERR(err, next)) return;

            // TODO actually process the results
            logger.info(JSON.stringify(data, null, 4));

            const gradingResult = {
                gradingId: data.job_id,
                grading: {
                }
            }

            // assessments.

            res.status(200);
            res.send();
        })
    } else {
        return next(new Error('Unknown event'));
    }
});

module.exports = router;
