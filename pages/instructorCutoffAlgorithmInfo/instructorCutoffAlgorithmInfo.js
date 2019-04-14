const express = require('express');
const router = express.Router();
const debug = require('debug')('prairielearn:instructorCutoffAlgorithmInfo');

router.get('/', function(req, res, _next) {
    debug('GET /');
    debug('render page');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
