import * as trpcExpress from '@trpc/server/adapters/express';
import { Router } from 'express';

import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { SafeQuestionsPageDataSchema } from '../../components/QuestionsTable.shared.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { handleTrpcError } from '../../lib/trpc.js';
import { getUrl } from '../../lib/url.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';

import { PublicQuestionsTable } from './PublicQuestionsTable.js';
import { createContext, publicQuestionsRouter } from './trpc.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'public-course'>(async function (req, res) {
    const rawQuestions = await selectPublicQuestionsForCourse(res.locals.course.id);
    const questions = rawQuestions.map((q) => SafeQuestionsPageDataSchema.parse(q));

    // Example course questions can be publicly shared, but we don't allow them to
    // be imported into courses, so we won't show the sharing name in the QID.
    const qidPrefix = res.locals.course.example_course ? '' : `@${res.locals.course.sharing_name}/`;
    const search = getUrl(req).search;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Public Questions',
        navContext: {
          type: 'public',
          page: 'public_questions',
          subPage: 'questions',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <PublicQuestionsTable
              questions={questions}
              courseInstances={[]}
              showAddQuestionButton={false}
              showAiGenerateQuestionButton={false}
              showSharingSets={false}
              urlPrefix={res.locals.urlPrefix}
              qidPrefix={qidPrefix}
              search={search}
              isDevMode={config.devMode}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.use(
  '/trpc',
  trpcExpress.createExpressMiddleware({
    router: publicQuestionsRouter,
    createContext,
    onError: handleTrpcError,
  }),
);

export default router;
