// @ts-check
const asyncHandler = require('express-async-handler');
const express = require('express');
const router = express.Router();
const path = require('path');
const debug = require('debug')('prairielearn:' + path.basename(__filename, '.js'));
const archiver = require('archiver');
const { stringifyStream } = require('@prairielearn/csv');
const { pipeline } = require('node:stream/promises');

const sanitizeName = require('../../lib/sanitize-name');
const error = require('@prairielearn/error');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

/** @typedef {[string, string][]} Columns */

const setFilenames = function (locals) {
  const prefix = sanitizeName.assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course,
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

/**
 * Local abstraction to adapt our internal notion of columns to the columns
 * format that the CSV `stringify()` function expects.
 *
 * @param {[string, string][]} columns
 * @param {(record: any) => any} [transform]
 */
function stringifyWithColumns(columns, transform = undefined) {
  return stringifyStream({
    header: true,
    columns: columns.map(([header, key]) => ({ header, key: key ?? header })),
    transform,
  });
}

async function sendInstancesCsv(res, req, columns, options) {
  const result = await sqldb.queryCursor(sql.select_assessment_instances, {
    assessment_id: res.locals.assessment.id,
    highest_score: options.only_highest,
    group_work: options.group_work,
  });

  res.attachment(req.params.filename);
  await pipeline(result.stream(100), stringifyWithColumns(columns), res);
}

router.get(
  '/:filename',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    //
    // NOTE: you could argue that some downloads should be restricted further to users with
    // permission to view code (Course role: Viewer). For example, '*_all_submissions.csv'
    // contains seed, params, true_answer, and so forth. We will ignore this for now.
    //

    setFilenames(res.locals);

    var assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
    /** @type {Columns} */
    const studentColumn = [
      ['UID', 'uid'],
      ['UIN', 'uin'],
    ];
    /** @type {Columns} */
    const usernameColumn = [['Username', 'username']];
    /** @type {Columns} */
    const groupNameColumn = [
      ['Group name', 'group_name'],
      ['Usernames', 'uid_list'],
    ];
    /** @type {Columns} */
    const scoreColumn = [[assessmentName, 'score_perc']];
    /** @type {Columns} */
    const pointColumn = [[assessmentName, 'points']];
    /** @type {Columns} */
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
      ]),
    );
    if (res.locals.assessment.group_work) {
      identityColumn = groupNameColumn;
    }
    let instancesColumns = identityColumn.concat(instanceColumn);

    if (req.params.filename === res.locals.scoresCsvFilename) {
      await sendInstancesCsv(res, req, scoresColumns, { only_highest: true });
    } else if (req.params.filename === res.locals.scoresAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresColumns, { only_highest: false });
    } else if (req.params.filename === res.locals.scoresByUsernameCsvFilename) {
      await sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: true });
    } else if (req.params.filename === res.locals.scoresByUsernameAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: false });
    } else if (req.params.filename === res.locals.pointsCsvFilename) {
      await sendInstancesCsv(res, req, pointsColumns, { only_highest: true });
    } else if (req.params.filename === res.locals.pointsAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsColumns, { only_highest: false });
    } else if (req.params.filename === res.locals.pointsByUsernameCsvFilename) {
      await sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: true });
    } else if (req.params.filename === res.locals.pointsByUsernameAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: false });
    } else if (req.params.filename === res.locals.instancesCsvFilename) {
      await sendInstancesCsv(res, req, instancesColumns, {
        only_highest: true,
        group_work: res.locals.assessment.group_work,
      });
    } else if (req.params.filename === res.locals.instancesAllCsvFilename) {
      await sendInstancesCsv(res, req, instancesColumns, {
        only_highest: false,
        group_work: res.locals.assessment.group_work,
      });
    } else if (req.params.filename === res.locals.instanceQuestionsCsvFilename) {
      const cursor = await sqldb.queryCursor(sql.select_instance_questions, {
        assessment_id: res.locals.assessment.id,
        group_work: res.locals.assessment.group_work,
      });

      const columns = identityColumn.concat([
        ['Assessment', 'assessment_label'],
        ['Assessment instance', 'assessment_instance_number'],
        ['Question', 'qid'],
        ['Question instance', 'instance_question_number'],
        ['Question points', 'points'],
        ['Max points', 'max_points'],
        ['Question % score', 'score_perc'],
        ['Auto points', 'auto_points'],
        ['Max auto points', 'max_auto_points'],
        ['Manual points', 'manual_points'],
        ['Max manual points', 'max_manual_points'],
        ['Date', 'date_formatted'],
        ['Highest submission score', 'highest_submission_score'],
        ['Last submission score', 'last_submission_score'],
        ['Number attempts', 'number_attempts'],
        ['Duration seconds', 'duration_seconds'],
        ['Assigned manual grader', 'assigned_grader'],
        ['Last manual grader', 'last_grader'],
      ]);

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifyWithColumns(columns), res);
    } else if (req.params.filename === res.locals.submissionsForManualGradingCsvFilename) {
      const cursor = await sqldb.queryCursor(sql.submissions_for_manual_grading, {
        assessment_id: res.locals.assessment.id,
        group_work: res.locals.assessment.group_work,
      });

      // Replace user-friendly column names with upload-friendly names
      identityColumn = (res.locals.assessment.group_work ? groupNameColumn : studentColumn).map(
        (pair) => [pair[1], pair[1]],
      );
      const columns = identityColumn.concat([
        ['qid', 'qid'],
        ['old_score_perc', 'old_score_perc'],
        ['old_feedback', 'old_feedback'],
        ['old_auto_points', 'old_auto_points'],
        ['old_manual_points', 'old_manual_points'],
        ['submission_id', 'submission_id'],
        ['params', 'params'],
        ['true_answer', 'true_answer'],
        ['submitted_answer', 'submitted_answer'],
        ['old_partial_scores', 'old_partial_scores'],
        ['partial_scores', 'partial_scores'],
        ['score_perc', 'score_perc'],
        ['feedback', 'feedback'],
      ]);

      res.attachment(req.params.filename);
      const stringifier = stringifyWithColumns(columns, (record) => {
        return {
          ...record,
          // Add empty columns for the user to put data in.
          partial_scores: '',
          score_perc: '',
          feedback: '',
        };
      });
      await pipeline(cursor.stream(100), stringifier, res);
    } else if (
      req.params.filename === res.locals.allSubmissionsCsvFilename ||
      req.params.filename === res.locals.finalSubmissionsCsvFilename ||
      req.params.filename === res.locals.bestSubmissionsCsvFilename
    ) {
      let include_all = req.params.filename === res.locals.allSubmissionsCsvFilename;
      let include_final = req.params.filename === res.locals.finalSubmissionsCsvFilename;
      let include_best = req.params.filename === res.locals.bestSubmissionsCsvFilename;

      const cursor = await sqldb.queryCursor(sql.assessment_instance_submissions, {
        assessment_id: res.locals.assessment.id,
        include_all,
        include_final,
        include_best,
        group_work: res.locals.assessment.group_work,
      });

      let submissionColumn = identityColumn;
      if (res.locals.assessment.group_work) {
        submissionColumn = identityColumn.concat([['SubmitStudent', 'submission_user']]);
      }
      const columns = submissionColumn.concat([
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
        ['Assigned manual grader', 'assigned_grader'],
        ['Last manual grader', 'last_grader'],
        ['Score', 'score'],
        ['Correct', 'correct'],
        ['Feedback', 'feedback'],
        ['Question points', 'points'],
        ['Max points', 'max_points'],
        ['Question % score', 'score_perc'],
        ['Auto points', 'auto_points'],
        ['Max auto points', 'max_auto_points'],
        ['Manual points', 'manual_points'],
        ['Max manual points', 'max_manual_points'],
      ]);

      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifyWithColumns(columns), res);
    } else if (req.params.filename === res.locals.filesForManualGradingZipFilename) {
      const cursor = await sqldb.queryCursor(sql.files_for_manual_grading, {
        assessment_id: res.locals.assessment.id,
        group_work: res.locals.assessment.group_work,
      });

      res.attachment(req.params.filename);

      const archive = archiver('zip');
      const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(
        ' ',
        '',
      );
      const prefix = `${dirname}/`;
      archive.append(null, { name: prefix });
      archive.pipe(res);

      for await (const rows of cursor.iterate(100)) {
        for (const row of rows) {
          const contents = row.contents != null ? row.contents : '';
          archive.append(contents, { name: prefix + row.filename });
        }
      }
      archive.finalize();
    } else if (
      req.params.filename === res.locals.allFilesZipFilename ||
      req.params.filename === res.locals.finalFilesZipFilename ||
      req.params.filename === res.locals.bestFilesZipFilename
    ) {
      const include_all = req.params.filename === res.locals.allFilesZipFilename;
      const include_final = req.params.filename === res.locals.finalFilesZipFilename;
      const include_best = req.params.filename === res.locals.bestFilesZipFilename;

      const cursor = await sqldb.queryCursor(sql.assessment_instance_files, {
        assessment_id: res.locals.assessment.id,
        limit: 100,
        include_all,
        include_final,
        include_best,
        group_work: res.locals.assessment.group_work,
      });

      res.attachment(req.params.filename);

      const archive = archiver('zip');
      const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replace(
        ' ',
        '',
      );
      const prefix = `${dirname}/`;
      archive.append(null, { name: prefix });
      archive.pipe(res);

      for await (const rows of cursor.iterate(100)) {
        for (const row of rows) {
          const contents = row.contents != null ? row.contents : '';
          archive.append(contents, { name: prefix + row.filename });
        }
      }
      archive.finalize();
    } else if (req.params.filename === res.locals.groupsCsvFilename) {
      const cursor = await sqldb.queryCursor(sql.group_configs, {
        assessment_id: res.locals.assessment.id,
      });

      /** @type {Columns} */
      const columns = [
        ['groupName', 'name'],
        ['UID', 'uid'],
      ];
      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifyWithColumns(columns), res);
    } else if (req.params.filename === res.locals.scoresGroupCsvFilename) {
      await sendInstancesCsv(res, req, scoresGroupColumns, {
        only_highest: true,
        group_work: true,
      });
    } else if (req.params.filename === res.locals.scoresGroupAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresGroupColumns, {
        only_highest: false,
        group_work: true,
      });
    } else if (req.params.filename === res.locals.pointsGroupCsvFilename) {
      await sendInstancesCsv(res, req, pointsGroupColumns, {
        only_highest: true,
        group_work: true,
      });
    } else if (req.params.filename === res.locals.pointsGroupAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsGroupColumns, {
        only_highest: false,
        group_work: true,
      });
    } else {
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

module.exports = router;
