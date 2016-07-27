var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var error = require('../error');
var logger = require('../logger');
var filePaths = require('../file-paths');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'homework.sql'));

module.exports = {
    makeQuestionInstances: function(test, course, callback) {
        callback(null, []);
    },

    renderTestInstance: function(testInstance, test, course, callback) {
        
    },
};
