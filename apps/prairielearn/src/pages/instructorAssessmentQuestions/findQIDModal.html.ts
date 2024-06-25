import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html';
import { QuestionsPage } from '../instructorQuestions/instructorQuestions.html';
import { QuestionsTable } from '../../components/QuestionsTable.html.js';

export function FindQIDModal({}: {}) {
    return Modal({
        id: 'findQIDModal',
        title: 'Find QID',
        body: ${QuestionsTable({
            questions,
            course_instances,
            showAddQuestionButton,
            showSharingSets: resLocals.question_sharing_enabled,
            current_course_instance: resLocals.course_instance,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
          })}
    })
}