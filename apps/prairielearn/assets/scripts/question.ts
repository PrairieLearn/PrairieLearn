import { observe } from 'selector-observer';
import { type Socket, io } from 'socket.io-client';

import { decodeData, parseHTMLElement } from '@prairielearn/browser-utils';

import type {
  StatusMessage,
  StatusMessageSubmission,
} from '../../src/lib/externalGradingSocket.types.js';
import type { SubmissionPanels } from '../../src/lib/question-render.types.js';
import type { GradingJobStatus } from '../../src/models/grading-job.js';

import { confirmOnUnload } from './lib/confirmOnUnload.js';
import { copyContentModal } from './lib/copyContent.js';
import { setupCountdown } from './lib/countdown.js';
import { mathjaxTypeset } from './lib/mathjax.js';

// We use `selector-observer` here to handle the case of updating the page's
// contents without reloading the whole page. At the time of writing, this was
// used on the AI question generation draft editor page.
observe('.question-container', {
  constructor: HTMLDivElement,
  initialize(container) {
    // TODO: is this the correct sequencing of MathJax?
    void mathjaxTypeset([container]);

    // Track resources that need cleanup
    let socket: Socket | null = null;
    const countdownAbortController = new AbortController();

    if (container.dataset.gradingMethod === 'External') {
      socket = externalGradingLiveUpdate();
    }

    const questionForm = container.querySelector<HTMLFormElement>('form.question-form');
    if (questionForm) {
      confirmOnUnload(questionForm);
    }

    const markdownBody = container.querySelector<HTMLDivElement>('.markdown-body');
    const revealFade = container.querySelector<HTMLDivElement>('.reveal-fade');
    const expandButtonContainer = container.querySelector('.js-expand-button-container');
    const expandButton = expandButtonContainer?.querySelector('button');

    let readMeExpanded = false;

    function toggleExpandReadMe() {
      if (!markdownBody || !expandButton) return;
      readMeExpanded = !readMeExpanded;
      expandButton.textContent = readMeExpanded ? 'Collapse' : 'Expand';
      revealFade?.classList.toggle('d-none');
      markdownBody.classList.toggle('max-height');
    }

    expandButton?.addEventListener('click', toggleExpandReadMe);

    if (markdownBody && markdownBody.scrollHeight > 150) {
      markdownBody.classList.add('max-height');
      revealFade?.classList.remove('d-none');
      expandButtonContainer?.classList.remove('d-none');
      expandButtonContainer?.classList.add('d-flex');
    }

    setupDynamicObjects(countdownAbortController.signal);
    disableOnSubmit();

    // Set up observer for pending submission panels within this container
    const submissionPanelObserver = observe('.js-submission-body.render-pending', {
      constructor: HTMLDivElement,
      add(panel) {
        // Only observe panels that are descendants of this container
        if (!container.contains(panel)) return;

        panel.addEventListener('show.bs.collapse', function (this: HTMLDivElement) {
          loadPendingSubmissionPanel(this, false);
        });
      },
    });

    const copyQuestionForm = document.querySelector<HTMLFormElement>('.js-copy-question-form');
    copyContentModal(copyQuestionForm);

    // Return cleanup function
    return {
      remove() {
        // Close socket connection if exists
        socket?.close();

        // Abort countdown timers
        countdownAbortController.abort();

        // Stop observing submission panels
        submissionPanelObserver.abort();

        // Note: DOM event listeners on child elements of the container are
        // automatically garbage collected when the container is removed from the DOM.
        // confirmOnUnload and copyContentModal add listeners to window/form which
        // will be cleaned up on page unload, so we don't manually clean them up here.
      },
    };
  },
});

function externalGradingLiveUpdate(): Socket | null {
  const questionContainer = document.querySelector<HTMLElement>('.question-container');

  if (!questionContainer) return null;

  const { variantId, variantToken } = questionContainer.dataset;

  // Render initial grading states into the DOM
  let gradingPending = false;
  for (const elem of document.querySelectorAll<HTMLElement>('[id^=submission-]')) {
    // Ensure that this is a valid submission element
    if (!/^submission-\d+$/.test(elem.id)) continue;

    const status = elem.dataset.gradingJobStatus as GradingJobStatus;
    const submissionId = elem.id.replace('submission-', '');
    updateStatus({ id: submissionId, grading_job_status: status });
    // Grading is not pending if it's done, or it's save-only, or has been canceled
    if (status !== 'graded' && status !== 'none' && status !== 'canceled') {
      gradingPending = true;
    }
  }

  // If everything has been graded or was canceled, don't even open a socket
  if (!gradingPending) return null;

  // By this point, it's safe to open a socket
  const socket = io('/external-grading');

  socket.emit(
    'init',
    { variant_id: variantId, variant_token: variantToken },
    (msg: StatusMessage) => handleStatusChange(socket, msg),
  );

  socket.on('change:status', (msg: StatusMessage) => handleStatusChange(socket, msg));

  return socket;
}

