var ERR = require('async-stacktrace');
var _ = require('lodash');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var assessment = require('../../assessment');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userTestInstanceHomework.sql'));

router.get('/', function(req, res, next) {
    if (res.locals.test.type !== 'Homework' && res.locals.test.type !== 'Game') next(); // FIXME: hack to handle 'Game'
    var params = {
        test_instance_id: res.locals.testInstance.id,
        test_id: res.locals.test.id,
    };
    sqldb.query(sql.update, params, function(err, result) {
        if (ERR(err, next)) return;

        var params = {
            test_instance_id: res.locals.testInstance.id,
        };
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.instanceQuestions = result.rows;

            res.render(path.join(__dirname, 'userTestInstanceHomework'), res.locals);
        });
    });
});

module.exports = router;
