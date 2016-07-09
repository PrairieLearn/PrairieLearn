var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var logger = require('../logger');
var filePaths = require('../file-paths');
var requireFrontend = require("../require-frontend");

module.exports = {
    loadServer: function(question, course, callback) {
        filePaths.questionFilePathNEW("server.js", question.directory, course.directory, function(err, questionServerPath) {
            if (err) return callback(err);
            requireFrontend([serverFilePath], function(server) {
                if (server === undefined) return callback("Unable to load 'server.js' for qid: " + qid);
                return callback(null, server);
            });
        });
    },
};
