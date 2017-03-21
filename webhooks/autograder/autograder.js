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

router.post('/', function(req, res, next) {

    if (!req.body.secret) {
        return next(new Error('No secret specified'))
    }

    if (req.body.secret !== config.autograderWebhookSecret) {
        return next(new Error('Invalid secret'));
    }

    if (req.body.event === 'autograder_result') {
        validate(req.body, 'schemas/webhookAutograderResult.json', (err, data) => {
            if (err) return next(err)

            // TODO actually process the results
            logger(JSON.stringify(data, null, 4))
        })
    } else {
        return next(new Error('Unknown event'));
    }
});

module.exports = router;
