import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';
import { z } from 'zod';

import { loadSqlEquiv, queryOptionalRow } from '@prairielearn/postgres';

import { RawStaffAssessmentAccessControlSchema } from '../../lib/client/safe-db-types.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { handleTrpcError } from '../../lib/trpc.js';

import {
  AccessControlWithGroupsSchema,
  InstructorAssessmentAccessEdit,
} from './instructorAssessmentAccessEdit.html.js';
import { accessControlRouter, createContext } from './trpc.js';

const router = Router({ mergeParams: true });
const sql = loadSqlEquiv(import.meta.url);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: accessControlRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

const AccessControlQueryResultSchema = z.object({
  access_control: RawStaffAssessmentAccessControlSchema,
  groups: AccessControlWithGroupsSchema.shape.groups,
  individual_targets: AccessControlWithGroupsSchema.shape.individual_targets,
  early_deadlines: AccessControlWithGroupsSchema.shape.early_deadlines,
  late_deadlines: AccessControlWithGroupsSchema.shape.late_deadlines,
  prairietest_exams: AccessControlWithGroupsSchema.shape.prairietest_exams,
});

router.get(
  '/new',
  typedAsyncHandler<'assessment'>(async (_req, res) => {
    res.send(
      InstructorAssessmentAccessEdit({
        resLocals: res.locals,
        accessControl: null,
        isNewMainRule: true,
      }),
    );
  }),
);

router.get(
  '/new-override',
  typedAsyncHandler<'assessment'>(async (_req, res) => {
    res.send(
      InstructorAssessmentAccessEdit({
        resLocals: res.locals,
        accessControl: null,
      }),
    );
  }),
);

router.get(
  '/:rule_id(\\d+)',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const result = await queryOptionalRow(
      sql.select_access_control_with_details,
      {
        rule_id: req.params.rule_id,
        assessment_id: res.locals.assessment.id,
      },
      AccessControlQueryResultSchema,
    );

    if (!result) {
      res.status(404).send('Access control rule not found');
      return;
    }

    const accessControl = {
      ...result.access_control,
      groups: result.groups,
      individual_targets: result.individual_targets,
      early_deadlines: result.early_deadlines,
      late_deadlines: result.late_deadlines,
      prairietest_exams: result.prairietest_exams,
    };

    res.send(
      InstructorAssessmentAccessEdit({
        resLocals: res.locals,
        accessControl,
      }),
    );
  }),
);

export default router;
