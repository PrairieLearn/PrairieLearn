import { Modal } from 'bootstrap';

import { parseHTMLElement } from '@prairielearn/browser-utils';
import type { HtmlSafeString } from '@prairielearn/html';

import { CopyQuestionModal } from '../../components/CopyQuestionModal.js';
import { SubmissionInfoModal } from '../../components/SubmissionInfoModal.js';
import type { QuestionDialogData } from '../question-dialogs.types.js';
import type { SubmissionInfo } from '../submission-info.js';

import { copyContentModal } from './copy-content.js';

export function createQuestionDialogs(document: Document, data: QuestionDialogData) {
  const submissions = new Map(data.submissions.map((info) => [info.id, info]));
  let active:
    | {
        modal: Modal;
        element: HTMLElement;
        closed: Promise<void>;
        submissionId?: string;
      }
    | undefined;

  function show(markup: HtmlSafeString, submissionId?: string): Promise<void> {
    if (active) return active.closed;
    const root = parseHTMLElement(document, markup.toString());
    const element = root.querySelector<HTMLElement>('.modal')!;
    // These dialogs can be disposed with their view even while opening or closing.
    element.classList.remove('fade');
    document.body.append(root);
    if (root.matches('.js-copy-question-form')) {
      copyContentModal(root as HTMLFormElement);
    }
    const modal = new Modal(element);
    const closed = new Promise<void>((resolve) => {
      element.addEventListener(
        'hidden.bs.modal',
        () => {
          modal.dispose();
          root.remove();
          active = undefined;
          resolve();
        },
        { once: true },
      );
    });
    active = { modal, element, closed, submissionId };
    modal.show();
    return closed;
  }

  return {
    openCopyQuestion() {
      if (!data.copyQuestion) throw new Error('Question copying is unavailable');
      return show(CopyQuestionModal(data.copyQuestion));
    },
    openSubmissionInfo({ submissionId }: { submissionId: string }) {
      const info = submissions.get(submissionId);
      if (!info) throw new Error('Unknown submission');
      return show(SubmissionInfoModal(info), submissionId);
    },
    updateSubmissionInfo(info: SubmissionInfo) {
      submissions.set(info.id, info);
      if (active?.submissionId === info.id) {
        const updated = parseHTMLElement(document, SubmissionInfoModal(info).toString());
        active.element
          .querySelector('.modal-body')!
          .replaceWith(updated.querySelector('.modal-body')!);
        active.modal.handleUpdate();
      }
    },
    dispose() {
      active?.modal.hide();
      submissions.clear();
    },
  };
}
