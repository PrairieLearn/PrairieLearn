import asyncHandler = require('express-async-handler');
import * as express from 'express';
import archiver = require('archiver');
import { stringifyStream } from '@prairielearn/csv';
import { pipeline } from 'node:stream/promises';

import { assessmentFilenamePrefix } from '../../lib/sanitize-name';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';
import { getGroupConfig } from '../../lib/groups';
import { InstructorAssessmentDownloads, Filenames } from './instructorAssessmentDownloads.html';

const router = express.Router();
const sql = sqldb.loadSqlEquiv(__filename);

type Columns = [string, string][];

function getFilenames(locals) {
  const prefix = assessmentFilenamePrefix(
    locals.assessment,
    locals.assessment_set,
    locals.course_instance,
    locals.course,
  );

  const filenames: Filenames = {
    scoresCsvFilename: prefix + 'scores.csv',
    scoresAllCsvFilename: prefix + 'scores_all.csv',
    pointsCsvFilename: prefix + 'points.csv',
    pointsAllCsvFilename: prefix + 'points_all.csv',
    scoresByUsernameCsvFilename: prefix + 'scores_by_username.csv',
    scoresByUsernameAllCsvFilename: prefix + 'scores_by_username_all.csv',
    pointsByUsernameCsvFilename: prefix + 'points_by_username.csv',
    pointsByUsernameAllCsvFilename: prefix + 'points_by_username_all.csv',
    instancesCsvFilename: prefix + 'instances.csv',
    instancesAllCsvFilename: prefix + 'instances_all.csv',
    instanceQuestionsCsvFilename: prefix + 'instance_questions.csv',
    submissionsForManualGradingCsvFilename: prefix + 'submissions_for_manual_grading.csv',
    finalSubmissionsCsvFilename: prefix + 'final_submissions.csv',
    bestSubmissionsCsvFilename: prefix + 'best_submissions.csv',
    allSubmissionsCsvFilename: prefix + 'all_submissions.csv',
    filesForManualGradingZipFilename: prefix + 'files_for_manual_grading.zip',
    finalFilesZipFilename: prefix + 'final_files.zip',
    bestFilesZipFilename: prefix + 'best_files.zip',
    allFilesZipFilename: prefix + 'all_files.zip',
  };
  if (locals.assessment.group_work) {
    filenames.groupsCsvFilename = prefix + 'groups.csv';
    filenames.scoresGroupCsvFilename = prefix + 'scores_by_group.csv';
    filenames.scoresGroupAllCsvFilename = prefix + 'scores_by_group_all.csv';
    filenames.pointsGroupCsvFilename = prefix + 'points_by_group.csv';
    filenames.pointsGroupAllCsvFilename = prefix + 'points_by_group_all.csv';
  }
  return filenames;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw error.make(403, 'Access denied (must be a student data viewer)');
    }
    res.send(
      InstructorAssessmentDownloads({ resLocals: res.locals, filenames: getFilenames(res.locals) }),
    );
  }),
);

/*
 * Local abstraction to adapt our internal notion of columns to the columns
 * format that the CSV `stringify()` function expects.
 */
