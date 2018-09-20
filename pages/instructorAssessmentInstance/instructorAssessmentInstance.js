const ERR = require('async-stacktrace');
const _ = require('lodash');
const csvStringify = require('csv').stringify;
const express = require('express');
const router = express.Router();
const { error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sql = sqlLoader.loadSqlEquiv(__filename);
const ltiOutcomes = require('../../lib/ltiOutcomes');

const logCsvFilename = (locals) => {
    return locals.course.short_name.replace(/\s+/g, '')
        + '_'
        + locals.course_instance.short_name
        + '_'
        + locals.assessment_set.abbreviation
        + locals.assessment.number
        + '_'
        + locals.instance_user.uid.replace(/[^a-z0-9]/g, '_')
        + '_'
        + locals.assessment_instance.number
        + '_'
        + 'log.csv';
};

router.get('/', (req, res, next) => {
    res.locals.logCsvFilename = logCsvFilename(res.locals);
    const params = {assessment_instance_id: res.locals.assessment_instance.id};
    sqlDb.query(sql.assessment_instance_stats, params, (err, result) => {
        if (ERR(err, next)) return;
        res.locals.assessment_instance_stats = result.rows;

        sqlDb.queryOneRow(sql.select_formatted_duration, params, (err, result) => {
            if (ERR(err, next)) return;
            res.locals.assessment_instance_duration = result.rows[0].assessment_instance_duration;

            const params = {assessment_instance_id: res.locals.assessment_instance.id};
            sqlDb.query(sql.select_instance_questions, params, (err, result) => {
                if (ERR(err, next)) return;
                res.locals.instance_questions = result.rows;

                const params = {assessment_instance_id: res.locals.assessment_instance.id};
                sqlDb.query(sql.select_log, params, (err, result) => {
                    if (ERR(err, next)) return;
                    res.locals.log = result.rows;

                    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
                });
            });
        });
    });
});

router.get('/:filename', (req, res, next) => {
    if (req.params.filename == logCsvFilename(res.locals)) {
        const params = {assessment_instance_id: res.locals.assessment_instance.id};
        sqlDb.query(sql.select_log, params, (err, result) => {
            if (ERR(err, next)) return;
            const log = result.rows;
            const csvHeaders = ['Time', 'Auth user', 'Event', 'Instructor question', 'Student question', 'Data'];
            const csvData = _.map(log, (row) => {
                return [
                    row.date_iso8601,
                    row.auth_user_uid,
                    row.event_name,
                    ((row.instructor_question_number == null) ? null : 'I-' + row.instructor_question_number + ' (' + row.qid + ')'),
                    ((row.student_question_number == null) ? null : 'S-' + row.student_question_number +
                     ((row.variant_number == null) ? '' : '#' + row.variant_number)),
                    ((row.data == null) ? null : JSON.stringify(row.data)),
                ];
            });
            csvData.splice(0, 0, csvHeaders);
            csvStringify(csvData, (err, csv) => {
                if (err) throw Error('Error formatting CSV', err);
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

router.post('/', (req, res, next) => {
    if (!res.locals.authz_data.has_instructor_edit) return next();
    if (req.body.__action == 'edit_total_points') {
        const params = [
            res.locals.assessment_instance.id,
            req.body.points,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('assessment_instances_update_points', params, (err, _result) => {
            if (ERR(err, next)) return;
            ltiOutcomes.updateScore(res.locals.assessment_instance.id, null, (err) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'edit_total_score_perc') {
        const params = [
            req.body.assessment_instance_id,
            req.body.score_perc,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('assessment_instances_update_score_perc', params, (err, _result) => {
            if (ERR(err, next)) return;
            ltiOutcomes.updateScore(res.locals.assessment_instance.id, null, (err) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'edit_question_points') {
        const params = [
            req.body.instance_question_id,
            req.body.points,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('instance_questions_update_points', params, (err, _result) => {
            if (ERR(err, next)) return;
            ltiOutcomes.updateScore(res.locals.assessment_instance.id, null, (err) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'edit_question_score_perc') {
        const params = [
            req.body.instance_question_id,
            req.body.score_perc,
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('instance_questions_update_score_perc', params, (err, _result) => {
            if (ERR(err, next)) return;
            ltiOutcomes.updateScore(res.locals.assessment_instance.id, null, (err) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else {
        return next(error.make(400, 'unknown __action', {locals: res.locals, body: req.body}));
    }
});

module.exports = router;
