var ERR = require('async-stacktrace');
var fs = require('fs');
var path = require('path');

var error = require('@prairielearn/prairielib/error');
var config = require('./config');
var sqldb = require('@prairielearn/prairielib/sql-db');
var sqlLoader = require('@prairielearn/prairielib/sql-loader');

var sql = sqlLoader.loadSqlEquiv(__filename);

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
    var rootPath = path.join(coursePath, 'questions', questionDirectory);
    var fullPath = path.join(rootPath, filename);
    if (nTemplates > 10) {
        return callback(new Error('Too-long template recursion: ' + rootPath));
    }
    fs.stat(fullPath, function(err, _stat) {
        if (err) {
            // couldn't find the file
            if (question.template_directory) {
                // have a template, try it
                var params = {
                    course_id: question.course_id,
                    directory: question.template_directory,
                };
                sqldb.queryZeroOrOneRow(sql.select_question, params, function(err, result) {
                    if (ERR(err, callback)) return;
                    if (result.rowCount == 0) {
                        return callback(error.make(500, 'Could not find template question "'
                                                   + question.template_directory
                                                   + '" from question "'
                                                   + question.directory + '"', {sql: sql.select_question, params: params}));
                    }
                    var templateQuestion = result.rows[0];
                    return module.exports.questionFilePath(filename, templateQuestion.directory, coursePath, templateQuestion, function(err, fullPath, effectiveFilename, rootPath) {
                        if (ERR(err, callback)) return;
                        callback(null, fullPath, effectiveFilename, rootPath);
                    }, nTemplates + 1);
                });
            } else {
                // no template, try default files
                var filenameToSuffix = {
                    'client.js': 'Client.js',
                    'server.js': 'Server.js',
                };
                if (filenameToSuffix[filename] === undefined) {
                    // no default for this file type, so try clientFilesCourse
                    let rootPathCourse = path.join(coursePath, 'clientFilesCourse');
                    let fullPathCourse = path.join(rootPathCourse, filename);
                    fs.stat(fullPathCourse, function(err, _stat) {
                        if (err) {
                            // file also wasn't in clientFilesCourse, give up
                            return callback(new Error('file not found at: ' + fullPath + ' or: ' + fullPathCourse));
                        } else {
                            // found the file in clientFilesCourse
                            return callback(null, fullPathCourse, filename, rootPathCourse);
                        }
                    });
                } else {
                    var defaultFilename = question.type + filenameToSuffix[filename];
                    var fullDefaultFilePath = path.join(config.questionDefaultsDir, defaultFilename);
                    fs.stat(fullDefaultFilePath, function(err, _stat) {
                        if (err) {
                            // no default file, give up
                            return callback(error.makeWithData('file not found', {fullPath, fullDefaultFilePath}));
                        } else {
                            // found a default file
                            return callback(null, fullDefaultFilePath, defaultFilename, config.questionDefaultsDir);
                        }
                    });
                }
            }
        } else {
            // found the file
            return callback(null, fullPath, filename, rootPath);
        }
    });
};
