var _ = require('underscore');
var fs = require('fs');
var path = require('path');

var config = require("./config");
var logger = require('./logger');
var courseDB = require("./course-db");

module.exports = {};

module.exports.questionFilePath = function(qid, filename, callback, nTemplates) {
    nTemplates = (nTemplates === undefined) ? 0 : nTemplates;
    if (nTemplates > 10) {
        return callback("Too-long template recursion for qid: " + qid);
    }
    var info = courseDB.questionDB[qid];
    if (info === undefined) {
        return callback("QID not found in questionDB: " + qid);
    }
    var questionPath = path.join(config.questionsDir, qid);
    var fullFilePath = path.join(questionPath, filename);
    fs.stat(fullFilePath, function(err, stats) {
        if (err) {
            // couldn't find the file
            if (info.template !== undefined) {
                // have a template, try it
                return module.exports.questionFilePath(info.template, filename, callback, nTemplates + 1);
            } else {
                // no template, try default files
                var filenameToSuffix = {
                    "client.js": 'Client.js',
                    "server.js": 'Server.js',
                };
                if (filenameToSuffix[filename] === undefined) {
                    return callback("file not found: " + fullFilePath);
                }
                var defaultFilename = info.type + filenameToSuffix[filename];
                var fullDefaultFilePath = path.join(config.questionDefaultsDir, defaultFilename);
                fs.stat(fullDefaultFilePath, function(err, stats) {
                    if (err) {
                        // no default file, give up
                        return callback("file not found: " + fullFilePath);
                    }
                    // found a default file
                    return callback(null, {filePath: defaultFilename, qid: qid, filename: filename, root: config.questionDefaultsDir});
                });
            }
        } else {
            // found the file
            return callback(null, {filePath: filename, qid: qid, filename: filename, root: questionPath});
        }
    });
};

