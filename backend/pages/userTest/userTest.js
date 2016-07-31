var _ = require('underscore');
var path = require('path');
var csvStringify = require('csv').stringify;
var express = require('express');
var router = express.Router();

var assessment = require('../../assessment');
var logger = require('../../logger');
var sqldb = require('../../sqldb');
var sqlLoader = require('../../sql-loader');

var sql = sqlLoader.load(path.join(__dirname, 'userTest.sql'));

function makeTestInstance_OLD_UNUSED_SAVE_FIXME(req, res, next) {
    assessment.makeQuestionInstances(req.locals.test, req.locals.course, function(err, questionInstances) {
        if (err) return next(err);

        sqldb.getClient(function(err, client, done) {
            if (err) return next(err);

            sqldb.queryWithClient(client, done, 'START TRANSACTION', [], function(err, result) {
                if (err) return next(err);

                var params = {
                    test_id: req.locals.test.id,
                    user_id: req.locals.user.id,
                };
                sqldb.queryWithClient(client, done, sql.new_test_instance, params, function(err, result) {
                    if (err) return next(err);
                    if (result.rowCount !== 1) {
                        done();
                        return next(new Error("new_test_instance did not return exactly 1 row"));
                    }
                    req.locals.testInstance = result.rows[0];

                    async.eachSeries(questionInstances, function(questionInstance, callback) {
                        var params = {
                            test_instance_id: req.locals.testInstance.id,
                            user_id: req.locals.user.id,
                            test_question_id: questionInstance.test_question_id,
                            number: questionInstance.number,
                            variant_seed: questionInstance.variant_seed,
                            params: questionInstance.params,
                            true_answer: questionInstance.true_answer,
                            options: questionInstance.options,
                        };
                        sqldb.queryWithClient(client, done, sql.new_question_instance, params, callback);
                    }, function(err) {
                        if (err) return next(err);
                        
                        sqldb.queryWithClient(client, done, 'COMMIT', [], function(err, result) {
                            if (err) return next(err);
                            sqldb.releaseClient(client, done);
                            res.redirect(req.locals.urlPrefix + '/testInstance/' + result.rows[0].test_instance_id);
                        });
                    });
                });
            });
        });
    });
}

function makeTestInstance(req, res, next) {
    var params = {
        test_id: req.locals.test.id,
        user_id: req.locals.user.id,
    };
    sqldb.query(sql.new_test_instance, params, function(err, result) {
        if (err) return next(err);
        if (result.rowCount !== 1) {
            done();
            return next(new Error("new_test_instance did not return exactly 1 row"));
        }
        req.locals.testInstance = result.rows[0];
        assessment.newTestInstance(req.locals.testInstance, req.locals.test, req.locals.course, function(err) {
            if (err) return next(err);
            res.redirect(req.locals.urlPrefix + '/testInstance/' + req.locals.testInstance.id);
        });
    });
};

router.get('/', function(req, res, next) {
    if (req.locals.test.multiple_instance) {
        makeTestInstance(req, res, next);
    } else {
        var params = {test_id: req.locals.test.id, user_id: req.locals.user.id};
        sqldb.query(sql.find_single_test_instance, params, function(err, result) {
            if (err) return next(err);
            if (result.rowCount == 0) {
                makeTestInstance(req, res, next);
            } else {
                res.redirect(req.locals.urlPrefix + '/testInstance/' + result.rows[0].test_instance_id);
            }
        });
    }
});

module.exports = router;
