const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');

// TODO:
// eslint-disable-next-line no-unused-vars
router.get('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    debug('GET /');
});

// TODO:
router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
});
module.exports = router;
