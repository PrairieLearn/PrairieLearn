import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';
import z from 'zod';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/preact/server';
import { run } from '@prairielearn/run';

import { AssessmentOpenInstancesAlert } from '../../../components/AssessmentOpenInstancesAlert.js';
import { PageLayout } from '../../../components/PageLayout.js';
import {
  calculateAiGradingStats,
  fillInstanceQuestionColumnEntries,
} from '../../../ee/lib/ai-grading/ai-grading-stats.js';
import {
  selectAssessmentQuestionHasInstanceQuestionGroups,
  selectInstanceQuestionGroups,
} from '../../../ee/lib/ai-instance-question-grouping/ai-instance-question-grouping-util.js';
import { extractPageContext } from '../../../lib/client/page-context.js';
import {
  StaffInstanceQuestionGroupSchema,
  StaffUserSchema,
} from '../../../lib/client/safe-db-types.js';
import { features } from '../../../lib/features/index.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { getUrl } from '../../../lib/url.js';
import { createAuthzMiddleware } from '../../../middlewares/authzHelper.js';
import { selectCourseInstanceGraderStaff } from '../../../models/course-instances.js';

import { AssessmentQuestionManualGrading } from './AssessmentQuestionManualGrading.html.js';
import { selectInstanceQuestionsForManualGrading } from './queries.js';
import { createContext, manualGradingAssessmentQuestionRouter } from './trpc.js';

const router = Router();

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    const courseStaff = z.array(StaffUserSchema).parse(
      await selectCourseInstanceGraderStaff({
        courseInstance: res.locals.course_instance,
        authzData: res.locals.authz_data,
        requiredRole: ['Student Data Viewer'],
      }),
    );
    const aiGradingEnabled = await features.enabledFromLocals('ai-grading', res.locals);
    const aiGradingModelSelectionEnabled = await features.enabledFromLocals(
      'ai-grading-model-selection',
      res.locals,
    );

    const rubric_data = await manualGrading.selectRubricData({
      assessment_question: res.locals.assessment_question,
    });

    const instanceQuestionGroups = z.array(StaffInstanceQuestionGroupSchema).parse(
      await selectInstanceQuestionGroups({
        assessmentQuestionId: res.locals.assessment_question.id,
      }),
    );

    const unfilledInstanceQuestionInfo = await selectInstanceQuestionsForManualGrading({
      assessment: res.locals.assessment,
      assessment_question: res.locals.assessment_question,
    });

    const instanceQuestionsInfo = await fillInstanceQuestionColumnEntries(
      unfilledInstanceQuestionInfo,
      res.locals.assessment_question,
    );

    const {
      authz_data,
      urlPrefix,
      __csrf_token,
      course_instance,
      course,
      question,
      assessment_question,
      assessment,
      num_open_instances,
      number_in_alternative_group,
    } = extractPageContext(res.locals, {
      pageType: 'assessmentQuestion',
      accessType: 'instructor',
    });
    const hasCourseInstancePermissionEdit = authz_data.has_course_instance_permission_edit ?? false;
    const search = getUrl(req).search;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Manual Grading',
        navContext: {
          type: 'instructor',
          page: 'assessment',
          subPage: 'manual_grading',
        },
        options: {
          fullWidth: true,
          pageNote: `Question ${number_in_alternative_group}`,
        },
        content: (
          <>
            <AssessmentOpenInstancesAlert
              numOpenInstances={num_open_instances}
              assessmentId={assessment.id}
              urlPrefix={urlPrefix}
            />

            <Hydrate>
              <AssessmentQuestionManualGrading
                hasCourseInstancePermissionEdit={hasCourseInstancePermissionEdit}
                search={search}
                instanceQuestionsInfo={instanceQuestionsInfo}
                course={course}
                courseInstance={course_instance}
                urlPrefix={urlPrefix}
                csrfToken={__csrf_token}
                assessment={assessment}
                assessmentQuestion={assessment_question}
                questionQid={question.qid!}
                aiGradingEnabled={aiGradingEnabled}
                aiGradingModelSelectionEnabled={aiGradingModelSelectionEnabled}
                initialAiGradingMode={aiGradingEnabled && assessment_question.ai_grading_mode}
                rubricData={rubric_data}
                instanceQuestionGroups={instanceQuestionGroups}
                courseStaff={courseStaff}
                aiGradingStats={
                  aiGradingEnabled && assessment_question.ai_grading_mode
                    ? await calculateAiGradingStats(assessment_question)
                    : null
                }
                numOpenInstances={num_open_instances}
                isDevMode={process.env.NODE_ENV === 'development'}
                questionTitle={question.title ?? ''}
                questionNumber={Number(number_in_alternative_group)}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.get(
  '/next_ungraded',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_view) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data viewer)');
    }
    if (
      req.query.prior_instance_question_id != null &&
      typeof req.query.prior_instance_question_id !== 'string'
    ) {
      throw new error.HttpStatusError(400, 'prior_instance_question_id must be a single value');
    }

    req.session.skip_graded_submissions = req.session.skip_graded_submissions ?? true;

    const use_instance_question_groups = await run(async () => {
      const aiGradingMode =
        (await features.enabledFromLocals('ai-grading', res.locals)) &&
        res.locals.assessment_question.ai_grading_mode;
      if (!aiGradingMode) {
        return false;
      }
      return await selectAssessmentQuestionHasInstanceQuestionGroups({
        assessmentQuestionId: res.locals.assessment_question.id,
      });
    });

    res.redirect(
      await manualGrading.nextInstanceQuestionUrl({
        urlPrefix: res.locals.urlPrefix,
        assessment_id: res.locals.assessment.id,
        assessment_question_id: res.locals.assessment_question.id,
        user_id: res.locals.authz_data.user.user_id,
        prior_instance_question_id: req.query.prior_instance_question_id ?? null,
        skip_graded_submissions: true,
        use_instance_question_groups,
      }),
    );
  }),
);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: manualGradingAssessmentQuestionRouter,
    createContext,
    // TODO: needs `onError` handler?
  }),
);

