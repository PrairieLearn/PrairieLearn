const ERR = require('async-stacktrace');
const _ = require('lodash');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');

const csvMaker = require('../../lib/csv-maker');
const { paginateQuery } = require('../../lib/paginate');
const sanitizeName = require('../../lib/sanitize-name');
const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const setFilenames = function(locals) {
    const prefix = sanitizeName.assessmentFilenamePrefix(locals.assessment, locals.assessment_set, locals.course_instance, locals.course);
    locals.scoresCsvFilename = prefix + 'scores.csv';
    locals.scoresAllCsvFilename = prefix + 'scores_all.csv';
    locals.pointsCsvFilename = prefix + 'points.csv';
    locals.pointsAllCsvFilename = prefix + 'points_all.csv';
    if (!locals.assessment.group_work){
        locals.scoresByUsernameCsvFilename = prefix + 'scores_by_username.csv';
        locals.scoresByUsernameAllCsvFilename = prefix + 'scores_by_username_all.csv';
        locals.pointsByUsernameCsvFilename = prefix + 'points_by_username.csv';
        locals.pointsByUsernameAllCsvFilename = prefix + 'points_by_username_all.csv';
        locals.instancesCsvFilename = prefix + 'instances.csv';
        locals.instancesAllCsvFilename = prefix + 'instances_all.csv';
        locals.instanceQuestionsCsvFilename = prefix + 'instance_questions.csv';
        locals.submissionsForManualGradingCsvFilename = prefix + 'submissions_for_manual_grading.csv';
        locals.finalSubmissionsCsvFilename = prefix + 'final_submissions.csv';
        locals.bestSubmissionsCsvFilename = prefix + 'best_submissions.csv';
        locals.allSubmissionsCsvFilename = prefix + 'all_submissions.csv';
        locals.filesForManualGradingZipFilename = prefix + 'files_for_manual_grading.zip';
        locals.finalFilesZipFilename = prefix + 'final_files.zip';
        locals.bestFilesZipFilename = prefix + 'best_files.zip';
        locals.allFilesZipFilename = prefix + 'all_files.zip';
    } else {
        locals.groupsCsvFilename = prefix + 'groups.csv';
        locals.scoresByGroupnameCsvFilename = prefix + 'scores_by_groupname.csv';
        locals.scoresByGroupnameAllCsvFilename = prefix + 'scores_by_groupname_all.csv';
        locals.pointsByGroupnameCsvFilename = prefix + 'points_by_groupname.csv';
        locals.pointsByGroupnameAllCsvFilename = prefix + 'points_by_groupname_all.csv';
        locals.instancesGroupCsvFilename = prefix + 'instances.csv';
        locals.instancesGroupAllCsvFilename = prefix + 'instances_all.csv';
        locals.instanceQuestionsGroupCsvFilename = prefix + 'instance_questions.csv';
        locals.submissionsForManualGradingGroupCsvFilename = prefix + 'submissions_for_manual_grading.csv';
        locals.finalSubmissionsGroupCsvFilename = prefix + 'final_submissions.csv';
        locals.bestSubmissionsGroupCsvFilename = prefix + 'best_submissions.csv';
        locals.allSubmissionsGroupCsvFilename = prefix + 'all_submissions.csv';
        locals.filesForManualGradingGroupZipFilename = prefix + 'files_for_manual_grading.zip';
        locals.finalFilesGroupZipFilename = prefix + 'final_files.zip';
        locals.bestFilesGroupZipFilename = prefix + 'best_files.zip';
        locals.allFilesGroupZipFilename = prefix + 'all_files.zip';
    }
};

