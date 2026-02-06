import { pipeline } from 'node:stream/promises';

import archiver from 'archiver';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';

import { stringifyStream } from '@prairielearn/csv';
import * as error from '@prairielearn/error';
import * as sqldb from '@prairielearn/postgres';

import {
  AssessmentInstanceSchema,
  AssessmentQuestionSchema,
  GroupRoleSchema,
  GroupSchema,
  InstanceQuestionSchema,
  QuestionSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  SprocUsersGetDisplayedRoleSchema,
  type Submission,
  SubmissionSchema,
  UserSchema,
  type Variant,
  VariantSchema,
} from '../../lib/db-types.js';
import { getGroupConfig } from '../../lib/groups.js';
import { type ResLocalsForPage, typedAsyncHandler } from '../../lib/res-locals.js';
import { assessmentFilenamePrefix } from '../../lib/sanitize-name.js';

import {
  type Filenames,
  InstructorAssessmentDownloads,
} from './instructorAssessmentDownloads.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

type Columns = [string, string][];

const AssessmentInstanceSubmissionRowSchema = z.object({
  uid: UserSchema.shape.uid.nullable(),
  uin: UserSchema.shape.uin.nullable(),
  name: UserSchema.shape.name.nullable(),
  role: SprocUsersGetDisplayedRoleSchema,
  assessment_label: z.string(),
  assessment_instance_number: AssessmentInstanceSchema.shape.number,
  qid: QuestionSchema.shape.qid,
  instance_question_number: InstanceQuestionSchema.shape.number,
  points: InstanceQuestionSchema.shape.points,
  score_perc: InstanceQuestionSchema.shape.score_perc,
  auto_points: InstanceQuestionSchema.shape.auto_points,
  manual_points: InstanceQuestionSchema.shape.manual_points,
  max_points: AssessmentQuestionSchema.shape.max_points,
  max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
  max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
  variant_number: VariantSchema.shape.number,
  variant_seed: VariantSchema.shape.variant_seed,
  params: SubmissionSchema.shape.params,
  true_answer: SubmissionSchema.shape.true_answer,
  options: VariantSchema.shape.options,
  date: SubmissionSchema.shape.date,
  submission_id: SubmissionSchema.shape.id,
  submission_date_formatted: z.string(),
  submitted_answer: SubmissionSchema.shape.submitted_answer,
  partial_scores: SubmissionSchema.shape.partial_scores,
  override_score: SubmissionSchema.shape.override_score,
  credit: SubmissionSchema.shape.credit,
  mode: SubmissionSchema.shape.mode,
  grading_requested_at_formatted: z.string().nullable(),
  graded_at_formatted: z.string().nullable(),
  correct: z.enum(['TRUE', 'FALSE']).nullable(),
  feedback: SubmissionSchema.shape.feedback,
  rubric_grading: RubricGradingSchema.pick({ computed_points: true, adjust_points: true })
    .extend({ items: RubricGradingItemSchema.pick({ description: true, points: true }).array() })
    .nullable(),
  submission_number: z.number(),
  final_submission_per_variant: z.boolean(),
  best_submission_per_variant: z.boolean(),
  group_name: GroupSchema.shape.name.nullable(),
  uid_list: z.array(z.string()).nullable(),
  submission_user: UserSchema.shape.uid.nullable(),
  assigned_grader: UserSchema.shape.uid.nullable(),
  last_grader: UserSchema.shape.uid.nullable(),
  zone_number: z.number(),
  zone_title: z.string().nullable(),
});
type AssessmentInstanceSubmissionRow = z.infer<typeof AssessmentInstanceSubmissionRowSchema>;

const ManualGradingSubmissionRowSchema = z.object({
  uid: UserSchema.shape.uid.nullable(),
  uin: UserSchema.shape.uin.nullable(),
  zone_number: z.number(),
  zone_title: z.string().nullable(),
  qid: QuestionSchema.shape.qid,
  old_score_perc: InstanceQuestionSchema.shape.score_perc,
  old_auto_points: InstanceQuestionSchema.shape.auto_points,
  old_manual_points: InstanceQuestionSchema.shape.manual_points,
  max_points: AssessmentQuestionSchema.shape.max_points,
  max_auto_points: AssessmentQuestionSchema.shape.max_auto_points,
  max_manual_points: AssessmentQuestionSchema.shape.max_manual_points,
  old_feedback: SubmissionSchema.shape.feedback,
  submission_id: SubmissionSchema.shape.id,
  params: SubmissionSchema.shape.params,
  true_answer: SubmissionSchema.shape.true_answer,
  submitted_answer: SubmissionSchema.shape.submitted_answer,
  old_partial_scores: SubmissionSchema.shape.partial_scores,
  group_name: GroupSchema.shape.name.nullable(),
  uid_list: z.array(z.string()).nullable(),
});

