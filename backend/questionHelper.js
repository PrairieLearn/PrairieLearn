var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var logger = require('./logger');
var filePaths = require('./file-paths');
var requireFrontend = require("./require-frontend");

module.exports = {
    loadServer: function(question, course, callback) {
        filePaths.questionFilePathNEW("server.js", question.directory, course.path, function(err, questionServerPath) {
            if (err) return callback(err);
            requireFrontend([questionServerPath], function(server) {
                if (server === undefined) return callback("Unable to load 'server.js' for qid: " + question.qid);
                setTimeout(function() {
                    // use a setTimeout() to get out of requireJS error handling
                    return callback(null, server);
                }, 0);
            });
        });
    },

    questionFileUrl: function(filename, locals) {
        return path.join(locals.urlPrefix, "question", String(locals.question.id), "file", filename);
    },
};