function handleStatusChange(socket: Socket, msg: StatusMessage) {
  msg.submissions.forEach((submission) => {
    // Always update results
    updateStatus(submission);

    if (submission.grading_job_status === 'graded') {
      const element = document.getElementById('submission-' + submission.id);

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
        fetchResults(submission.id);

        // We don't need the socket anymore.
        socket.close();
      }
    }
  });
}

function fetchResults(submissionId: string) {
  window.bootstrap.Modal.getInstance(`#submissionInfoModal-${submissionId}`)?.hide();

  const submissionPanel = document.getElementById(`submission-${submissionId}`);
  if (!submissionPanel) return;

  const submissionBody = submissionPanel.querySelector<HTMLDivElement>('.js-submission-body');
  if (!submissionBody) return;

  loadPendingSubmissionPanel(submissionBody, true);
}

function updateDynamicPanels(msg: SubmissionPanels, submissionId: string) {
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
    const answerContainer = document.querySelector('.answer-body');
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
    // Using jQuery here because msg.submissionPanel may contain scripts
    // that must be executed. Typical vanilla JS alternatives don't support
    // this kind of script.
    $(submissionPanelSelector).replaceWith(msg.submissionPanel);
    void mathjaxTypeset([document.querySelector(submissionPanelSelector)!]);
  }

  if (msg.questionScorePanel) {
    const parsedHTML = parseHTMLElement(document, msg.questionScorePanel);

    // We might be getting new markup for just the content, or legacy markup
    // for the whole panel.
    //
    // TODO: switch back to using a specific ID once we drop the legacy markup.
    // Using a specific ID ensures we can find things easily via grep.
    const targetElement = document.getElementById(parsedHTML.id);
    targetElement?.replaceWith(parsedHTML);
  }

  if (msg.assessmentScorePanel) {
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
    const targetElement = document.getElementById(parsedHTML.id);
    targetElement?.replaceWith(parsedHTML);
  }

  if (msg.questionNavNextButton) {
    const questionNavNextButton = document.getElementById('question-nav-next');
    if (questionNavNextButton) {
      questionNavNextButton.outerHTML = msg.questionNavNextButton;
    }
  }

  setupDynamicObjects();
}

function updateStatus(submission: Omit<StatusMessageSubmission, 'grading_job_id'>) {
  const display = document.getElementById('grading-status-' + submission.id);
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

function setupDynamicObjects(signal?: AbortSignal): void {
  // Install on page load and reinstall on websocket re-render
  document.querySelectorAll('a.disable-on-click').forEach((link) => {
    link.addEventListener('click', () => {
      link.classList.add('disabled');
    });
  });

  if (document.getElementById('submission-suspended-data')) {
    const countdownData = decodeData<{
      serverTimeLimitMS: number;
      serverRemainingMS: number;
    }>('submission-suspended-data');
    setupCountdown({
      displaySelector: '#submission-suspended-display',
      progressSelector: '#submission-suspended-progress',
      initialServerRemainingMS: countdownData.serverRemainingMS,
      initialServerTimeLimitMS: countdownData.serverTimeLimitMS,
      signal,
      onTimerOut: () => {
        document.querySelectorAll<HTMLButtonElement>('.question-grade').forEach((gradeButton) => {
          gradeButton.disabled = false;
        });
        document
          .querySelectorAll<HTMLElement>('.submission-suspended-msg, .grade-rate-limit-popover')
          .forEach((elem) => {
            elem.style.display = 'none';
          });
      },
    });
  }
}

function loadPendingSubmissionPanel(panel: HTMLDivElement, includeScorePanels: boolean) {
  const { submissionId, dynamicRenderUrl } = panel.dataset;
  if (submissionId == null || dynamicRenderUrl == null) return;

  const url = new URL(dynamicRenderUrl, window.location.origin);

  if (includeScorePanels) {
    url.searchParams.set('render_score_panels', 'true');
  }

  fetch(url)
    .then(async (response) => {
      // If the response is not a 200, delegate to the error handler (catch block)
      if (!response.ok) throw new Error('Failed to fetch submission');
      const msg = await response.json();
      updateDynamicPanels(msg, submissionId);
    })
    .catch(() => {
      panel.innerHTML = '<div class="card-body submission-body">Error retrieving submission</div>';
    });
}

function disableOnSubmit() {
  const form = document.querySelector<HTMLFormElement>('form.question-form');

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
