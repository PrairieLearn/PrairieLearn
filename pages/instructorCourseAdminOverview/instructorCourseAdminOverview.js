const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

router.get('/', function(req, res, next) {
    debug('GET /');
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

module.exports = router;
