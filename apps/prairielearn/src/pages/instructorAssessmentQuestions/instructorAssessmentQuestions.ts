import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { HttpStatusError } from '@prairielearn/error';

import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { FileModifyEditor, MultiEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectAssessmentQuestions } from '../../models/assessment-question.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';

import { InstructorAssessmentQuestions } from './instructorAssessmentQuestions.html.js';

const router = Router();

// Zod schema for parsing zones data
const ZoneQuestionAlternativeSchema = z.object({
  id: z.string(),
  autoPoints: z.union([z.number(), z.array(z.number())]).nullable(),
  maxAutoPoints: z.number().nullable(),
  manualPoints: z.number().nullable(),
  triesPerVariant: z.number().nullable(),
  advanceScorePerc: z.number().nullable(),
  gradeRateMinutes: z.number().nullable(),
});

// Schema for a single question (without alternatives)
const ZoneQuestionSingleSchema = z.object({
  id: z.string(),
  autoPoints: z.union([z.number(), z.array(z.number())]).nullable(),
  maxAutoPoints: z.number().nullable(),
  manualPoints: z.number().nullable(),
  triesPerVariant: z.number().nullable(),
  advanceScorePerc: z.number().nullable(),
  gradeRateMinutes: z.number().nullable(),
});

// Schema for an alternative group
const ZoneQuestionAlternativeGroupSchema = z.object({
  numberChoose: z.number().nullable(),
  alternatives: z.array(ZoneQuestionAlternativeSchema),
});

// Union schema for questions (either single question or alternative group)
const ZoneQuestionSchema = z.union([ZoneQuestionSingleSchema, ZoneQuestionAlternativeGroupSchema]);

const ZoneSchema = z.object({
  title: z.string().nullable(),
  maxPoints: z.number().nullable(),
  numberChoose: z.number().nullable(),
  bestQuestions: z.number().nullable(),
  advanceScorePerc: z.number().nullable(),
  gradeRateMinutes: z.number().nullable(),
  questions: z.array(ZoneQuestionSchema),
});

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
    .pipe(z.array(ZoneSchema)),
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
      const filteredZones = body.zones.map((zone) => {
        const filteredZone: any = {};

        // Filter zone title
        filteredZone.title = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.title,
          zone.title,
          null,
        );

        // Filter zone-level properties
        filteredZone.maxPoints = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.maxPoints,
          zone.maxPoints,
          null,
        );
        filteredZone.numberChoose = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.numberChoose,
          zone.numberChoose,
          null,
        );
        filteredZone.bestQuestions = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.bestQuestions,
          zone.bestQuestions,
          null,
        );
        filteredZone.advanceScorePerc = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.advanceScorePerc,
          zone.advanceScorePerc,
          null,
        );
        filteredZone.gradeRateMinutes = propertyValueWithDefault(
          assessmentInfo.zones?.find((z: any) => z.title === zone.title)?.gradeRateMinutes,
          zone.gradeRateMinutes,
          null,
        );

        // Filter questions/alternative groups
        filteredZone.questions = zone.questions.map((question) => {
          // Check if this is a single question or an alternative group
          if ('alternatives' in question) {
            // This is an alternative group
            const filteredQuestion: any = {};

            filteredQuestion.numberChoose = propertyValueWithDefault(
              undefined,
              question.numberChoose,
              null,
            );

            // Filter alternatives
            filteredQuestion.alternatives = question.alternatives.map((alternative) => {
              const filteredAlternative: any = {
                id: alternative.id,
              };

              filteredAlternative.autoPoints = propertyValueWithDefault(
                undefined,
                alternative.autoPoints,
                0,
              );
              filteredAlternative.maxAutoPoints = propertyValueWithDefault(
                undefined,
                alternative.maxAutoPoints,
                0,
              );
              filteredAlternative.manualPoints = propertyValueWithDefault(
                undefined,
                alternative.manualPoints,
                0,
              );
              filteredAlternative.triesPerVariant = propertyValueWithDefault(
                undefined,
                alternative.triesPerVariant,
                1,
              );
              filteredAlternative.advanceScorePerc = propertyValueWithDefault(
                undefined,
                alternative.advanceScorePerc,
                null,
              );
              filteredAlternative.gradeRateMinutes = propertyValueWithDefault(
                undefined,
                alternative.gradeRateMinutes,
                null,
              );

              return filteredAlternative;
            });

            return filteredQuestion;
          } else {
            // This is a single question
            const filteredQuestion: any = {
              id: question.id,
            };

            filteredQuestion.autoPoints = propertyValueWithDefault(
              undefined,
              question.autoPoints,
              0,
            );
            filteredQuestion.maxAutoPoints = propertyValueWithDefault(
              undefined,
              question.maxAutoPoints,
              0,
            );
            filteredQuestion.manualPoints = propertyValueWithDefault(
              undefined,
              question.manualPoints,
              0,
            );
            filteredQuestion.triesPerVariant = propertyValueWithDefault(
              undefined,
              question.triesPerVariant,
              1,
            );
            filteredQuestion.advanceScorePerc = propertyValueWithDefault(
              undefined,
              question.advanceScorePerc,
              null,
            );
            filteredQuestion.gradeRateMinutes = propertyValueWithDefault(
              undefined,
              question.gradeRateMinutes,
              null,
            );

            return filteredQuestion;
          }
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
