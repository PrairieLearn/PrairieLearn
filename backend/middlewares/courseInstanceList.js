var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'courseInstanceList.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('courseInstanceList query failed', err); return res.status(500).end();}
        req.locals = _.extend({
            courseInstanceList: result.rows,
        }, req.locals);
        next();
    });
};
