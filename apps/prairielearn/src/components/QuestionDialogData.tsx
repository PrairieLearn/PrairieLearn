import { EncodedData } from '@prairielearn/browser-utils';

import type { CopyTarget } from '../lib/copy-content.js';
import type { QuestionDialogData as DialogData } from '../lib/question-dialogs.types.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';
import { getSubmissionInfo } from '../lib/submission-info.js';

import type { SubmissionForRender } from './SubmissionPanel.js';

/** Application data kept outside the question document, including copy credentials. */
export function QuestionDialogData({
  resLocals,
  questionCopyTargets = null,
}: {
  resLocals: UntypedResLocals;
  questionCopyTargets?: CopyTarget[] | null;
}) {
  return EncodedData<DialogData>(
    {
      copyQuestion:
        questionCopyTargets == null
          ? null
          : {
              questionId: resLocals.question.id,
              courseId: resLocals.course.id,
              targets: questionCopyTargets,
            },
      submissions: resLocals.submissions.map((submission: SubmissionForRender) =>
        getSubmissionInfo({
          submission,
          courseId: resLocals.question.course_id,
          courseInstanceId: resLocals.course_instance?.id,
          timezone:
            resLocals.course_instance?.display_timezone || resLocals.course.display_timezone,
        }),
      ),
    },
    `question-dialog-data-${resLocals.variant.id}`,
  );
}
