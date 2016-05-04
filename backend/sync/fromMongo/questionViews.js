var _ = require('underscore');
var async = require('async');
var Promise = require('bluebird');

var models = require('../../models');
var config = require('../../config');
var logger = require('../../logger');
var db = require('../../db');

module.exports = {
    sync: function(courseInfo, testDB, questionDB, callback) {
        var that = module.exports;
        db.accessCollect.find({}, function(err, cursor) {
            if (err) return callback(err);
            cursor.count(function(err, nObj) {
                if (err) return callback(err);
                var i = 0;
                (function handle() {
                    cursor.next(function(err, a) {
                        if (err) return callback(err);
                        if (a == null) return callback(null);
                        if (i % 1000 === 0) logger.infoOverride("accesses: " + i + " of " + nObj);
                        i++;
                        if (a.method !== "GET") return setTimeout(handle, 0);
                        if (a.userUID !== a.authUID) return setTimeout(handle, 0);
                        var result = /^\/qInstances\/([^\/]+)\/client.js/.exec(a.path);
                        if (result == null) return setTimeout(handle, 0);
                        var qiid = result[1];
                        Promise.try(function() {
                            var questionInstance;
                            return Promise.try(function() {
                                return models.QuestionInstance.findOne({where: {
                                    qiid: qiid,
                                }});
                            }).then(function(findQuestionInstance) {
                                questionInstance = findQuestionInstance;
                                if (!questionInstance) throw Error('no questionInstance where qiid = ' + qiid + ' for aid = ' + a.aid);
                                return models.QuestionView.findOrCreate({where: {
                                    mongoId: String(a._id),
                                }});
                            }).spread(function(newQuestionView, created) {
                                questionView = newQuestionView;
                                return questionView.update({
                                    date: a.timestamp,
                                    questionInstanceId: questionInstance.id,
                                });
                            }).then(function() {
                                if (i % 1000 == 0) {
                                    setTimeout(handle, 0);
                                } else {
                                    handle();
                                }
                            }).catch(function(err) {
                                logger.error(err);
                                setTimeout(handle, 0);
                            });
                        });
                    });
                })();
            });
        });
    },
};