router.post(
  '/',
  typedAsyncHandler<'instructor-assessment-question'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_instance_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be a student data editor)');
    }
    // TODO: parse req.body with Zod
    if (req.accepts('html') && req.body.__action !== 'modify_rubric_settings') {
      throw new error.HttpStatusError(406, 'Not Acceptable');
    }

    if (req.body.__action === 'edit_question_points') {
      const result = await manualGrading.updateInstanceQuestionScore(
        res.locals.assessment,
        req.body.instance_question_id,
        null, // submission_id
        req.body.modified_at ? new Date(req.body.modified_at) : null, // check_modified_at
        {
          points: req.body.points,
          manual_points: req.body.manual_points,
          auto_points: req.body.auto_points,
          score_perc: req.body.score_perc,
        },
        res.locals.authn_user.user_id,
      );
      if (result.modified_at_conflict) {
        res.send({
          conflict_grading_job_id: result.grading_job_id,
          conflict_details_url: `${res.locals.urlPrefix}/assessment/${res.locals.assessment.id}/manual_grading/instance_question/${req.body.instance_question_id}?conflict_grading_job_id=${result.grading_job_id}`,
        });
      } else {
        res.sendStatus(204);
      }
    } else if (req.body.__action === 'modify_rubric_settings') {
      try {
        await manualGrading.updateAssessmentQuestionRubric(
          res.locals.assessment,
          res.locals.assessment_question.id,
          req.body.use_rubric,
          req.body.replace_auto_points,
          req.body.starting_points,
          req.body.min_points,
          req.body.max_extra_points,
          req.body.rubric_items,
          req.body.tag_for_manual_grading,
          res.locals.authn_user.user_id,
        );
        res.redirect(req.originalUrl);
      } catch (err) {
        res.status(500).send({ err: String(err) });
      }
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
