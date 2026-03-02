import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { Router } from 'express';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { Lti13Claim } from '../../ee/lib/lti13.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { handleTrpcError } from '../../lib/trpc.js';

import { RequestCourse } from './instructorRequestCourse.html.js';
import {
  CourseRequestRowSchema,
  type Lti13CourseRequestInput,
} from './instructorRequestCourse.types.js';
import { createContext, instructorRequestCourseRouter } from './utils/trpc.js';

const router = Router();
const sql = loadSqlEquiv(import.meta.url);

router.use(
  '/trpc',
  createExpressMiddleware({
    router: instructorRequestCourseRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const trpcCsrfToken = generatePrefixCsrfToken(
      {
        url: `${res.locals.urlPrefix}/request_course/trpc`,
        authn_user_id: res.locals.authn_user.id,
      },
      config.secretKey,
    );
    const rows = await queryRows(
      sql.get_requests,
      { user_id: res.locals.authn_user.id },
      CourseRequestRowSchema,
    );

    let lti13Info: Lti13CourseRequestInput = null;
    if (isEnterprise() && 'lti13_claims' in req.session) {
      try {
        const ltiClaim = new Lti13Claim(req);

        lti13Info = {
          'cr-firstname': ltiClaim.get('given_name') ?? '',
          'cr-lastname': ltiClaim.get('family_name') ?? '',
          'cr-email': ltiClaim.get('email') ?? '',
          'cr-shortname':
            ltiClaim.get(['https://purl.imsglobal.org/spec/lti/claim/context', 'label']) ?? '',
          'cr-title':
            ltiClaim.get(['https://purl.imsglobal.org/spec/lti/claim/context', 'title']) ?? '',
          'cr-institution': res.locals.authn_institution.long_name,
        };
      } catch {
        // If LTI information expired or otherwise errors, don't error here.
        // Continue on like there isn't LTI 1.3 information.
        lti13Info = null;
      }
    }

    res.send(
      PageLayout({
        pageTitle: 'Request a Course',
        resLocals: res.locals,
        navContext: {
          type: 'plain',
          page: 'request_course',
        },
        content: (
          <Hydrate>
            <RequestCourse
              rows={rows}
              lti13Info={lti13Info}
              trpcCsrfToken={trpcCsrfToken}
              urlPrefix={res.locals.urlPrefix}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
