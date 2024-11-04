import { QuestionModifyEditor } from '../../../../lib/editors.js';
import { privateProcedure } from '../../trpc.js';

export const updateQuestionFiles = privateProcedure.mutation(async () => {
  // TODO: this does not exist yet.
  const editor = new QuestionModifyEditor({
    // TODO: type/populate better?
    locals: {},
    // TODO: pull files from request.
    files: {},
  });

  const serverJob = await editor.prepareServerJob();

  await editor.executeWithServerJob(serverJob);
});
