const express = require('express');
const router = express.Router();

router.get('/*', function(req, res, next) {
    if (!res.locals.authz_data.has_course_permission_edit) return next(new Error('Insufficient permissions'));
    if (req.query.type) res.type(req.query.type);
    res.sendFile(decodeURIComponent(req.params[0]), {root: res.locals.course.path});
});

module.exports = router;
