import asyncHandler from 'express-async-handler';

import { features } from '../../lib/features/index.js';
import { selectQuestionById } from '../../models/question.js';
import { checkPlanGrantsForQuestion } from '../lib/billing/plan-grants.js';

export default function (options = { publicEndpoint: false }) {
  return asyncHandler(async (req, res, next) => {
    const hasPlanGrants = await checkPlanGrantsForQuestion(res);

    let disabledWorkspace = false;
    if (options.publicEndpoint) {
      const disablePublicWorkspaces = await features.enabledFromLocals(
        'disable-public-workspaces',
        res.locals,
      );
      const question = await selectQuestionById(req.params.question_id);

      disabledWorkspace = !!question.workspace_image && disablePublicWorkspaces;
    }

    if (!hasPlanGrants || disabledWorkspace) {
      // TODO: Show a fancier error page explaining what happened and prompting
      // the user to contact their instructor.
      throw new Error('Access denied');
    }

    next();
  });
}
