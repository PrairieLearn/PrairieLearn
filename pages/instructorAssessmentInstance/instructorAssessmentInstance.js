const ERR = require('async-stacktrace');
const _ = require('lodash');
const csvStringify = require('../../lib/nonblocking-csv-stringify');
const express = require('express');
const router = express.Router();
const { error, sqlDb, sqlLoader} = require('@prairielearn/prairielib');

const sanitizeName = require('../../lib/sanitize-name');
const ltiOutcomes = require('../../lib/ltiOutcomes');

const sql = sqlLoader.loadSqlEquiv(__filename);

const logCsvFilename = (locals) => {
    return sanitizeName.assessmentFilenamePrefix(locals.assessment, locals.assessment_set, locals.course_instance, locals.course)
        + sanitizeName.sanitizeString(locals.instance_user.uid)
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
            res.locals.assessment_instance.id,
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
            null, // assessment_id
            res.locals.assessment_instance.id,
            null, // submission_id
            req.body.instance_question_id,
            null, // uid
            null, // assessment_instance_number
            null, // qid
            null, // score_perc
            req.body.points,
            null, // feedback
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('instance_questions_update_score', params, (err, _result) => {
            if (ERR(err, next)) return;
            ltiOutcomes.updateScore(res.locals.assessment_instance.id, null, (err) => {
                if (ERR(err, next)) return;
                res.redirect(req.originalUrl);
            });
        });
    } else if (req.body.__action == 'edit_question_score_perc') {
        const params = [
            null, // assessment_id
            res.locals.assessment_instance.id,
            null, // submission_id
            req.body.instance_question_id,
            null, // uid
            null, // assessment_instance_number
            null, // qid
            req.body.score_perc,
            null, // points
            null, // feedback
            res.locals.authn_user.user_id,
        ];
        sqlDb.call('instance_questions_update_score', params, (err, _result) => {
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
