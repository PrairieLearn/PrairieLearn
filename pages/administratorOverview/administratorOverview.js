const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();

const error = require('@prairielearn/prairielib/error');
const { sqlDb, sqlLoader } = require('@prairielearn/prairielib');

const cache = require('../../lib/cache');
const github = require('../../lib/github');
const opsbot = require('../../lib/opsbot');

const sql = sqlLoader.loadSqlEquiv(__filename);

router.get('/', (req, res, next) => {
    sqlDb.queryOneRow(sql.select, [], (err, result) => {
        if (ERR(err, next)) return;

        _.assign(res.locals, result.rows[0]);
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
});

router.post('/', (req, res, next) => {
    if (!res.locals.is_administrator) return next(new Error('Insufficient permissions'));
    if (req.body.__action == 'administrators_insert_by_user_uid') {
        let params = [
            req.body.uid,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('administrators_insert_by_user_uid', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'administrators_delete_by_user_id') {
        let params = [
            req.body.user_id,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('administrators_delete_by_user_id', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_insert') {
        let params = [
            req.body.institution_id,
            req.body.short_name,
            req.body.title,
            req.body.display_timezone,
            req.body.path,
            req.body.repository,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('courses_insert', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_update_column') {
        let params = [
            req.body.course_id,
            req.body.column_name,
            req.body.value,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('courses_update_column', params, (err, _result) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'courses_delete') {
        let params = {
            course_id: req.body.course_id,
        };
        sqlDb.queryZeroOrOneRow(sql.select_course, params, (err, result) => {
            if (ERR(err, next)) return;
            if (result.rowCount != 1) return next(new Error('course not found'));

            var short_name = result.rows[0].short_name;
            if (req.body.confirm_short_name != short_name) {
                return next(new Error('deletion aborted: confirmation string "'
                                      + req.body.confirm_short_name
                                      + '" did not match expected value of "' + short_name + '"'));
            }

            var params = [
                req.body.course_id,
                res.locals.authn_user.user_id,
            ];
            sqlDb.call('courses_delete', params, (err, _result) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action === 'invalidate_question_cache') {
        cache.reset((err) => {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action === 'approve_deny_course_request') {
        const id = req.body.request_id;
        const user_id = res.locals.authn_user.user_id;
        let action = req.body.approve_deny_action;

        if (action === 'approve') {
            action = 'approved';
        } else if (action === 'deny') {
            action = 'denied';
        } else {
            return next(new Error(`Unknown course request action "${action}"`));
        }

        const params = {
            id,
            user_id,
            action,
        };
        sqlDb.queryOneRow(sql.update_course_request, params, (err, _result) => {
            if (ERR(err, next)) return;

            if (action === 'approved') {
                sqlDb.queryOneRow(sql.select_course_request, {id}, (err, result) => {
                    if (ERR(err, next)) return;

                    result = result.rows[0];
                    github.createAndAddCourseFromRequest(id, res.locals.authn_user, (err, repo) => {
                        if (ERR(err, next)) return;

                        opsbot.sendCourseRequestMessage(
                            `*Created Course*\n` +
                            `Course repo: ${repo}\n` +
                            `Course rubric: ${result.short_name}\n` +
                            `Approved by: ${res.locals.authn_user.name}`, (err) => {
                                    ERR(err, (e) => {logger.error(err);});
                                });
                        res.redirect(req.originalUrl);
                    });
                });
            } else {
                res.redirect(req.originalUrl);
            }
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
