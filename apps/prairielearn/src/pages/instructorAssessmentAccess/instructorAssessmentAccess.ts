import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { handleTrpcError } from '../../lib/trpc.js';

import {
  AssessmentAccessRulesSchema,
  InstructorAssessmentAccess,
  InstructorAssessmentAccessNew,
} from './instructorAssessmentAccess.html.js';
import {
  accessControlRouter,
  computeHash,
  createContext,
  fetchAllAccessControlRules,
} from './trpc.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: accessControlRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

router.get(
  '/',
  typedAsyncHandler<'assessment'>(async (req, res) => {
    const assessmentId = res.locals.assessment.id;

    const jsonRules = await fetchAllAccessControlRules(assessmentId);

    if (jsonRules.length > 0) {
      const origHash = computeHash(jsonRules);
      const trpcCsrfToken = generatePrefixCsrfToken(
        {
          url: req.originalUrl.split('?')[0].replace(/\/$/, '') + '/trpc',
          authn_user_id: res.locals.authn_user.id,
        },
        config.secretKey,
      );
      res.send(
        InstructorAssessmentAccessNew({
          resLocals: res.locals,
          origHash,
          trpcCsrfToken,
          initialData: jsonRules,
        }),
      );
    } else {
      const accessRules = await queryRows(
        sql.assessment_access_rules,
        { assessment_id: assessmentId },
        AssessmentAccessRulesSchema,
      );
      res.send(InstructorAssessmentAccess({ resLocals: res.locals, accessRules }));
    }
  }),
);

export default router;
