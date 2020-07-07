const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));

const error = require('@prairielearn/prairielib/error');
const groupUpdate = require('../../lib/group-update');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);
function obtainInfo(req, res, next){
    const params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.config_info, params, function(err, result) {
        if (ERR(err, next)) return;
        res.locals.isGroup = true;
        if (result.rowCount == 0) {
            res.locals.isGroup = false;
            res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
            return;
        }
        res.locals.config_info = result.rows[0];
        res.locals.config_info.defaultMin = res.locals.config_info.minimum || 2;
        res.locals.config_info.defaultMax = res.locals.config_info.maximum || 5;

        res.locals.config_info.permission = '';
        if (res.locals.config_info.student_auth_join) {
            res.locals.config_info.permission += 'join ';
        }
        if (res.locals.config_info.student_auth_create) {
            res.locals.config_info.permission += 'create ';
        }
        if (res.locals.config_info.student_auth_quit) {
            res.locals.config_info.permission += 'quit ';
        }
        const params = {
            assessment_id: res.locals.assessment.id,
            course_instance_id: res.locals.config_info.course_instance_id,
        };
        sqldb.query(sql.assessment_list, params, function(err, result) {
            if (ERR(err, next)) return;
            res.locals.assessment_list_rows = result.rows;
            sqldb.query(sql.select_groups, params, function(err, result) {
                if (ERR(err, next)) return;
                res.locals.groups_rows = result.rows;
                sqldb.query(sql.not_assigned_users, params, function(err, result) {
                    if (ERR(err, next)) return;
                    res.locals.not_assigned_users_rows = result.rows;
                    debug('render page');
                    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                });
            });
        });
    });
}
router.get('/', function(req, res, next) {
    debug('GET /');
    obtainInfo(req, res, next);
});

router.post('/', function(req, res, next) {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'upload_assessment_groups') {
        groupUpdate.uploadInstanceGroups(res.locals.assessment.id, req.file, res.locals.user.user_id, res.locals.authn_user.user_id, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'auto_assessment_groups') {
        groupUpdate.autoGroups(res.locals.assessment.id, res.locals.user.user_id, res.locals.authn_user.user_id, req.body.max_group_size, req.body.min_group_size, req.body.optradio, function(err, job_sequence_id) {
            if (ERR(err, next)) return;
            res.redirect(res.locals.urlPrefix + '/jobSequence/' + job_sequence_id);
        });
    } else if (req.body.__action == 'copy_assessment_groups') {
        const params = [
            res.locals.assessment.id,
            req.body.inputGroupSelect01,
        ];
        sqldb.call('assessment_groups_copy', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'delete_all') {
        const params = [
            res.locals.assessment.id,
            res.locals.authn_user.user_id,
        ];
        sqldb.call('assessment_groups_delete_all', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'addGroup') {
        const assessment_id = res.locals.assessment.id;
        const groupname = req.body.groupname;
        const uids = req.body.uids;
        const uidlist = uids.split(/[ ,]+/);
        var failedUids = '';
        res.locals.errormsg = '';
        (async () => {
            for (const uid of uidlist) {
                let params = [
                    assessment_id,
                    groupname,
                    uid,
                ];
                try {
                    await sqldb.callAsync('assessment_groups_update', params);
                } catch (err) {
                    failedUids += '[' + uid + '] ';
                }
            }
            if (failedUids.length > 0) {
                res.locals.errormsg += 'Failed to add ' + failedUids + 'to [' + groupname + ']. Please check if the uid exist.\n';
            }
            obtainInfo(req, res, next);
        })();
    } else if (req.body.__action == 'configGroup') {
        res.locals.errormsg = '';
        const params = {
            assessment_id: res.locals.assessment.id,
            minsize: req.body.minsize,
            maxsize: req.body.maxsize,
            joincheck: req.body.joincheck || false,
            createcheck: req.body.createcheck || false,
            quitcheck: req.body.quitcheck || false,
        };
        if (req.body.maxsize.length < 1 || req.body.minsize.length < 1) {
            res.locals.errormsg += 'Please enter group max size and min size';
            obtainInfo(req, res, next);
            return;
        }
        sqldb.query(sql.config_group, params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else if (req.body.__action == 'addmember') {
        const assessment_id = res.locals.assessment.id;
        const gid = req.body.gid;
        const uids = req.body.addmemberuids;
        const uidlist = uids.split(/[ ,]+/);
        failedUids = '';
        res.locals.errormsg = '';
        (async () => {
            for (const uid of uidlist) {
                const params = [
                    assessment_id,
                    gid,
                    uid,
                ];
                try {
                    await sqldb.callAsync('assessment_groups_add_member', params);
                } catch (err) {
                    failedUids += '[' + uid + '] ';
                }
            }
            if (failedUids.length > 0) {
                res.locals.errormsg += 'Failed to add ' + failedUids + 'to Group No.' + gid + '. Please check if the uid exist.\n';
            }
            obtainInfo(req, res, next);
        })();
    } else if (req.body.__action == 'deletemember') {
        const assessment_id = res.locals.assessment.id;
        const gid = req.body.gid;
        const uids = req.body.deletememberuids;
        const uidlist = uids.split(/[ ,]+/);
        failedUids = '';
        res.locals.errormsg = '';
        (async () => {
            for (const uid of uidlist) {
                const params = [
                    assessment_id,
                    gid,
                    uid,
                ];
                try {
                    await sqldb.callAsync('assessment_groups_delete_member', params);
                } catch (err) {
                    failedUids += '[' + uid + '] ';
                }
            }
            if (failedUids.length > 0) {
                res.locals.errormsg += 'Failed to delete ' + failedUids + 'from Group No.' + gid + ']. Please check if the uid exist.\n';
            }
            obtainInfo(req, res, next);
        })();
    } else if (req.body.__action == 'deletegroup') {
        const params = [
            res.locals.assessment.id,
            req.body.gid,
        ];
        sqldb.call('assessment_groups_delete_group', params, function(err, _result) {
            if (ERR(err, next)) return;
            res.redirect(req.originalUrl);
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});
module.exports = router;