router.get('/', function(req, res, _next) {
    debug('GET /');
    setFilenames(res.locals);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

var sendInstancesCsv = function(res, req, columns, options, callback) {
    var params = {assessment_id: res.locals.assessment.id};
    sqldb.query(sql.select_assessment_instances, params, function(err, result) {
        if (ERR(err, callback)) return;

        var rows = result.rows;
        if (options.only_highest) {
            rows = _.filter(rows, 'highest_score');
        }
        if (options.unique_group) {
            rows = _.filter(rows, 'unique_group');
        }
        csvMaker.rowsToCsv(rows, columns, function(err, csv) {
            if (ERR(err, callback)) return;
            res.attachment(req.params.filename);
            res.send(csv);
        });
    });
};

router.get('/:filename', function(req, res, next) {
    setFilenames(res.locals);

    var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
    var scoresColumns = [
        ['UID', 'uid'],
        ['UIN', 'uin'],
        [assessmentName, 'score_perc'],
    ];
    var pointsColumns = [
        ['UID', 'uid'],
        ['UIN', 'uin'],
        [assessmentName, 'points'],
    ];
    var scoresByUsernameColumns = [
        ['Username', 'username'],
        [assessmentName, 'score_perc'],
    ];
    var pointsByUsernameColumns = [
        ['Username', 'username'],
        [assessmentName, 'points'],
    ];
    var instancesColumns = [
        ['UID', 'uid'],
        ['UIN', 'uin'],
        ['Username', 'username'],
        ['Name', 'name'],
        ['Role', 'role'],
        ['Assessment', 'assessment_label'],
        ['Instance', 'number'],
        ['Started', 'date_formatted'],
        ['Remaining', 'time_remaining'],
        ['Score (%)', 'score_perc'],
        ['Points', 'points'],
        ['Max points', 'max_points'],
        ['Duration (min)', 'duration_mins'],
        ['Hightest score', 'highest_score'],
    ];
    var scoresByGroupnameColumns = [
        ['Groupname', 'groupname'],
        ['Usernames', 'uid_list'],
        [assessmentName, 'score_perc'],
    ];
    var pointsByGroupnameColumns = [
        ['Groupname', 'groupname'],
        ['Usernames', 'uid_list'],
        [assessmentName, 'points'],
    ];
    var instancesGroupColumns = [
        ['Groupname', 'groupname'],
        ['Usernames', 'uid_list'],
        ['Assessment', 'assessment_label'],
        ['Instance', 'number'],
        ['Started', 'date_formatted'],
        ['Remaining', 'time_remaining'],
        ['Score (%)', 'score_perc'],
        ['Points', 'points'],
        ['Max points', 'max_points'],
        ['Duration (min)', 'duration_mins'],
        ['Hightest score', 'highest_score'],
    ];
    if (req.params.filename == res.locals.scoresCsvFilename) {
        sendInstancesCsv(res, req, scoresColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresAllCsvFilename) {
        sendInstancesCsv(res, req, scoresColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresByUsernameCsvFilename) {
        sendInstancesCsv(res, req, scoresByUsernameColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresByUsernameAllCsvFilename) {
        sendInstancesCsv(res, req, scoresByUsernameColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsCsvFilename) {
        sendInstancesCsv(res, req, pointsColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsAllCsvFilename) {
        sendInstancesCsv(res, req, pointsColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByUsernameCsvFilename) {
        sendInstancesCsv(res, req, pointsByUsernameColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByUsernameAllCsvFilename) {
        sendInstancesCsv(res, req, pointsByUsernameColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesCsvFilename) {
        sendInstancesCsv(res, req, instancesColumns, {only_highest: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesAllCsvFilename) {
        sendInstancesCsv(res, req, instancesColumns, {only_highest: false}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instanceQuestionsCsvFilename) {
        let params = {
            assessment_id: res.locals.assessment.id,
        };
        sqldb.query(sql.select_instance_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['UID', 'uid'],
                ['UIN', 'uin'],
                ['Name', 'name'],
                ['Role', 'role'],
                ['Assessment', 'assessment_label'],
                ['Assessment instance', 'assessment_instance_number'],
                ['Question', 'qid'],
                ['Question instance', 'instance_question_number'],
                ['Question points', 'points'],
                ['Max points', 'max_points'],
                ['Question % score', 'score_perc'],
                ['Date', 'date_formatted'],
                ['Highest submission score', 'highest_submission_score'],
                ['Last submission score', 'last_submission_score'],
                ['Number attempts', 'number_attempts'],
                ['Duration seconds', 'duration_seconds'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.submissionsForManualGradingCsvFilename) {
        let params = {
            assessment_id: res.locals.assessment.id,
        };
        sqldb.query(sql.submissions_for_manual_grading, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['uid', 'uid'],
                ['UIN', 'uin'],
                ['qid', 'qid'],
                ['old_score_perc', 'old_score_perc'],
                ['submission_id', 'submission_id'],
                ['params', 'params'],
                ['true_answer', 'true_answer'],
                ['submitted_answer', 'submitted_answer'],
                ['partial_scores', 'partial_scores'],
                ['score_perc', null],
                ['feedback', null],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.allSubmissionsCsvFilename
               || req.params.filename == res.locals.finalSubmissionsCsvFilename
               || req.params.filename == res.locals.bestSubmissionsCsvFilename) {
        let include_all = (req.params.filename == res.locals.allSubmissionsCsvFilename);
        let include_final = (req.params.filename == res.locals.finalSubmissionsCsvFilename);
        let include_best = (req.params.filename == res.locals.bestSubmissionsCsvFilename);
        let params = {
            assessment_id: res.locals.assessment.id,
            include_all,
            include_final,
            include_best,
        };
        sqldb.query(sql.assessment_instance_submissions, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['UID', 'uid'],
                ['UIN', 'uin'],
                ['Name', 'name'],
                ['Role', 'role'],
                ['Assessment', 'assessment_label'],
                ['Assessment instance', 'assessment_instance_number'],
                ['Question', 'qid'],
                ['Question instance', 'instance_question_number'],
                ['Variant', 'variant_number'],
                ['Seed', 'variant_seed'],
                ['Params', 'params'],
                ['True answer', 'true_answer'],
                ['Options', 'options'],
                ['submission_id', 'submission_id'],
                ['Submission date', 'submission_date_formatted'],
                ['Submitted answer', 'submitted_answer'],
                ['Partial Scores', 'partial_scores'],
                ['Override score', 'override_score'],
                ['Credit', 'credit'],
                ['Mode', 'mode'],
                ['Grading requested date', 'grading_requested_at_formatted'],
                ['Grading date', 'graded_at_formatted'],
                ['Score', 'score'],
                ['Correct', 'correct'],
                ['Feedback', 'feedback'],
                ['Question points', 'points'],
                ['Max points', 'max_points'],
                ['Question % score', 'score_perc'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.filesForManualGradingZipFilename) {
        const params = {
            assessment_id: res.locals.assessment.id,
            limit: 100,
        };

        const archive = archiver('zip');
        const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(' ', '');
        const prefix = `${dirname}/`;
        archive.append(null, { name: prefix });
        res.attachment(req.params.filename);
        archive.pipe(res);
        paginateQuery(sql.files_for_manual_grading, params, (row, callback) => {
            const contents = (row.contents != null) ? row.contents : '';
            archive.append(contents, { name: prefix + row.filename });
            callback(null);
        }, (err) => {
            if (ERR(err, next)) return;
            archive.finalize();
        });
    } else if (req.params.filename == res.locals.allFilesZipFilename
               || req.params.filename == res.locals.finalFilesZipFilename
               || req.params.filename == res.locals.bestFilesZipFilename) {
        const include_all = (req.params.filename == res.locals.allFilesZipFilename);
        const include_final = (req.params.filename == res.locals.finalFilesZipFilename);
        const include_best = (req.params.filename == res.locals.bestFilesZipFilename);
        const params = {
            assessment_id: res.locals.assessment.id,
            limit: 100,
            include_all,
            include_final,
            include_best,
        };

        const archive = archiver('zip');
        const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(' ', '');
        const prefix = `${dirname}/`;
        archive.append(null, { name: prefix });
        res.attachment(req.params.filename);
        archive.pipe(res);
        paginateQuery(sql.assessment_instance_files, params, (row, callback) => {
            const contents = (row.contents != null) ? row.contents : '';
            archive.append(contents, { name: prefix + row.filename });
            callback(null);
        }, (err) => {
            if (ERR(err, next)) return;
            archive.finalize();
        });
    } else if (req.params.filename == res.locals.groupsCsvFilename) {
        const params = {
            assessment_id: res.locals.assessment.id,
        };
        sqldb.query(sql.group_configs, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['groupName', 'name'],
                ['UID', 'uid'],
            ];
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else if (req.params.filename == res.locals.scoresByGroupnameCsvFilename) {
        sendInstancesCsv(res, req, scoresByGroupnameColumns, {only_highest: true, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.scoresByGroupnameAllCsvFilename) {
        sendInstancesCsv(res, req, scoresByGroupnameColumns, {only_highest: false, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByGroupnameCsvFilename) {
        sendInstancesCsv(res, req, pointsByGroupnameColumns, {only_highest: true, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.pointsByGroupnameAllCsvFilename) {
        sendInstancesCsv(res, req, pointsByGroupnameColumns, {only_highest: false, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesGroupCsvFilename) {
        sendInstancesCsv(res, req, instancesGroupColumns, {only_highest: true, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instancesGroupAllCsvFilename) {
        sendInstancesCsv(res, req, instancesGroupColumns, {only_highest: false, unique_group: true}, (err) => {
            if (ERR(err, next)) return;
        });
    } else if (req.params.filename == res.locals.instanceQuestionsGroupCsvFilename) {
        let params = {
            assessment_id: res.locals.assessment.id,
        };
        sqldb.query(sql.select_instance_questions, params, function(err, result) {
            if (ERR(err, next)) return;
            var columns = [
                ['Groupname', 'groupname'],
                ['Usernames', 'uid_list'],
                ['Assessment', 'assessment_label'],
                ['Assessment instance', 'assessment_instance_number'],
                ['Question', 'qid'],
                ['Question instance', 'instance_question_number'],
                ['Question points', 'points'],
                ['Max points', 'max_points'],
                ['Question % score', 'score_perc'],
                ['Date', 'date_formatted'],
                ['Highest submission score', 'highest_submission_score'],
                ['Last submission score', 'last_submission_score'],
                ['Number attempts', 'number_attempts'],
                ['Duration seconds', 'duration_seconds'],
            ];
            rows = _.filter(rows, 'unique_group');
            csvMaker.rowsToCsv(result.rows, columns, function(err, csv) {
                if (ERR(err, next)) return;
                res.attachment(req.params.filename);
                res.send(csv);
            });
        });
    } else {
        next(new Error('Unknown filename: ' + req.params.filename));
    }
});

module.exports = router;