type ManualGradingSubmissionRow = z.infer<typeof ManualGradingSubmissionRowSchema>;

export function getFilenames(locals: ResLocalsForPage<'assessment'>) {
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
  if (locals.assessment.team_work) {
    filenames.groupsCsvFilename = prefix + 'groups.csv';
    filenames.scoresGroupCsvFilename = prefix + 'scores_by_group.csv';
    filenames.scoresGroupAllCsvFilename = prefix + 'scores_by_group_all.csv';
    filenames.pointsGroupCsvFilename = prefix + 'points_by_group.csv';
    filenames.pointsGroupAllCsvFilename = prefix + 'points_by_group_all.csv';
  }
  return filenames;
}

function parseFileContents(contents: any): Buffer | null {
  if (contents == null) return null;

  try {
    return Buffer.from(typeof contents === 'string' ? contents : '', 'base64');
  } catch {
    // Ignore any errors in reading the contents and treat as a blank file.
    return Buffer.from('');
  }
}

interface RowForFiles {
  submitted_answer: Submission['submitted_answer'];
  params: Variant['params'];
}

function extractFiles<T extends RowForFiles>(
  row: T,
  makeFilename: (filename: string | null) => string | null,
): ArchiveFile[] | null {
  if (row.submitted_answer?.fileData) {
    // Legacy v2 question data.
    return [
      {
        filename: makeFilename(row.params?.fileName),
        contents: parseFileContents(row.submitted_answer.fileData),
      },
    ];
  }

  // v3 question data.
  return row.submitted_answer?._files?.map((file: any) => ({
    filename: makeFilename(file.name),
    contents: parseFileContents(file.contents),
  }));
}

function extractFilesForSubmissions(row: AssessmentInstanceSubmissionRow): ArchiveFile[] | null {
  // This doesn't handle QIDs with slashes in them:
  // https://github.com/PrairieLearn/PrairieLearn/issues/7715
  //
  // We should probably rethink the directory structure that this will spit out.
  const filenamePrefix = [
    row.group_name ?? row.uid,
    row.assessment_instance_number,
    row.qid,
    row.variant_number,
    row.submission_number,
    row.submission_id,
  ].join('_');

  return extractFiles(row, (suffix) => {
    if (suffix == null) return null;

    return filenamePrefix + '_' + suffix;
  });
}

function extractFilesForManualGrading(row: ManualGradingSubmissionRow): ArchiveFile[] | null {
  // This doesn't handle QIDs with slashes in them:
  // https://github.com/PrairieLearn/PrairieLearn/issues/7715
  //
  // We should probably rethink the directory structure that this will spit out.
  // We should also aim for more consistency between this function and
  // `extractFilesForSubmissions`.
  const filenamePrefix = [
    row.group_name ?? [row.uid, row.uin].join('_'),
    row.qid,
    row.submission_id,
  ].join('_');

  return extractFiles(row, (suffix) => {
    if (suffix == null) return null;

    return filenamePrefix + '_' + suffix;
  });
}

interface ArchiveFile {
  filename: string | null;
  contents: Buffer | null;
}

async function pipeCursorToArchive<T>(
  res: Response,
  cursor: sqldb.CursorIterator<T>,
  extractFiles: (row: T) => ArchiveFile[] | null,
) {
  const archive = archiver('zip');
  const dirname = (res.locals.assessment_set.name + res.locals.assessment.number).replaceAll(
    ' ',
    '',
  );
  const prefix = `${dirname}/`;
  archive.append('', { name: prefix });
  archive.pipe(res);

  for await (const rows of cursor.iterate(100)) {
    for (const row of rows) {
      // Sort files to ensure consistent ordering; this is done
      // for backwards compatibility and may not be necessary.
      const files = extractFiles(row)?.sort((a, b) =>
        (a.filename ?? '').localeCompare(b.filename ?? ''),
      );

      if (!files) continue;

      for (const file of files) {
        // Exclude any files that are missing a name or contents.
        // We allow empty files, so we specifically check for null, not truthiness.
        if (!file.filename || file.contents == null) continue;

        archive.append(file.contents, { name: prefix + file.filename });
      }
    }
  }
  await archive.finalize();
}

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    res.send(
      InstructorAssessmentDownloads({ resLocals: res.locals, filenames: getFilenames(res.locals) }),
    );
  }),
);

/**
 * Local abstraction to adapt our internal notion of columns to the columns
 * format that the CSV `stringify()` function expects.
 */
