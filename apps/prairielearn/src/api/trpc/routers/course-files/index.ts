import { router } from '../../trpc.js';

import { createQuestion } from './createQuestion.js';
import { deleteQuestion } from './deleteQuestion.js';
import { updateQuestionFiles } from './updateQuestionFiles.js';

export const courseFilesRouter = router({
  createQuestion,
  updateQuestionFiles,
  deleteQuestion,
});
