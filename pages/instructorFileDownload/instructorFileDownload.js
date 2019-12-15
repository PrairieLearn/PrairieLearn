const express = require('express');
const router = express.Router();

router.get('/*', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Insufficient permissions'));
    if (req.query.type) res.type(req.query.type);
    if (req.query.attachment) res.attachment(req.query.attachment);
    res.sendFile(decodeURIComponent(req.params[0]), {root: res.locals.course.path});
});

module.exports = router;
