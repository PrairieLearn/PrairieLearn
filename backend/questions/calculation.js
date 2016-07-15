var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var ejs = require('ejs');

var logger = require('../logger');
var filePaths = require('../file-paths');
var questionHelper = require('../questionHelper.js');

module.exports = {
    getData: function(question, course, vid, callback) {
        questionHelper.loadServer(question, course, function(err, server) {
            if (err) return callback(err);
            try {
                var questionData = server.getData(vid, question.options, 'INVALID QUESTION DIRECTORY');
            } catch (e) {
                return callback(new Error('Error in question getData(): ' + String(e)));
            }
            callback(null, questionData);
        });
    },

    renderQuestion: function(questionInstance, question, submission, course, locals, callback) {
        filePaths.questionFilePathNEW("question.html", question.directory, course.path, function(err, questionTemplatePath) {
            if (err) return callback(err);
            fs.readFile(questionTemplatePath, 'utf8', function(err, questionTemplate) {
                if (err) return callback(err);
                questionTemplate = questionTemplate.replace(/<% *print\(([^}]+?)\) *%>/g, '<%= $1 %>');
                questionTemplate = questionTemplate.replace(/{{([^}]+)}}/g, '<%= $1 %>');
                var context = {
                    params: questionInstance.params,
                    questionFile: function(filename) {return questionHelper.questionFileUrl(filename, locals);},
                    feedback: {},
                };
                try {
                    var questionHtml = ejs.render(questionTemplate, context);
                } catch (e) {
                    return callback(new Error('Error rendering "' + questionTemplatePath + '": ' + String(e)));
                }
                callback(null, questionHtml);
            });
        });
    },
};
