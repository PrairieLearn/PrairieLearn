import { router } from '../../trpc.js';

import { batchDeleteQuestions } from './batchDeleteQuestions.js';
import { createQuestion } from './createQuestion.js';
import { getQuestionFiles } from './getQuestionFiles.js';
import { renameQuestion } from './renameQuestion.js';
import { updateQuestionFiles } from './updateQuestionFiles.js';

export const courseFilesRouter = router({
  createQuestion,
  getQuestionFiles,
  updateQuestionFiles,
  batchDeleteQuestions,
  renameQuestion,
});
