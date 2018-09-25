const express = require('express');
const router = express.Router();
const debug = require('debug')('prairielearn:instructorAssessment');

router.get('/', function(req, res, next) {
    debug('GET /');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
