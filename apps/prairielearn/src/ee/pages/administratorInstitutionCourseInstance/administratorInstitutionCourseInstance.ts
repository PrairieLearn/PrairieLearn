import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../../../lib/config.js';
import { features } from '../../../lib/features/index.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { handleTrpcError } from '../../../lib/trpc.js';
import { selectCourseInstanceById } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { parseDesiredPlanGrants } from '../../lib/billing/components/PlanGrantsEditor.js';
import {
  getPlanGrantsForCourseInstance,
  reconcilePlanGrantsForCourseInstance,
} from '../../lib/billing/plans.js';
import { getInstitution } from '../../lib/institution.js';

import { AdministratorInstitutionCourseInstance } from './administratorInstitutionCourseInstance.html.js';
import { adminCreditPoolRouter, createAdminContext } from './trpc.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

// Mount tRPC for the admin credit pool section.
router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: adminCreditPoolRouter,
    createContext: createAdminContext,
    onError: handleTrpcError,
  }),
);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const course_instance = await selectCourseInstanceById(req.params.course_instance_id);
    const course = await selectCourseById(course_instance.course_id);

    if (course.institution_id !== institution.id) {
      throw new error.HttpStatusError(404, 'Course instance not found in this institution');
    }

    const planGrants = await getPlanGrantsForCourseInstance({
      institution_id: institution.id,
      course_instance_id: course_instance.id,
    });
    const aiGradingEnabled = await features.enabled('ai-grading', {
      institution_id: institution.id,
      course_id: course.id,
      course_instance_id: course_instance.id,
    });

    const trpcCsrfToken = aiGradingEnabled
      ? generatePrefixCsrfToken(
          {
            url: req.originalUrl.split('?')[0] + '/trpc',
            authn_user_id: res.locals.authn_user.id,
          },
          config.secretKey,
        )
      : null;

    res.send(
      AdministratorInstitutionCourseInstance({
        institution,
        course,
        course_instance,
        planGrants,
        aiGradingEnabled,
        trpcCsrfToken,
        maxAddDollars: config.aiGradingCreditPoolMaxAddDollars,
        maxDeductDollars: config.aiGradingCreditPoolMaxDeductDollars,
        resLocals: res.locals,
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const course_instance = await selectCourseInstanceById(req.params.course_instance_id);
    const course = await selectCourseById(course_instance.course_id);
    const institution = await getInstitution(req.params.institution_id);

    if (course.institution_id !== institution.id) {
      throw new error.HttpStatusError(404, 'Course instance not found in this institution');
    }

    if (course_instance.deleted_at != null) {
      throw new error.HttpStatusError(403, 'Cannot modify a deleted course instance');
    }

    if (req.body.__action === 'update_enrollment_limit') {
      await execute(sql.update_enrollment_limit, {
        course_instance_id: course_instance.id,
        enrollment_limit: req.body.enrollment_limit || null,
      });
      flash('success', 'Successfully updated enrollment limit.');
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'update_plans') {
      const desiredPlans = parseDesiredPlanGrants({
        body: req.body,
        // We exclude `basic` from the list of allowed plans because it should
        // only ever be used for student billing for enrollments.
        allowedPlans: ['compute', 'everything'],
      });
      await reconcilePlanGrantsForCourseInstance(
        course_instance.id,
        desiredPlans,
        res.locals.authn_user.id,
      );
      flash('success', 'Successfully updated institution plan grants.');
      res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `Unknown action: ${req.body.__action}`);
    }
  }),
);

export default router;
