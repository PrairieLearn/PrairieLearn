import * as path from 'path';

import { AnsiUp } from 'ansi_up';
import sha256 from 'crypto-js/sha256.js';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { FindQIDModal } from './findQIDModal.html.js';
import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';
import { AssessmentQuestionRowSchema } from './instructorAssessmentQuestions.types.js';

const ansiUp = new AnsiUp();
const router = express.Router();
const sql = loadSqlEquiv(import.meta.url);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await queryRows(
      sql.questions,
      {
        assessment_id: res.locals.assessment.id,
        course_id: res.locals.course.id,
      },
      AssessmentQuestionRowSchema,
    );
    const questions = questionRows.map((row) => {
      if (row.sync_errors) row.sync_errors_ansified = ansiUp.ansi_to_html(row.sync_errors);
      if (row.sync_warnings) row.sync_warnings_ansified = ansiUp.ansi_to_html(row.sync_warnings);
      return row;
    });
    const assessmentPath = path.join(
      res.locals.course.path,
      'courseInstances',
      res.locals.course_instance.short_name,
      'assessments',
      res.locals.assessment.tid,
      'infoAssessment.json',
    );

    const assessmentPathExists = await fs.pathExists(assessmentPath);

    let origHash = '';
    if (assessmentPathExists) {
      origHash = sha256(b64EncodeUnicode(await fs.readFile(assessmentPath, 'utf8'))).toString();
    }

    const assessmentQuestionEditorEnabled = await features.enabledFromLocals(
      'assessment-questions-editor',
      res.locals,
    );

    res.send(
      InstructorAssessmentQuestions({
        resLocals: res.locals,
        questions,
        origHash,
        assessmentQuestionEditorEnabled,
      }),
    );
  }),
);

router.get(
  '/findqid',
  asyncHandler(async (req, res) => {
    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course_id: res.locals.course.id,
      user_id: res.locals.user.user_id,
      authn_user_id: res.locals.authn_user.user_id,
      is_administrator: res.locals.is_administrator,
      authn_is_administrator: res.locals.authz_data.authn_is_administrator,
    });

    const questions = await selectQuestionsForCourse(
      res.locals.course.id,
      courseInstances.map((ci) => ci.id),
    );
    res.send(
      FindQIDModal({
        questions,
        course_instances: courseInstances,
        showAddQuestionButton: false,
        showSharingSets: false,
        urlPrefix: res.locals.urlPrefix,
        plainUrlPrefix: res.locals.plainUrlPrefix,
        csrfToken: res.locals.csrfToken,
        currentQid: req.query.currentqid,
      }).toString(),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'edit_assessment_questions') {
      const assessmentPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      );
      const paths = getPaths(undefined, res.locals);
      const assessmentInfo = JSON.parse(await fs.readFile(assessmentPath, 'utf8'));
      assessmentInfo.zones = JSON.parse(req.body.zones);
      const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: assessmentPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: req.body.__orig_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
        flash('success', 'Assessment questions updated successfully');
        return res.redirect(req.originalUrl);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