function stringifyWithColumns(columns: Columns, transform?: (record: any) => any) {
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

    const filenames = getFilenames(res.locals);

    const assessmentName = res.locals.assessment_set.name + ' ' + res.locals.assessment.number;
    const studentColumn: Columns = [
      ['UID', 'uid'],
      ['UIN', 'uin'],
    ];
    const usernameColumn: Columns = [['Username', 'username']];
    const groupNameColumn: Columns = [
      ['Group name', 'group_name'],
      ['Usernames', 'uid_list'],
    ];
    const scoreColumn: Columns = [[assessmentName, 'score_perc']];
    const pointColumn: Columns = [[assessmentName, 'points']];
    const instanceColumn: Columns = [
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
    const scoresColumns = studentColumn.concat(scoreColumn);
    const pointsColumns = studentColumn.concat(pointColumn);
    const scoresGroupColumns = groupNameColumn.concat(scoreColumn);
    const pointsGroupColumns = groupNameColumn.concat(pointColumn);
    const scoresByUsernameColumns = usernameColumn.concat(scoreColumn);
    const pointsByUsernameColumns = usernameColumn.concat(pointColumn);
    let identityColumn = studentColumn.concat(
      usernameColumn.concat([
        ['Name', 'name'],
        ['Role', 'role'],
      ]),
    );
    if (res.locals.assessment.group_work) {
      identityColumn = groupNameColumn;
    }
    const instancesColumns = identityColumn.concat(instanceColumn);

    if (req.params.filename === filenames.scoresCsvFilename) {
      await sendInstancesCsv(res, req, scoresColumns, { only_highest: true });
    } else if (req.params.filename === filenames.scoresAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresColumns, { only_highest: false });
    } else if (req.params.filename === filenames.scoresByUsernameCsvFilename) {
      await sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: true });
    } else if (req.params.filename === filenames.scoresByUsernameAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresByUsernameColumns, { only_highest: false });
    } else if (req.params.filename === filenames.pointsCsvFilename) {
      await sendInstancesCsv(res, req, pointsColumns, { only_highest: true });
    } else if (req.params.filename === filenames.pointsAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsColumns, { only_highest: false });
    } else if (req.params.filename === filenames.pointsByUsernameCsvFilename) {
      await sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: true });
    } else if (req.params.filename === filenames.pointsByUsernameAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsByUsernameColumns, { only_highest: false });
    } else if (req.params.filename === filenames.instancesCsvFilename) {
      await sendInstancesCsv(res, req, instancesColumns, {
        only_highest: true,
        group_work: res.locals.assessment.group_work,
      });
    } else if (req.params.filename === filenames.instancesAllCsvFilename) {
      await sendInstancesCsv(res, req, instancesColumns, {
        only_highest: false,
        group_work: res.locals.assessment.group_work,
      });
    } else if (req.params.filename === filenames.instanceQuestionsCsvFilename) {
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
    } else if (req.params.filename === filenames.submissionsForManualGradingCsvFilename) {
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
      req.params.filename === filenames.allSubmissionsCsvFilename ||
      req.params.filename === filenames.finalSubmissionsCsvFilename ||
      req.params.filename === filenames.bestSubmissionsCsvFilename
    ) {
      const include_all = req.params.filename === filenames.allSubmissionsCsvFilename;
      const include_final = req.params.filename === filenames.finalSubmissionsCsvFilename;
      const include_best = req.params.filename === filenames.bestSubmissionsCsvFilename;

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
    } else if (req.params.filename === filenames.filesForManualGradingZipFilename) {
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
      archive.append('', { name: prefix });
      archive.pipe(res);

      for await (const rows of cursor.iterate(100)) {
        for (const row of rows) {
          const contents = row.contents != null ? row.contents : '';
          archive.append(contents, { name: prefix + row.filename });
        }
      }
      archive.finalize();
    } else if (
      req.params.filename === filenames.allFilesZipFilename ||
      req.params.filename === filenames.finalFilesZipFilename ||
      req.params.filename === filenames.bestFilesZipFilename
    ) {
      const include_all = req.params.filename === filenames.allFilesZipFilename;
      const include_final = req.params.filename === filenames.finalFilesZipFilename;
      const include_best = req.params.filename === filenames.bestFilesZipFilename;

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
      archive.append('', { name: prefix });
      archive.pipe(res);

      for await (const rows of cursor.iterate(100)) {
        for (const row of rows) {
          const contents = row.contents != null ? row.contents : '';
          archive.append(contents, { name: prefix + row.filename });
        }
      }
      archive.finalize();
    } else if (req.params.filename === filenames.groupsCsvFilename) {
      const groupConfig = await getGroupConfig(res.locals.assessment.id);
      const cursor = await sqldb.queryCursor(sql.group_configs, {
        assessment_id: res.locals.assessment.id,
      });

      const columns: Columns = [
        ['groupName', 'name'],
        ['UID', 'uid'],
      ];
      if (groupConfig.has_roles) columns.push(['Role(s)', 'roles']);
      res.attachment(req.params.filename);
      await pipeline(cursor.stream(100), stringifyWithColumns(columns), res);
    } else if (req.params.filename === filenames.scoresGroupCsvFilename) {
      await sendInstancesCsv(res, req, scoresGroupColumns, {
        only_highest: true,
        group_work: true,
      });
    } else if (req.params.filename === filenames.scoresGroupAllCsvFilename) {
      await sendInstancesCsv(res, req, scoresGroupColumns, {
        only_highest: false,
        group_work: true,
      });
    } else if (req.params.filename === filenames.pointsGroupCsvFilename) {
      await sendInstancesCsv(res, req, pointsGroupColumns, {
        only_highest: true,
        group_work: true,
      });
    } else if (req.params.filename === filenames.pointsGroupAllCsvFilename) {
      await sendInstancesCsv(res, req, pointsGroupColumns, {
        only_highest: false,
        group_work: true,
      });
    } else {
      throw error.make(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

export default router;
