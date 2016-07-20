var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var error = require('./error');
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
        return locals.urlPrefix + "/question/" + String(locals.question.id) + "/file/" + filename;
    },

    renderRivetsTemplate: function(filename, context, question, course, locals, callback) {
        var that = this;
        filePaths.questionFilePathNEW(filename, question.directory, course.path, function(err, templatePath) {
            if (err) return callback(err);
            fs.readFile(templatePath, 'utf8', function(err, template) {
                if (err) return callback(err);
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
