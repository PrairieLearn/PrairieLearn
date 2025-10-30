import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';

import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import {
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import { FileModifyEditor, MultiEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';
import { ZoneAssessmentJsonSchema } from '../../schemas/infoAssessment.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const SaveQuestionsSchema = z.object({
  __action: z.literal('save_questions'),
  __csrf_token: z.string(),
  orig_hash: z.string(),
  zones: z
    .string()
    .transform((str) => {
      try {
        return JSON.parse(str);
      } catch {
        throw new Error('Invalid JSON in zones field');
      }
    })
    .pipe(z.array(ZoneAssessmentJsonSchema)),
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const questionRows = await selectAssessmentQuestions({
      assessment_id: res.locals.assessment.id,
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

    const editorEnabled = await features.enabledFromLocals(
      'assessment-questions-editor',
      res.locals,
    );

    res.send(
      InstructorAssessmentQuestions({
        resLocals: res.locals,
        questionRows,
        origHash,
        editorEnabled,
      }),
    );
  }),
);

router.get(
  '/:qid.json',
  asyncHandler(async (req, res) => {
    const assessmentQuestion = await sqldb.queryOptionalRow(
      sql.select_assessment_question,
      {
        qid: req.params.qid,
        course_id: res.locals.course.id,
      },
      z.object({
        question: StaffQuestionSchema,
        topic: StaffTopicSchema,
        open_issue_count: z.number(),
        tags: z.array(StaffTagSchema),
      }),
    );
    res.json(assessmentQuestion);
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      if (res.locals.assessment.type === 'Exam') {
        // See https://github.com/PrairieLearn/PrairieLearn/issues/12977
        throw new HttpStatusError(403, 'Cannot reset variants for Exam assessments');
      }

      await resetVariantsForAssessmentQuestion({
        assessment_id: res.locals.assessment.id,
        unsafe_assessment_question_id: req.body.unsafe_assessment_question_id,
        authn_user_id: res.locals.authn_user.user_id,
      });
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'save_questions') {
      const editorEnabled = await features.enabledFromLocals(
        'assessment-questions-editor',
        res.locals,
      );
      if (!editorEnabled) {
        throw new HttpStatusError(403, 'Assessment questions editor feature is not enabled');
      }

      const body = SaveQuestionsSchema.parse(req.body);

      const assessmentPath = path.join(
        res.locals.course.path,
        'courseInstances',
        res.locals.course_instance.short_name,
        'assessments',
        res.locals.assessment.tid,
        'infoAssessment.json',
      );

      if (!(await fs.pathExists(assessmentPath))) {
        throw new error.HttpStatusError(400, 'infoAssessment.json does not exist');
      }

      const paths = getPaths(undefined, res.locals);
      const assessmentInfo = JSON.parse(await fs.readFile(assessmentPath, 'utf8'));

      // Filter out default values from zones data
      const filteredZones = body.zones.map((zone, i) => {
        // Start with a shallow copy of the existing zone to preserve unknown fields
        const existingZone = assessmentInfo.zones?.[i];
        const filteredZone: any = existingZone ? { ...existingZone } : {};

        // Overwrite known fields with filtered values
        filteredZone.title = propertyValueWithDefault(existingZone?.title, zone.title, null);
        filteredZone.maxPoints = propertyValueWithDefault(
          existingZone?.maxPoints,
          zone.maxPoints,
          null,
        );
        filteredZone.numberChoose = propertyValueWithDefault(
          existingZone?.numberChoose,
          zone.numberChoose,
          null,
        );
        filteredZone.bestQuestions = propertyValueWithDefault(
          existingZone?.bestQuestions,
          zone.bestQuestions,
          null,
        );
        filteredZone.advanceScorePerc = propertyValueWithDefault(
          existingZone?.advanceScorePerc,
          zone.advanceScorePerc,
          null,
        );
        filteredZone.gradeRateMinutes = propertyValueWithDefault(
          existingZone?.gradeRateMinutes,
          zone.gradeRateMinutes,
          null,
        );
        filteredZone.comment = propertyValueWithDefault(existingZone?.comment, zone.comment, null);
        filteredZone.allowRealTimeGrading = propertyValueWithDefault(
          existingZone?.allowRealTimeGrading,
          zone.allowRealTimeGrading,
          null,
        );
        filteredZone.canSubmit = propertyValueWithDefault(
          existingZone?.canSubmit,
          zone.canSubmit,
          (v) => !v || v.length === 0,
        );
        filteredZone.canView = propertyValueWithDefault(
          existingZone?.canView,
          zone.canView,
          (v) => !v || v.length === 0,
        );

        // Filter questions/alternative groups
        filteredZone.questions = zone.questions.map((question, j) => {
          // Start with a shallow copy of the existing question to preserve unknown fields
          const existingQuestion = existingZone?.questions?.[j];
          const filteredQuestion: any = existingQuestion ? { ...existingQuestion } : {};

          // Check if this is a single question or an alternative group
          if ('alternatives' in question) {
            // This is an alternative group
            filteredQuestion.numberChoose = propertyValueWithDefault(
              existingQuestion?.numberChoose,
              question.numberChoose,
              1,
            );

            // Filter alternatives
            filteredQuestion.alternatives = question.alternatives?.map((alternative, k) => {
              // Start with a shallow copy of the existing alternative to preserve unknown fields
              const existingAlternative = existingQuestion?.alternatives?.[k];
              const filteredAlternative: any = existingAlternative
                ? { ...existingAlternative }
                : {};

              // Overwrite known fields
              filteredAlternative.id = alternative.id;
              filteredAlternative.points = propertyValueWithDefault(
                existingAlternative?.points,
                alternative.points,
                0,
              );
              filteredAlternative.autoPoints = propertyValueWithDefault(
                existingAlternative?.autoPoints,
                alternative.autoPoints,
                0,
              );
              filteredAlternative.maxPoints = propertyValueWithDefault(
                existingAlternative?.maxPoints,
                alternative.maxPoints,
                0,
              );
              filteredAlternative.maxAutoPoints = propertyValueWithDefault(
                existingAlternative?.maxAutoPoints,
                alternative.maxAutoPoints,
                0,
              );
              filteredAlternative.manualPoints = propertyValueWithDefault(
                existingAlternative?.manualPoints,
                alternative.manualPoints,
                0,
              );
              filteredAlternative.triesPerVariant = propertyValueWithDefault(
                existingAlternative?.triesPerVariant,
                alternative.triesPerVariant,
                1,
              );
              filteredAlternative.advanceScorePerc = propertyValueWithDefault(
                existingAlternative?.advanceScorePerc,
                alternative.advanceScorePerc,
                null,
              );
              filteredAlternative.gradeRateMinutes = propertyValueWithDefault(
                existingAlternative?.gradeRateMinutes,
                alternative.gradeRateMinutes,
                null,
              );
              filteredAlternative.allowRealTimeGrading = propertyValueWithDefault(
                existingAlternative?.allowRealTimeGrading,
                alternative.allowRealTimeGrading,
                null,
              );
              filteredAlternative.forceMaxPoints = propertyValueWithDefault(
                existingAlternative?.forceMaxPoints,
                alternative.forceMaxPoints,
                null,
              );

              return filteredAlternative;
            });
          } else {
            // This is a single question
            filteredQuestion.id = question.id;
          }

          // Overwrite known question fields
          filteredQuestion.comment = propertyValueWithDefault(
            existingQuestion?.comment,
            question.comment,
            null,
          );
          filteredQuestion.allowRealTimeGrading = propertyValueWithDefault(
            existingQuestion?.allowRealTimeGrading,
            question.allowRealTimeGrading,
            null,
          );
          filteredQuestion.forceMaxPoints = propertyValueWithDefault(
            existingQuestion?.forceMaxPoints,
            question.forceMaxPoints,
            null,
          );
          filteredQuestion.canSubmit = propertyValueWithDefault(
            existingQuestion?.canSubmit,
            question.canSubmit,
            (v) => !v || v.length === 0,
          );
          filteredQuestion.canView = propertyValueWithDefault(
            existingQuestion?.canView,
            question.canView,
            (v) => !v || v.length === 0,
          );
          filteredQuestion.points = propertyValueWithDefault(
            existingQuestion?.points,
            question.points,
            0,
          );
          filteredQuestion.autoPoints = propertyValueWithDefault(
            existingQuestion?.autoPoints,
            question.autoPoints,
            0,
          );
          filteredQuestion.maxPoints = propertyValueWithDefault(
            existingQuestion?.maxPoints,
            question.maxPoints,
            null,
          );
          filteredQuestion.maxAutoPoints = propertyValueWithDefault(
            existingQuestion?.maxAutoPoints,
            question.maxAutoPoints,
            0,
          );
          filteredQuestion.manualPoints = propertyValueWithDefault(
            existingQuestion?.manualPoints,
            question.manualPoints,
            0,
          );
          filteredQuestion.triesPerVariant = propertyValueWithDefault(
            existingQuestion?.triesPerVariant,
            question.triesPerVariant,
            1,
          );
          filteredQuestion.advanceScorePerc = propertyValueWithDefault(
            existingQuestion?.advanceScorePerc,
            question.advanceScorePerc,
            null,
          );
          filteredQuestion.gradeRateMinutes = propertyValueWithDefault(
            existingQuestion?.gradeRateMinutes,
            question.gradeRateMinutes,
            null,
          );

          return filteredQuestion;
        });

        return filteredZone;
      });

      // Update the zones with the filtered data
      assessmentInfo.zones = filteredZones;

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

      const editor = new MultiEditor(
        {
          locals: res.locals as any,
          description: `Update assessment questions for ${res.locals.assessment.tid}`,
        },
        [
          new FileModifyEditor({
            locals: res.locals as any,
            container: {
              rootPath: paths.rootPath,
              invalidRootPaths: paths.invalidRootPaths,
            },
            filePath: assessmentPath,
            editContents: b64EncodeUnicode(formattedJson),
            origHash: body.orig_hash,
          }),
        ],
      );

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }

      flash('success', 'Assessment questions updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
