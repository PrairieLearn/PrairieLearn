import * as path from 'path';

import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { selectAssessmentQuestions } from '../../lib/assessment-question.js';
import { compiledScriptTag, compiledStylesheetTag } from '../../lib/assets.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getAssessmentTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { features } from '../../lib/features/index.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { getUrl } from '../../lib/url.js';
import { selectAssessmentToolDefaults, selectZoneToolOverrides } from '../../models/assessment.js';
import { resetVariantsForAssessmentQuestion } from '../../models/variant.js';
import { type EnumAssessmentTool, ZoneAssessmentJsonSchema } from '../../schemas/infoAssessment.js';

import { AssessmentQuestionsEditor } from './components/AssessmentEditor.js';
import { InstructorAssessmentQuestionsTableLegacy } from './components/InstructorAssessmentQuestionsTableLegacy.js';
import { serializeZonesForJson } from './utils/dataTransform.js';
import { buildHierarchicalAssessment } from './utils/questions.js';

const router = Router();

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
    if (!res.locals.authz_data.has_course_permission_preview) {
      throw new HttpStatusError(403, 'Access denied (must be course previewer)');
    }

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

    const origHash = (await getOriginalHash(assessmentPath)) ?? '';

    // We use the database instead of the contents on disk as we want to consider the database as the 'source of truth'
    // for doing operations.
    const jsonZones = buildHierarchicalAssessment(res.locals.course, questionRows);

    // Populate zone-level tool overrides from the assessment_tools table.
    const zoneToolRows = await selectZoneToolOverrides({
      assessment_id: res.locals.assessment.id,
    });
    for (const row of zoneToolRows) {
      const zone = jsonZones[row.zone_number - 1];
      zone.tools ??= {};
      zone.tools[row.tool] = { enabled: row.enabled };
    }

    // Load assessment-level tool defaults for zone inheritance display.
    const assessmentToolDefaultRows = await selectAssessmentToolDefaults({
      assessment_id: res.locals.assessment.id,
    });
    const assessmentToolDefaults: Partial<Record<EnumAssessmentTool, boolean>> = {};
    for (const row of assessmentToolDefaultRows) {
      assessmentToolDefaults[row.tool] = row.enabled;
    }

    const questionSharingEnabled = await features.enabledFromLocals('question-sharing', res.locals);
    const consumePublicQuestionsEnabled = await features.enabledFromLocals(
      'consume-public-questions',
      res.locals,
    );
    const showEditor = req.query.view !== 'legacy';

    const pageContext = extractPageContext(res.locals, {
      pageType: 'assessment',
      accessType: 'instructor',
    });

    const canEdit =
      pageContext.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: getAssessmentTrpcUrl({
          courseInstanceId: res.locals.course_instance.id,
          assessmentId: res.locals.assessment.id,
        }),
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );

    const search = getUrl(req).search;

    // Build toggle link that adds/removes the `view=legacy` query parameter.
    const toggleUrl = (() => {
      const url = getUrl(req);
      const params = new URLSearchParams(url.search);
      if (showEditor) {
        params.set('view', 'legacy');
      } else {
        params.delete('view');
      }
      const qs = params.toString();
      return `${url.pathname}${qs ? `?${qs}` : ''}`;
    })();

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Questions',
        headContent: [
          compiledScriptTag('instructorAssessmentQuestionsClient.ts'),
          compiledStylesheetTag('splitPane.css'),
          compiledStylesheetTag('instructorAssessmentQuestions.css'),
        ],
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'questions',
        },
        options: {
          fullWidth: true,
          contentPadding: !showEditor,
        },
        content: (
          <Hydrate>
            {showEditor ? (
              <AssessmentQuestionsEditor
                course={pageContext.course}
                courseInstance={pageContext.course_instance}
                questionRows={questionRows}
                jsonZones={jsonZones}
                assessment={pageContext.assessment}
                assessmentToolDefaults={assessmentToolDefaults}
                hasCoursePermissionPreview={pageContext.authz_data.has_course_permission_preview}
                hasCourseInstancePermissionEdit={
                  pageContext.authz_data.has_course_instance_permission_edit ?? false
                }
                canEdit={canEdit}
                csrfToken={res.locals.__csrf_token}
                origHash={origHash}
                trpcCsrfToken={trpcCsrfToken}
                search={search}
                switchViewUrl={toggleUrl}
                questionSharingEnabled={questionSharingEnabled}
                consumePublicQuestionsEnabled={consumePublicQuestionsEnabled}
              />
            ) : (
              <InstructorAssessmentQuestionsTableLegacy
                course={pageContext.course}
                questionRows={questionRows}
                urlPrefix={pageContext.urlPrefix}
                assessmentType={pageContext.assessment.type}
                assessmentSetName={pageContext.assessment_set.name}
                assessmentNumber={pageContext.assessment.number}
                hasCoursePermissionPreview={pageContext.authz_data.has_course_permission_preview}
                hasCourseInstancePermissionEdit={
                  pageContext.authz_data.has_course_instance_permission_edit ?? false
                }
                csrfToken={res.locals.__csrf_token}
                switchViewUrl={toggleUrl}
              />
            )}
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'reset_question_variants') {
      if (!res.locals.authz_data.has_course_instance_permission_edit) {
        throw new HttpStatusError(403, 'Access denied (must be course instance editor)');
      }

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
      if (!res.locals.authz_data.has_course_permission_edit) {
        throw new HttpStatusError(403, 'Access denied (must be course editor)');
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
      const filteredZones = serializeZonesForJson(body.zones);

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
