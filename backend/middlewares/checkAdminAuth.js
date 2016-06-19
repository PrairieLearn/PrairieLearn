var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'checkAdminAuth.sql'));

module.exports = function(req, res, next) {
    var params = [req.params.courseInstanceId, req.authUID];
    sqldb.query(sql.all, params, function(err, result) {
        if (err) {logger.error('admin auth query failed', err); return res.status(500).end();}
        if (result.rowCount === 0) {
            return res.status(403).end();
        }
        next();
    });
};