function stringifyWithColumns(columns: Columns, transform?: (record: any) => any) {
  return stringifyStream({
    header: true,
    columns: columns.map(([header, key]) => ({ header, key })),
    transform,
  });
}

async function sendInstancesCsv(
  res: Response,
  req: Request,
  columns: Columns,
  options: { only_highest: boolean; group_work?: boolean },
) {
  const result = await sqldb.queryCursor(
    sql.select_assessment_instances,
    {
      assessment_id: res.locals.assessment.id,
      highest_score: options.only_highest,
      group_work: options.group_work,
    },
    z.unknown(),
  );

  res.attachment(req.params.filename);
  await pipeline(result.stream(100), stringifyWithColumns(columns), res);
}

router.get(
  '/:filename',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
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
    if (res.locals.assessment.team_work) {
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
        group_work: res.locals.assessment.team_work,
      });
    } else if (req.params.filename === filenames.instancesAllCsvFilename) {
      await sendInstancesCsv(res, req, instancesColumns, {
        only_highest: false,
        group_work: res.locals.assessment.team_work,
      });
    } else if (req.params.filename === filenames.instanceQuestionsCsvFilename) {
      const cursor = await sqldb.queryCursor(
        sql.select_instance_questions,
        { assessment_id: res.locals.assessment.id },
        z.unknown(),
      );

      const columns = identityColumn.concat([
        ['Assessment', 'assessment_label'],
        ['Assessment instance', 'assessment_instance_number'],
        ['Zone number', 'zone_number'],
        ['Zone title', 'zone_title'],
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
      const cursor = await sqldb.queryCursor(
        sql.submissions_for_manual_grading,
        { assessment_id: res.locals.assessment.id, include_files: false },
        ManualGradingSubmissionRowSchema,
      );

      // Replace user-friendly column names with upload-friendly names
      identityColumn = (res.locals.assessment.team_work ? groupNameColumn : studentColumn).map(
        (pair) => [pair[1], pair[1]],
      );
      const columns = identityColumn.concat([
        ['Zone number', 'zone_number'],
        ['Zone title', 'zone_title'],
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

      const cursor = await sqldb.queryCursor(
        sql.assessment_instance_submissions,
        { assessment_id: res.locals.assessment.id, include_all, include_final, include_best },
        AssessmentInstanceSubmissionRowSchema,
      );

      let submissionColumn = identityColumn;
      if (res.locals.assessment.team_work) {
        submissionColumn = identityColumn.concat([['SubmitStudent', 'submission_user']]);
      }
      const columns = submissionColumn.concat([
        ['Assessment', 'assessment_label'],
        ['Assessment instance', 'assessment_instance_number'],
        ['Zone number', 'zone_number'],
        ['Zone title', 'zone_title'],
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
        ['Rubric Grading', 'rubric_grading'],
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
      const cursor = await sqldb.queryCursor(
        sql.submissions_for_manual_grading,
        { assessment_id: res.locals.assessment.id, include_files: true },
        ManualGradingSubmissionRowSchema,
      );

      res.attachment(req.params.filename);
      await pipeCursorToArchive(res, cursor, extractFilesForManualGrading);
    } else if (
      req.params.filename === filenames.allFilesZipFilename ||
      req.params.filename === filenames.finalFilesZipFilename ||
      req.params.filename === filenames.bestFilesZipFilename
    ) {
      const include_all = req.params.filename === filenames.allFilesZipFilename;
      const include_final = req.params.filename === filenames.finalFilesZipFilename;
      const include_best = req.params.filename === filenames.bestFilesZipFilename;

      const cursor = await sqldb.queryCursor(
        sql.assessment_instance_submissions,
        { assessment_id: res.locals.assessment.id, include_all, include_final, include_best },
        AssessmentInstanceSubmissionRowSchema,
      );

      res.attachment(req.params.filename);
      await pipeCursorToArchive(res, cursor, extractFilesForSubmissions);
    } else if (req.params.filename === filenames.groupsCsvFilename) {
      const groupConfig = await getGroupConfig(res.locals.assessment.id);
      const cursor = await sqldb.queryCursor(
        sql.group_configs,
        { assessment_id: res.locals.assessment.id },
        z.object({
          name: GroupSchema.shape.name,
          uid: UserSchema.shape.uid,
          roles: z.array(GroupRoleSchema.shape.role_name),
        }),
      );

      const columns: Columns = [
        ['group_name', 'name'],
        ['uid', 'uid'],
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
      throw new error.HttpStatusError(404, 'Unknown filename: ' + req.params.filename);
    }
  }),
);

export default router;
