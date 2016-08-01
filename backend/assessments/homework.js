var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var error = require('../error');
var logger = require('../logger');
var filePaths = require('../file-paths');
var sqldb = require('../sqldb');
var sqlLoader = require('../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'homework.sql'));

module.exports = {
    newTestInstance: function(testInstance, test, course, callback) {
        callback(null);
    },
    
    updateTestInstance: function(testInstance, test, course, locals, callback) {
        var params = {
            test_instance_id: testInstance.id,
            test_id: test.id,
        };
        sqldb.query(sql.update, params, function(err, result) {
            if (ERR(err, callback)) return;
            callback(null, result);
        });
    },
    
    renderTestInstance: function(testInstance, locals, callback) {
        var extraHeader = null;
        var params = {
            test_instance_id: testInstance.id,
        };
        sqldb.query(sql.get_questions, params, function(err, result) {
            if (ERR(err, callback)) return;
            var loc = _.extend({
                instanceQuestions: result.rows,
            }, locals);
            console.log(loc.instanceQuestions);
            ejs.renderFile(path.join(__dirname, 'homeworkTestInstance.ejs'), loc, function(err, html) {
                if (ERR(err, callback)) return;
                callback(null, extraHeader, html);
            });
        });
    },
};
