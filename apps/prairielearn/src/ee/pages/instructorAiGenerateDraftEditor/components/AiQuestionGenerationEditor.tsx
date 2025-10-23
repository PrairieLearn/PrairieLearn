import { useState } from 'preact/hooks';

import { type Question } from '../../../../lib/db-types.js';
import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.types.js';

import { AiQuestionGenerationChat } from './AiQuestionGenerationChat.js';
import { FinalizeModal } from './FinalizeModal.js';
import { QuestionAndFilePreview } from './QuestionAndFilePreview.js';

export function AiQuestionGenerationEditor({
  question,
  initialMessages,
  questionFiles,
  richTextEditorEnabled,
  urlPrefix,
  csrfToken,
  chatCsrfToken,
  questionContainerHtml,
  showJobLogsLink,
}: {
  question: Question;
  initialMessages: QuestionGenerationUIMessage[];
  questionFiles: Record<string, string>;
  richTextEditorEnabled: boolean;
  urlPrefix: string;
  csrfToken: string;
  chatCsrfToken: string;
  questionContainerHtml: string;
  showJobLogsLink: boolean;
}) {
  const [showFinalizeModal, setShowFinalizeModal] = useState(false);

  return (
    <div class="app-content">
      <div class="d-flex flex-row align-items-center p-2 bg-light border-bottom app-back shadow-sm z-1">
        <a href={`${urlPrefix}/ai_generate_question_drafts`} class="btn btn-sm btn-ghost">
          <i class="fa fa-arrow-left me-2" aria-hidden="true" />
          Back to AI questions
        </a>
      </div>
      <AiQuestionGenerationChat
        initialMessages={initialMessages}
        questionId={question.id}
        showJobLogsLink={showJobLogsLink}
        urlPrefix={urlPrefix}
        csrfToken={chatCsrfToken}
      />

      <div class="d-flex flex-row align-items-stretch bg-light app-preview-tabs z-1">
        <ul class="nav nav-tabs me-auto ps-2 pt-2">
          <li class="nav-item">
            <a
              class="nav-link active"
              data-bs-toggle="tab"
              aria-current="page"
              href="#question-preview"
            >
              Preview
            </a>
          </li>
          <li class="nav-item">
            <a class="nav-link" data-bs-toggle="tab" href="#question-code">
              Files
            </a>
          </li>
          {richTextEditorEnabled ? (
            <li class="nav-item">
              <a class="nav-link" data-bs-toggle="tab" href="#question-rich-text-editor">
                Rich Text Editor
              </a>
            </li>
          ) : null}
        </ul>
        <div class="d-flex align-items-center justify-content-end flex-grow-1 border-bottom pe-2">
          <button
            type="button"
            class="btn btn-sm btn-primary"
            data-bs-toggle="tooltip"
            data-bs-title="Finalize a question to use it on assessments and make manual edits"
            onClick={() => setShowFinalizeModal(true)}
          >
            <i class="fa fa-check" aria-hidden="true" />
            Finalize question
          </button>
        </div>
      </div>
      <div class="app-preview">
        <QuestionAndFilePreview
          questionFiles={questionFiles}
          richTextEditorEnabled={richTextEditorEnabled}
          questionContainerHtml={questionContainerHtml}
          csrfToken={csrfToken}
        />
      </div>
      <FinalizeModal
        csrfToken={csrfToken}
        show={showFinalizeModal}
        onHide={() => setShowFinalizeModal(false)}
      />
    </div>
  );
}

AiQuestionGenerationEditor.displayName = 'AiQuestionGenerationEditor';
