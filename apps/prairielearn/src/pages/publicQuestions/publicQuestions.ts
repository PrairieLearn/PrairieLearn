import { Router } from 'express';

import { PageLayout } from '../../components/PageLayout.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectPublicQuestionsForCourse } from '../../models/questions.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  typedAsyncHandler<'public-course'>(async function (req, res) {
    const questions = await selectPublicQuestionsForCourse(res.locals.course.id);

    // Example course questions can be publicly shared, but we don't allow them to
    // be imported into courses, so we won't show the sharing name in the QID.
    const qidPrefix = res.locals.course.example_course ? '' : `@${res.locals.course.sharing_name}/`;
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
        },
        headContent: QuestionsTableHead(),
        content: QuestionsTable({
          questions,
          showAddQuestionButton: false,
          qidPrefix,
          urlPrefix: res.locals.urlPrefix,
        }),
      }),
    );
  }),
);

export default router;
