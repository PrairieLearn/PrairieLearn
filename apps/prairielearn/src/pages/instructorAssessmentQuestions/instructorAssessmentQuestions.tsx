import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { compiledScriptTag } from '../../lib/assets.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import {
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import { FileModifyEditor } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectQuestionsForCourse } from '../../models/questions.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';
import { ZoneAssessmentJsonSchema } from '../../schemas/infoAssessment.js';

import { InstructorAssessmentQuestionsTable } from './components/InstructorAssessmentQuestionsTable.js';
import type { CourseQuestionForPicker } from './types.js';
import { stripZoneDefaults } from './utils/dataTransform.js';
import { buildHierarchicalAssessment } from './utils/questions.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

const SaveQuestionsZonesSchema = z
  .string()
  .transform((str) => {
    try {
      return JSON.parse(str);
    } catch {
      throw new Error('Invalid JSON in zones field');
    }
  })
  .pipe(z.array(ZoneAssessmentJsonSchema));

const SaveQuestionsSchema = z.object({
  __action: z.literal('save_questions'),
  orig_hash: z.string(),
  zones: SaveQuestionsZonesSchema,
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [questionRows, courseQuestions] = await Promise.all([
      selectAssessmentQuestions({
        assessment_id: res.locals.assessment.id,
      }),
      selectQuestionsForCourse(res.locals.course.id, [res.locals.course_instance.id]),
    ]);

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
      // TODO: Use helper once assessment sets PR lands
      const assessmentFileContents = await fs.readFile(assessmentPath, 'utf8');
      origHash = sha256(b64EncodeUnicode(assessmentFileContents)).toString();
    }

    // We use the database instead of the contents on disk as we want to consider the database as the 'source of truth'
    // for doing operations.
    const jsonZones = buildHierarchicalAssessment(res.locals.course, questionRows);

    // Transform course questions to the simpler type needed for the picker
    const courseQuestionsForPicker: CourseQuestionForPicker[] = courseQuestions.map((q) => ({
      qid: q.qid,
      title: q.title,
      topic: { id: String(q.topic.id), name: q.topic.name, color: q.topic.color },
      tags:
        q.tags?.map((t) => ({ id: String(t.id), name: t.name, color: t.color })) ?? null,
    }));

    const editorEnabled = await features.enabledFromLocals(
      'assessment-questions-editor',
      res.locals,
    );

    const pageContext = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    const canEdit =
      pageContext.authz_data.has_course_instance_permission_edit &&
      !res.locals.course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Questions',
        headContent: compiledScriptTag('instructorAssessmentQuestionsClient.ts'),
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'questions',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <InstructorAssessmentQuestionsTable
              course={pageContext.course}
              questionRows={questionRows}
              courseQuestions={courseQuestionsForPicker}
              jsonZones={jsonZones}
              urlPrefix={pageContext.urlPrefix}
              assessment={pageContext.assessment}
              assessmentSetName={pageContext.assessment_set.name}
              hasCoursePermissionPreview={pageContext.authz_data.has_course_permission_preview}
              canEdit={canEdit ?? false}
              csrfToken={res.locals.__csrf_token}
              origHash={origHash}
              editorEnabled={editorEnabled}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.get(
  '/question.json',
  asyncHandler(async (req, res) => {
    // TODO: Is this needed?
    if (!res.locals.authz_data.has_course_permission_preview) {
      throw new HttpStatusError(403, 'Access denied');
    }

    const parsedQuery = z
      .object({
        qid: z.string(),
      })
      .parse(req.query);

    const assessmentQuestion = await sqldb.queryOptionalRow(
      sql.select_assessment_question,
      {
        qid: parsedQuery.qid,
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
        authn_user_id: res.locals.authn_user.id,
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
        throw new HttpStatusError(400, 'infoAssessment.json does not exist');
      }

      const paths = getPaths(undefined, res.locals);
      const assessmentInfo = JSON.parse(await fs.readFile(assessmentPath, 'utf8'));

      // Strip default values from zones data.
      const filteredZones = stripZoneDefaults(body.zones);

      // Update the zones with the filtered data
      assessmentInfo.zones = filteredZones;

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(assessmentInfo));

      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: assessmentPath,
        editContents: b64EncodeUnicode(formattedJson),
        origHash: body.orig_hash,
      });

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
