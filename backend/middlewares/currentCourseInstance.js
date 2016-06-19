var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentCourseInstance.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('currentCourseInstance query failed', err); return res.status(500).end();}
        req.locals = _.extend({
            courseInstance: result.rows[0],
            courseInstanceId: req.params.courseInstanceId,
        }, req.locals);
        next();
    });
};
