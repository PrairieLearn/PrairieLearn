var ERR = require('async-stacktrace');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var error = require('./error');
var filePaths = require('./file-paths');
var requireFrontend = require('./require-frontend');

module.exports = {
    loadServer: function(question, course, callback) {
        filePaths.questionFilePath('server.js', question.directory, course.path, question, function(err, questionServerPath) {
            if (ERR(err, callback)) return;
            var configRequire = requireFrontend.config({
                paths: {
                    clientFilesCourse: path.join(course.path, 'clientFilesCourse'),
                    serverFilesCourse: path.join(course.path, 'serverFilesCourse'),
                    clientCode: path.join(course.path, 'clientFilesCourse'),
                    serverCode: path.join(course.path, 'serverFilesCourse'),
                },
            });
            configRequire([questionServerPath], function(server) {
                if (server === undefined) return callback('Unable to load "server.js" for qid: ' + question.qid);
                setTimeout(function() {
                    // use a setTimeout() to get out of requireJS error handling
                    return callback(null, server);
                }, 0);
            });
        });
    },

    questionFileUrl: function(filename, locals) {
        return locals.urlPrefix + '/question/' + String(locals.question.id) + '/file/' + filename;
    },

    renderRivetsTemplate: function(filename, context, question, course, locals, callback) {
        var that = this;
        filePaths.questionFilePath(filename, question.directory, course.path, question, function(err, templatePath) {
            if (ERR(err, callback)) return;
            fs.readFile(templatePath, 'utf8', function(err, template) {
                if (ERR(err, callback)) return;
                template = template.replace(/<% *print\(([^}]+?)\) *%>/g, '<%= $1 %>');
                template = template.replace(/{{([^}]+)}}/g, '<%= $1 %>');
                var extContext = _.defaults({
                    questionFile: function(filename) {return that.questionFileUrl(filename, locals);},
                }, context);
                try {
                    var html = ejs.render(template, extContext);
                } catch (e) {
                    return callback(error.addData(e, {templatePath: templatePath}));
                }
                callback(null, html);
            });
        });
    },
};
