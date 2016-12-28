var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var error = require('./error');
var config = require("./config");
var logger = require('./logger');
var courseDB = require("./course-db");

module.exports = {};

/* returns (fullPath, effectiveFilename, rootPath)

   fullPath is the full path (including filename) of the file to load

   (effectiveFilename, rootPath) are equivalent data broken out so that
       fullPath = effectiveFilename + '/' + rootPath
   These can by used like:
       res.sendFile(effectiveFilename, {root: rootPath});
   for safety.
*/
module.exports.questionFilePath = function(filename, questionDirectory, coursePath, question, callback, nTemplates) {
    nTemplates = (nTemplates === undefined) ? 0 : nTemplates;
    if (nTemplates > 10) {
        return callback(new Error("Too-long template recursion for qid: " + qid));
    }
    var rootPath = path.join(coursePath, "questions", questionDirectory);
    var fullPath = path.join(rootPath, filename);
    fs.stat(fullPath, function(err, stats) {
        if (err) {
            // couldn't find the file
            if (question.template_directory) {
                // have a template, try it
                return module.exports.questionFilePath(filename, question.template_directory, coursePath, question, function(err, fullPath, effectiveFilename, rootPath) {
                    if (ERR(err, callback)) return;
                    callback(null, fullPath, effectiveFilename, rootPath);
                }, nTemplates + 1);
            } else {
                // no template, try default files
                var filenameToSuffix = {
                    "client.js": 'Client.js',
                    "server.js": 'Server.js',
                };
                if (filenameToSuffix[filename] === undefined) {
                    return callback(new Error("file not found: " + fullPath));
                }
                var defaultFilename = question.type + filenameToSuffix[filename];
                var fullDefaultFilePath = path.join(config.questionDefaultsDir, defaultFilename);
                fs.stat(fullDefaultFilePath, function(err, stats) {
                    if (err) {
                        // no default file, give up
                        return callback(error.makeWithData("file not found", {fullPath, fullDefaultFilePath}));
                    }
                    // found a default file
                    return callback(null, fullDefaultFilePath, defaultFilename, config.questionDefaultsDir);
                });
            }
        } else {
            // found the file
            return callback(null, fullPath, filename, rootPath);
        }
    });
};
