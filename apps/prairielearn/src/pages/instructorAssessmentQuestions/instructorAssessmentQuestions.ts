import path from 'node:path';

import { AnsiUp } from 'ansi_up';
import sha256 from 'crypto-js/sha256.js';
import * as express from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import * as error from '@prairielearn/error';
import { queryRows, loadSqlEquiv } from '@prairielearn/postgres';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';
import {
  InstructorAssessmentQuestions,
  AssessmentQuestionRowSchema,
} from './instructorAssessmentQuestions.html.js';

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
    res.send(InstructorAssessmentQuestions({ resLocals: res.locals, questions }));
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
    } else if (req.body.__action === 'delete_question_from_assessment') {
      const infoAssessmentPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      );
      try {
        await fs.access(infoAssessmentPath);
      } catch (err) {
        throw new Error('Assessment infoAssessment.json can not access');
      }

      interface Assessment {
        zones: any[];
        [key: string]: any;
      }

      const infoAssessmentString = await fs.readFile(infoAssessmentPath, 'utf-8');
      const origin_hash = sha256(b64EncodeUnicode(infoAssessmentString)).toString();

      let infoAssessment: Assessment;

      try {
        infoAssessment = JSON.parse(infoAssessmentString);
      } catch (err) {
        throw new Error('Assessment infoAssessment.json can not parse');
      }

      // remove Hit question from infoAssessment
      infoAssessment.zones = infoAssessment.zones.map((zone) => ({
        ...zone,
        questions: zone.questions.filter(
          (question) => question.id !== req.body.unsafe_question_qid,
        ),
      }));

      infoAssessment.zones = infoAssessment.zones.filter((zone) => zone.questions.length > 0);

      const paths = getPaths(req, res);

      const container = {
        rootPath: paths.rootPath,
        invalidRootPaths: paths.invalidRootPaths,
      };
      const editor = new FileModifyEditor({
        locals: res.locals,
        container,
        filePath: infoAssessmentPath,
        editContents: b64EncodeUnicode(JSON.stringify(infoAssessment, null, 2)),
        origHash: origin_hash,
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch (error) {
        res.redirect(req.originalUrl);
      }

      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
