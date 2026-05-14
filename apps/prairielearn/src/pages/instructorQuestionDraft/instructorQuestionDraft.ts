import { Router } from 'express';

import { typedAsyncHandler } from '../../lib/res-locals.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'instructor-question'>(async (req, res) => {
    const question = res.locals.question;

    if (!question.draft) {
      res.redirect(`${res.locals.urlPrefix}/question/${question.id}/preview`);
      return;
    }

    res.redirect(
      `${res.locals.urlPrefix}/question/${question.id}/file_edit/questions/${question.qid}/question.html`,
    );
  }),
);

export default router;
