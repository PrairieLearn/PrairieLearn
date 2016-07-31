var _ = require('underscore');
var path = require('path');
var logger = require('../logger');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'currentTestInstance.sql'));

module.exports = function(req, res, next) {
    var params = {testInstanceId: req.params.testInstanceId, userId: req.locals.user.id};
    sqldb.queryOneRow(sql.all, params, function(err, result) {
        if (err) return next(err);
        req.locals.testInstance = result.rows[0];
        next();
    });
};
