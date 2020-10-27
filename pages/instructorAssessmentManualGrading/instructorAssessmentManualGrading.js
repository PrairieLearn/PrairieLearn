const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');

// eslint-disable-next-line no-unused-vars
router.get('/', function(req, res, next) {
    debug('GET /');
    // TODO: Implement logic to:
    //       - Display all questions from the assignment, and list percentage graded
    //       - Hotlink to question statistics (so it's easy to bounce over and see current scores)
    //       - Hotlink to the "first question to grade" from each assessment (can be random)
    //       - Grab anything else we may need for a useful UI (assigning TAs to mark a given question?)
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    // TODO: Do manual grading to force mark all questions as finished grading
    // TODO: Implement action to force mark a single question as finished grading
    // TODO: Ideate if we need any other endpoints on this page.
    return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
});
module.exports = router;
