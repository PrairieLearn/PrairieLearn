import { observe } from 'selector-observer';
import { type Socket, io } from 'socket.io-client';

import { decodeData, onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

import { mathjaxTypeset } from '../../src/lib/client/mathjax.js';
import type {
  StatusMessage,
  StatusMessageSubmission,
} from '../../src/lib/externalGradingSocket.types.js';
import type { SubmissionPanels } from '../../src/lib/question-render.types.js';
import type { GradingJobStatus } from '../../src/models/grading-job.js';

import { confirmOnUnload } from './lib/confirmOnUnload.js';
import { copyContentModal } from './lib/copyContent.js';
import { setupCountdown } from './lib/countdown.js';

// We use `selector-observer` throughout this file to handle the case of
// updating the page's contents without reloading the whole page. At the
// time of writing, this was used on the AI question generation editor page.
//
// Note: DOM event listeners on child elements of the container are
// automatically garbage collected when the container is removed from the DOM,
// so some of these observers don't need explicit cleanup logic.
onDocumentReady(() => {
  observe('.question-container', {
    constructor: HTMLDivElement,
    initialize(container) {
      void mathjaxTypeset([container]);
      initializeReadmeExpansion(container);
      setupDisableOnSubmit(container);

      if (container.dataset.gradingMethod === 'External') {
        const externalGrading = initializeExternalGrading({ container });
        return { remove: () => externalGrading?.close() };
      }
    },
  });

  observe('.question-container .js-submission-body.render-pending', {
    constructor: HTMLDivElement,
    initialize(panel) {
      const container = panel.closest<HTMLElement>('.question-container')!;
      const abortController = new AbortController();

      panel.addEventListener('show.bs.collapse', () => {
        loadPendingSubmissionPanel({
          container,
          panel,
          includeScorePanels: false,
          signal: abortController.signal,
        });
      });

      return { remove: () => abortController.abort() };
    },
  });

  observe('.question-container form.question-form', {
    constructor: HTMLFormElement,
    initialize(form) {
      const cleanup = confirmOnUnload(form);
      return { remove: () => cleanup() };
    },
  });

  observe('.question-container .js-copy-question-form', {
    constructor: HTMLFormElement,
    add(copyQuestionForm) {
      copyContentModal(copyQuestionForm);
    },
  });

  // Disable links after click to prevent double-clicks.
  observe('.question-container a.disable-on-click', {
    constructor: HTMLAnchorElement,
    add(link) {
      link.addEventListener('click', () => link.classList.add('disabled'));
    },
  });

  // Set up countdown timer for grade rate limiting.
  //
  // Note: we currently only support a single question container on a page at a time.
  // If we ever need to support multiple containers, we'll need to stop using IDs for
  // elements like `#submission-suspended-data` and `#submission-suspended-display`.
  observe('#submission-suspended-data', {
    constructor: HTMLElement,
    initialize(element) {
      const container = element.closest('.question-container');
      const abortController = new AbortController();

      const countdownData = decodeData<{
        serverTimeLimitMS: number;
        serverRemainingMS: number;
      }>('submission-suspended-data');

      setupCountdown({
        displaySelector: '#submission-suspended-display',
        progressSelector: '#submission-suspended-progress',
        initialServerRemainingMS: countdownData.serverRemainingMS,
        initialServerTimeLimitMS: countdownData.serverTimeLimitMS,
        signal: abortController.signal,
        onTimerOut: () => {
          container
            ?.querySelectorAll<HTMLButtonElement>('.question-grade')
            .forEach((gradeButton) => {
              gradeButton.disabled = false;
            });
          container
            ?.querySelectorAll<HTMLElement>('.submission-suspended-msg, .grade-rate-limit-popover')
            .forEach((elem) => {
              elem.style.display = 'none';
            });
        },
      });

      return { remove: () => abortController.abort() };
    },
  });
});

function initializeExternalGrading({ container }: { container: HTMLElement }) {
  const abortController = new AbortController();
  const { variantId, variantToken } = container.dataset;

  // Render initial grading states into the DOM
  let gradingPending = false;
  for (const elem of container.querySelectorAll<HTMLElement>('[id^=submission-]')) {
    // Ensure that this is a valid submission element
    if (!/^submission-\d+$/.test(elem.id)) continue;

    const status = elem.dataset.gradingJobStatus as GradingJobStatus;
    const submissionId = elem.id.replace('submission-', '');
    updateStatus(container, { id: submissionId, grading_job_status: status });
    // Grading is not pending if it's done, or it's save-only, or has been canceled
    if (status !== 'graded' && status !== 'none' && status !== 'canceled') {
      gradingPending = true;
    }
  }

  // If everything has been graded or was canceled, don't even open a socket
  if (!gradingPending) return;

  const socket = io('/external-grading');
  socket.emit(
    'init',
    { variant_id: variantId, variant_token: variantToken },
    (msg: StatusMessage) =>
      handleStatusChange({ container, socket, msg, signal: abortController.signal }),
  );
  socket.on('change:status', (msg: StatusMessage) =>
    handleStatusChange({ container, socket, msg, signal: abortController.signal }),
  );

  return {
    close: () => {
      socket.close();
      abortController.abort();
    },
  };
}

function initializeReadmeExpansion(container: HTMLElement): void {
  const markdownBody = container.querySelector<HTMLDivElement>('.markdown-body');
  const revealFade = container.querySelector<HTMLDivElement>('.reveal-fade');
  const expandButtonContainer = container.querySelector('.js-expand-button-container');
  const expandButton = expandButtonContainer?.querySelector('button');

  if (!markdownBody || !expandButton) return;

  let expanded = false;

  expandButton.addEventListener('click', () => {
    expanded = !expanded;
    expandButton.textContent = expanded ? 'Collapse' : 'Expand';
    revealFade?.classList.toggle('d-none');
    markdownBody.classList.toggle('max-height');
  });

  if (markdownBody.scrollHeight > 150) {
    markdownBody.classList.add('max-height');
    revealFade?.classList.remove('d-none');
    expandButtonContainer?.classList.remove('d-none');
    expandButtonContainer?.classList.add('d-flex');
  }
}

function handleStatusChange({
  container,
  socket,
  msg,
  signal,
}: {
  container: HTMLElement;
  socket: Socket;
  msg: StatusMessage;
  signal: AbortSignal;
}): void {
  msg.submissions.forEach((submission) => {
    // Always update results
    updateStatus(container, submission);

    if (submission.grading_job_status === 'graded') {
      const element = container.querySelector<HTMLElement>('#submission-' + submission.id);

      if (!element) return;

      // Check if this state is reflected in the DOM; it's possible this is
      // just a message from the initial data sync and that we already have
      // results in the DOM.
      const status = element.dataset.gradingJobStatus;
      const gradingJobId = element.dataset.gradingJobId;

      // Ignore jobs that we already have results for, but allow results
      // from more recent grading jobs to replace the existing ones.
      if (status !== 'graded' || gradingJobId !== submission.grading_job_id) {
        // Let's get results for this job!
        fetchResults({ container, submissionId: submission.id, signal });

        // We don't need the socket anymore.
        socket.close();
      }
    }
  });
}

function fetchResults({
  container,
  submissionId,
  signal,
}: {
  container: HTMLElement;
  submissionId: string;
  signal: AbortSignal;
}): void {
  window.bootstrap.Modal.getInstance(`#submissionInfoModal-${submissionId}`)?.hide();

  const submissionPanel = container.querySelector<HTMLElement>(`#submission-${submissionId}`);
  if (!submissionPanel) return;

  const submissionBody = submissionPanel.querySelector<HTMLDivElement>('.js-submission-body');
  if (!submissionBody) return;

  loadPendingSubmissionPanel({
    container,
    panel: submissionBody,
    includeScorePanels: true,
    signal,
  });
}

function updateDynamicPanels({
  container,
  msg,
  submissionId,
}: {
  container: HTMLElement;
  msg: SubmissionPanels;
  submissionId: string;
}): void {
  if (msg.extraHeadersHtml) {
    const parser = new DOMParser();
    const headers = parser.parseFromString(msg.extraHeadersHtml, 'text/html');

    const newImportMap = headers.querySelector<HTMLScriptElement>('script[type="importmap"]');
    if (newImportMap != null) {
      const currentImportMap = document.head.querySelector<HTMLScriptElement>(
        'script[type="importmap"]',
      );
      if (!currentImportMap) {
        document.head.append(newImportMap);
      } else {
        // This case is not currently possible with existing importmap
        // functionality. Once an existing importmap has been created, the
        // importmap cannot be modified. Once this functionality exists this
        // code can be modified to update the importmap.
        // https://html.spec.whatwg.org/multipage/webappapis.html#import-map-processing-model
        const newImportMapJson = JSON.parse(newImportMap.textContent || '{}');
        const currentImportMapJson = JSON.parse(currentImportMap.textContent || '{}');
        const newImportMapKeys = Object.keys(newImportMapJson.imports || {}).filter(
          (key) => !(key in currentImportMapJson.imports),
        );
        if (newImportMapKeys.length > 0) {
          console.warn(
            'Cannot update importmap. New importmap has imports not in current importmap:',
            newImportMapKeys,
          );
        }
      }
    }

    const currentLinks = new Set(
      Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).map(
        (link) => link.href,
      ),
    );
    headers.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((header) => {
      if (!currentLinks.has(header.href)) {
        document.head.append(header);
      }
    });

    const currentScripts = new Set(
      Array.from(
        document.head.querySelectorAll<HTMLScriptElement>('script[type="text/javascript"]'),
      ).map((script) => script.src),
    );
    headers
      .querySelectorAll<HTMLScriptElement>('script[type="text/javascript"]')
      .forEach((header) => {
        if (!currentScripts.has(header.src)) {
          document.head.append(header);
        }
      });
  }

  if (msg.answerPanel) {
    const answerContainer = container.querySelector('.answer-body');
    if (answerContainer) {
      // Using jQuery here because msg.answerPanel may contain scripts that
      // must be executed. Typical vanilla JS alternatives don't support
      // this kind of script.
      $(answerContainer).html(msg.answerPanel);
      void mathjaxTypeset([answerContainer]);
      answerContainer.closest('.grading-block')?.classList.remove('d-none');
    }
  }

  if (msg.submissionPanel) {
    const submissionPanelSelector = `#submission-${submissionId}`;
    const submissionPanelElement = container.querySelector(submissionPanelSelector);
    // Using jQuery here because msg.submissionPanel may contain scripts
    // that must be executed. Typical vanilla JS alternatives don't support
    // this kind of script.
    if (submissionPanelElement) {
      $(submissionPanelElement).replaceWith(msg.submissionPanel);
      const updatedSubmissionPanelElement = container.querySelector(submissionPanelSelector);
      if (updatedSubmissionPanelElement) {
        void mathjaxTypeset([updatedSubmissionPanelElement]);
      }
    }
  }

  if (msg.questionScorePanel) {
    const parsedHTML = parseHTMLElement(document, msg.questionScorePanel);

    // We might be getting new markup for just the content, or legacy markup
    // for the whole panel.
    //
    // TODO: switch back to using a specific ID once we drop the legacy markup.
    // Using a specific ID ensures we can find things easily via grep.
    //
    // Note: we use `document` and not `container` here because the question
    // score panel is outside the question container.
    const targetElement = document.getElementById(parsedHTML.id);
    targetElement?.replaceWith(parsedHTML);
  }

  if (msg.assessmentScorePanel) {
    // Note: we use `document` and not `container` here because the assessment
    // score panel is outside the question container.
    const assessmentScorePanel = document.getElementById('assessment-score-panel');
    if (assessmentScorePanel) {
      assessmentScorePanel.outerHTML = msg.assessmentScorePanel;
    }
  }

  if (msg.questionPanelFooter) {
    const parsedHTML = parseHTMLElement(document, msg.questionPanelFooter);

    // We might be getting new markup for just the content, or legacy markup
    // for the whole panel.
    //
    // TODO: switch back to using a specific ID once we drop the legacy markup.
    // Using a specific ID ensures we can find things easily via grep.
    const targetElement = container.querySelector(`#${parsedHTML.id}`);
    targetElement?.replaceWith(parsedHTML);
  }

  if (msg.questionNavNextButton) {
    // Note: we use `document` and not `container` here because this button
    // is outside the question container.
    const questionNavNextButton = document.getElementById('question-nav-next');
    if (questionNavNextButton) {
      questionNavNextButton.outerHTML = msg.questionNavNextButton;
    }
  }
}

