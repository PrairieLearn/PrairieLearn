const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');

const csvMaker = require('../../lib/csv-maker');
const { paginateQuery } = require('../../lib/paginate');
const sanitizeName = require('../../lib/sanitize-name');
const error = require('../../prairielib/error');
const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

const setFilenames = function (locals) {
  const prefix = sanitizeName.assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course
  );
  locals.scoresCsvFilename = prefix + 'scores.csv';
  locals.scoresAllCsvFilename = prefix + 'scores_all.csv';
  locals.pointsCsvFilename = prefix + 'points.csv';
  locals.pointsAllCsvFilename = prefix + 'points_all.csv';
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
  if (locals.assessment.group_work) {
    locals.groupsCsvFilename = prefix + 'groups.csv';
    locals.scoresGroupCsvFilename = prefix + 'scores_by_group.csv';
    locals.scoresGroupAllCsvFilename = prefix + 'scores_by_group_all.csv';
    locals.pointsGroupCsvFilename = prefix + 'points_by_group.csv';
    locals.pointsGroupAllCsvFilename = prefix + 'points_by_group_all.csv';
  }
};

router.get('/', function (req, res, next) {
  debug('GET /');
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  setFilenames(res.locals);
  res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

var sendInstancesCsv = function (res, req, columns, options, callback) {
  var params = {
    assessment_id: res.locals.assessment.id,
    highest_score: options.only_highest,
    group_work: options.group_work,
  };
  sqldb.query(sql.select_assessment_instances, params, function (err, result) {
    if (ERR(err, callback)) return;

    var rows = result.rows;
    csvMaker.rowsToCsv(rows, columns, function (err, csv) {
      if (ERR(err, callback)) return;
      res.attachment(req.params.filename);
      res.send(csv);
    });
  });
};

router.get('/:filename', function (req, res, next) {
  if (!res.locals.authz_data.has_course_instance_permission_view) {
    return next(error.make(403, 'Access denied (must be a student data viewer)'));
  }
  //
  // NOTE: you could argue that some downloads should be restricted further to users with
  // permission to view code (Course role: Viewer). For example, '*_all_submissions.csv'
  // contains seed, params, true_answer, and so forth. We will ignore this for now.
  //

  setFilenames(res.locals);

  var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
  const studentColumn = [
    ['UID', 'uid'],
    ['UIN', 'uin'],
  ];
  const usernameColumn = [['Username', 'username']];
  const groupNameColumn = [
    ['Group name', 'group_name'],
    ['Usernames', 'uid_list'],
  ];
  const scoreColumn = [[assessmentName, 'score_perc']];
  const pointColumn = [[assessmentName, 'points']];
  const instanceColumn = [
    ['Assessment', 'assessment_label'],
    ['Instance', 'number'],
    ['Started', 'date_formatted'],
    ['Remaining', 'time_remaining'],
    ['Score (%)', 'score_perc'],
    ['Points', 'points'],
    ['Max points', 'max_points'],
    ['Duration (min)', 'duration_mins'],
    ['Highest score', 'highest_score'],
  ];
  let scoresColumns = studentColumn.concat(scoreColumn);
  let pointsColumns = studentColumn.concat(pointColumn);
  let scoresGroupColumns = groupNameColumn.concat(scoreColumn);
  let pointsGroupColumns = groupNameColumn.concat(pointColumn);
  let scoresByUsernameColumns = usernameColumn.concat(scoreColumn);
  let pointsByUsernameColumns = usernameColumn.concat(pointColumn);
  let identityColumn = studentColumn.concat(
    usernameColumn.concat([
      ['Name', 'name'],
      ['Role', 'role'],
    ])
  );
  if (res.locals.assessment.group_work) {
    identityColumn = groupNameColumn;
  }
  let instancesColumns = identityColumn.concat(instanceColumn);

  if (req.params.filename === res.locals.scoresCsvFilename) {
    sendInstancesCsv(res, req, scoresColumns, { only_highest: true }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.scoresAllCsvFilename) {
    sendInstancesCsv(res, req, scoresColumns, { only_highest: false }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.scoresByUsernameCsvFilename) {
    sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: true }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.scoresByUsernameAllCsvFilename) {
    sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: false }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.pointsCsvFilename) {
    sendInstancesCsv(res, req, pointsColumns, { only_highest: true }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.pointsAllCsvFilename) {
    sendInstancesCsv(res, req, pointsColumns, { only_highest: false }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.pointsByUsernameCsvFilename) {
    sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: true }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.pointsByUsernameAllCsvFilename) {
    sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: false }, (err) => {
      if (ERR(err, next)) return;
    });
  } else if (req.params.filename === res.locals.instancesCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      instancesColumns,
      { only_highest: true, group_work: res.locals.assessment.group_work },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else if (req.params.filename === res.locals.instancesAllCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      instancesColumns,
      { only_highest: false, group_work: res.locals.assessment.group_work },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else if (req.params.filename === res.locals.instanceQuestionsCsvFilename) {
    let params = {
      assessment_id: res.locals.assessment.id,
      group_work: res.locals.assessment.group_work,
    };
    sqldb.query(sql.select_instance_questions, params, function (err, result) {
      if (ERR(err, next)) return;
      var columns = identityColumn.concat([
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
      ]);
      csvMaker.rowsToCsv(result.rows, columns, function (err, csv) {
        if (ERR(err, next)) return;
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else if (req.params.filename === res.locals.submissionsForManualGradingCsvFilename) {
    let params = {
      assessment_id: res.locals.assessment.id,
      group_work: res.locals.assessment.group_work,
    };
    sqldb.query(sql.submissions_for_manual_grading, params, function (err, result) {
      if (ERR(err, next)) return;
      // Replace user-friendly column names with upload-friendly names
      identityColumn = identityColumn.map((pair) => [pair[1], pair[1]]);
      const columns = identityColumn.concat([
        ['qid', 'qid'],
        ['old_score_perc', 'old_score_perc'],
        ['old_feedback', 'old_feedback'],
        ['submission_id', 'submission_id'],
        ['params', 'params'],
        ['true_answer', 'true_answer'],
        ['submitted_answer', 'submitted_answer'],
        ['old_partial_scores', 'partial_scores'],
        ['partial_scores', null],
        ['score_perc', null],
        ['feedback', null],
      ]);
      csvMaker.rowsToCsv(result.rows, columns, function (err, csv) {
        if (ERR(err, next)) return;
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else if (
    req.params.filename === res.locals.allSubmissionsCsvFilename ||
    req.params.filename === res.locals.finalSubmissionsCsvFilename ||
    req.params.filename === res.locals.bestSubmissionsCsvFilename
  ) {
    let include_all = req.params.filename === res.locals.allSubmissionsCsvFilename;
    let include_final = req.params.filename === res.locals.finalSubmissionsCsvFilename;
    let include_best = req.params.filename === res.locals.bestSubmissionsCsvFilename;
    let params = {
      assessment_id: res.locals.assessment.id,
      include_all,
      include_final,
      include_best,
      group_work: res.locals.assessment.group_work,
    };
    let submissionColumn = identityColumn;
    if (res.locals.assessment.group_work) {
      submissionColumn = identityColumn.concat([['SubmitStudent', 'submission_user']]);
    }
    sqldb.query(sql.assessment_instance_submissions, params, function (err, result) {
      if (ERR(err, next)) return;
      var columns = submissionColumn.concat([
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
      ]);
      csvMaker.rowsToCsv(result.rows, columns, function (err, csv) {
        if (ERR(err, next)) return;
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else if (req.params.filename === res.locals.filesForManualGradingZipFilename) {
    const params = {
      assessment_id: res.locals.assessment.id,
      group_work: res.locals.assessment.group_work,
      limit: 100,
    };

    const archive = archiver('zip');
    const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(
      ' ',
      ''
    );
    const prefix = `${dirname}/`;
    archive.append(null, { name: prefix });
    res.attachment(req.params.filename);
    archive.pipe(res);
    paginateQuery(
      sql.files_for_manual_grading,
      params,
      (row, callback) => {
        const contents = row.contents != null ? row.contents : '';
        archive.append(contents, { name: prefix + row.filename });
        callback(null);
      },
      (err) => {
        if (ERR(err, next)) return;
        archive.finalize();
      }
    );
  } else if (
    req.params.filename === res.locals.allFilesZipFilename ||
    req.params.filename === res.locals.finalFilesZipFilename ||
    req.params.filename === res.locals.bestFilesZipFilename
  ) {
    const include_all = req.params.filename === res.locals.allFilesZipFilename;
    const include_final = req.params.filename === res.locals.finalFilesZipFilename;
    const include_best = req.params.filename === res.locals.bestFilesZipFilename;
    const params = {
      assessment_id: res.locals.assessment.id,
      limit: 100,
      include_all,
      include_final,
      include_best,
      group_work: res.locals.assessment.group_work,
    };

    const archive = archiver('zip');
    const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(
      ' ',
      ''
    );
    const prefix = `${dirname}/`;
    archive.append(null, { name: prefix });
    res.attachment(req.params.filename);
    archive.pipe(res);
    paginateQuery(
      sql.assessment_instance_files,
      params,
      (row, callback) => {
        const contents = row.contents != null ? row.contents : '';
        archive.append(contents, { name: prefix + row.filename });
        callback(null);
      },
      (err) => {
        if (ERR(err, next)) return;
        archive.finalize();
      }
    );
  } else if (req.params.filename === res.locals.groupsCsvFilename) {
    const params = {
      assessment_id: res.locals.assessment.id,
    };
    sqldb.query(sql.group_configs, params, function (err, result) {
      if (ERR(err, next)) return;
      var columns = [
        ['groupName', 'name'],
        ['UID', 'uid'],
      ];
      csvMaker.rowsToCsv(result.rows, columns, function (err, csv) {
        if (ERR(err, next)) return;
        res.attachment(req.params.filename);
        res.send(csv);
      });
    });
  } else if (req.params.filename === res.locals.scoresGroupCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      scoresGroupColumns,
      { only_highest: true, group_work: true },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else if (req.params.filename === res.locals.scoresGroupAllCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      scoresGroupColumns,
      { only_highest: false, group_work: true },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else if (req.params.filename === res.locals.pointsGroupCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      pointsGroupColumns,
      { only_highest: true, group_work: true },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else if (req.params.filename === res.locals.pointsGroupAllCsvFilename) {
    sendInstancesCsv(
      res,
      req,
      pointsGroupColumns,
      { only_highest: false, group_work: true },
      (err) => {
        if (ERR(err, next)) return;
      }
    );
  } else {
    next(new Error('Unknown filename: ' + req.params.filename));
  }
});

module.exports = router;