function updateStatus(
  container: HTMLElement,
  submission: Omit<StatusMessageSubmission, 'grading_job_id'>,
): void {
  const display = container.querySelector('#grading-status-' + submission.id);
  if (!display) return;
  let label;
  const spinner = '<i class="fa fa-sync fa-spin"></i>';
  switch (submission.grading_job_status) {
    case 'requested':
      label = 'Grading requested ' + spinner;
      break;
    case 'queued':
      label = 'Queued for grading ' + spinner;
      break;
    case 'grading':
      label = 'Grading in progress ' + spinner;
      break;
    case 'graded':
      label = 'Graded!';
      break;
    default:
      label = 'UNKNOWN STATUS';
      break;
  }
  display.innerHTML = label;
}

function loadPendingSubmissionPanel({
  container,
  panel,
  includeScorePanels,
  signal,
}: {
  container: HTMLElement;
  panel: HTMLDivElement;
  includeScorePanels: boolean;
  signal: AbortSignal;
}): void {
  const { submissionId, dynamicRenderUrl } = panel.dataset;
  if (submissionId == null || dynamicRenderUrl == null) return;

  const url = new URL(dynamicRenderUrl, window.location.origin);

  if (includeScorePanels) {
    url.searchParams.set('render_score_panels', 'true');
  }

  fetch(url, { signal })
    .then(async (response) => {
      // If the response is not a 200, delegate to the error handler (catch block)
      if (!response.ok) throw new Error('Failed to fetch submission');
      const msg = await response.json();
      updateDynamicPanels({ container, msg, submissionId });
    })
    .catch((err) => {
      // Don't show error if the request was aborted
      if (err.name === 'AbortError') return;

      panel.innerHTML = '<div class="card-body submission-body">Error retrieving submission</div>';
    });
}

function setupDisableOnSubmit(container: HTMLElement): void {
  const form = container.querySelector<HTMLFormElement>('form.question-form');

  if (!form) return;

  form.addEventListener('submit', () => {
    if (!form.dataset.submitted) {
      form.dataset.submitted = 'true';

      // Since `.disabled` buttons don't POST, clone and hide as workaround
      form.querySelectorAll<HTMLButtonElement>('.disable-on-submit').forEach((element) => {
        // Create disabled clone of button
        const clonedElement = element.cloneNode(true) as HTMLButtonElement;
        clonedElement.id = '';
        clonedElement.disabled = true;

        // Add it to the same position
        element.parentNode?.insertBefore(clonedElement, element);

        // Hide actual submit button
        element.style.display = 'none';
      });
    }
  });
}
