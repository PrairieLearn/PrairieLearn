import { Socket, io } from 'socket.io-client';

import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

import { confirmOnUnload } from './lib/confirmOnUnload.js';
import { setupCountdown } from './lib/countdown.js';
import { mathjaxTypeset } from './lib/mathjax.js';

onDocumentReady(() => {
  const questionContainer = document.querySelector<HTMLElement>('.question-container');
  if (questionContainer?.dataset.gradingMethod === 'External') {
    externalGradingLiveUpdate();
  }

  const questionForm = document.querySelector<HTMLFormElement>('form.question-form');
  if (questionForm) {
    confirmOnUnload(questionForm);
  }

  setupDynamicObjects();
  disableOnSubmit();

  $('.js-submission-body.render-pending').on('show.bs.collapse', loadPendingSubmissionPanel);
});

function externalGradingLiveUpdate() {
  const questionContainer = document.querySelector<HTMLElement>('.question-container');

  if (!questionContainer) return;

  const { variantId, variantToken } = questionContainer.dataset;

  // Render initial grading states into the DOM
  let gradingPending = false;
  document.querySelectorAll<HTMLElement>('[id^=submission-]').forEach((elem) => {
    // Ensure that this is a valid submission element
    if (!/^submission-\d+$/.test(elem.id)) return;

    const status = elem.dataset.gradingJobStatus;
    const submissionId = elem.id.replace('submission-', '');
    updateStatus({ id: submissionId, grading_job_status: status });
    // Grading is not pending if it's done, or it's save-only, or has been canceled
    if (status !== 'graded' && status !== 'none' && status !== 'canceled') {
      gradingPending = true;
    }
  });

  // If everything has been graded or was canceled, don't even open a socket
  if (!gradingPending) return;

  // By this point, it's safe to open a socket
  const socket = io('/external-grading');

  socket.emit('init', { variant_id: variantId, variant_token: variantToken }, function (msg: any) {
    handleStatusChange(socket, msg);
  });

  socket.on('change:status', function (msg) {
    handleStatusChange(socket, msg);
  });
}

function handleStatusChange(socket: Socket, msg: any) {
  msg.submissions.forEach((submission: any) => {
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
        fetchResults(socket, submission.id);
      }
    }
  });
}

function fetchResults(socket: Socket, submissionId: string) {
  const questionContainer = document.querySelector<HTMLElement>('.question-container');

  if (!questionContainer) return;

  const {
    variantId,
    questionId,
    instanceQuestionId,
    variantToken,
    urlPrefix,
    questionContext,
    csrfToken,
    authorizedEdit,
  } = questionContainer.dataset;

  const modal = $('#submissionInfoModal-' + submissionId);
  const wasModalOpen = (modal.data('bs.modal') || {})._isShown;
  modal.modal('hide');

  socket.emit(
    'getResults',
    {
      question_id: questionId,
      instance_question_id: instanceQuestionId === '' ? null : instanceQuestionId,
      variant_id: variantId,
      variant_token: variantToken,
      submission_id: submissionId,
      url_prefix: urlPrefix,
      question_context: questionContext,
      csrf_token: csrfToken,
      // Indicates whether submissions are allowed, either because
      // the instance question is part of the current user's
      // assessment instance (authorized_edit==true) or because the
      // question is open in preview mode (authz_result==undefined)
      authorized_edit: authorizedEdit === 'true',
    },
    function (msg: any) {
      // We're done with the socket for this incarnation of the page
      socket.close();
      if (msg) {
        updateDynamicPanels(msg, submissionId);
      } else {
        console.error(`Error retrieving results for submission ${submissionId}`);
      }
      // Restore modal state if need be
      if (wasModalOpen) {
        $('#submissionInfoModal-' + submissionId).modal('show');
      }
    },
  );
}

function updateDynamicPanels(msg: any, submissionId: string) {
  if (msg.extraHeadersHtml) {
    const parser = new DOMParser();
    const headers = parser.parseFromString(msg.extraHeadersHtml, 'text/html');

    const newImportMap = headers.querySelector<HTMLScriptElement>('script[type="importmap"]');
    if (newImportMap != null) {
      const currentImportMap = document.head.querySelector<HTMLScriptElement>(
        'script[type="importmap"]',
      );
      if (!currentImportMap) {
        document.head.appendChild(newImportMap);
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
            'Cannot update importmap. New importmap has imports not in current importmap: ',
            newImportMapKeys,
          );
        }
      }
    }

    const currentLinks = Array.from(
      document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'),
    ).map((link) => link.href);
    headers.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((header) => {
      if (!currentLinks.includes(header.href)) {
        document.head.appendChild(header);
      }
    });

    const currentScripts = Array.from(
      document.head.querySelectorAll<HTMLScriptElement>('script[type="text/javascript"]'),
    ).map((script) => script.src);
    headers
      .querySelectorAll<HTMLScriptElement>('script[type="text/javascript"]')
      .forEach((header) => {
        if (!currentScripts.includes(header.src)) {
          document.head.appendChild(header);
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
      mathjaxTypeset();
      answerContainer.closest('.grading-block')?.classList.remove('d-none');
    }
  }

  if (msg.submissionPanel) {
    // Using jQuery here because msg.submissionPanel may contain scripts
    // that must be executed. Typical vanilla JS alternatives don't support
    // this kind of script.
    $('#submission-' + submissionId).replaceWith(msg.submissionPanel);
    mathjaxTypeset();
  }
  if (msg.questionScorePanel) {
    const questionScorePanel = document.getElementById('question-score-panel');
    if (questionScorePanel) {
      questionScorePanel.outerHTML = msg.questionScorePanel;
    }
  }
  if (msg.assessmentScorePanel) {
    const assessmentScorePanel = document.getElementById('assessment-score-panel');
    if (assessmentScorePanel) {
      assessmentScorePanel.outerHTML = msg.assessmentScorePanel;
    }
  }
  if (msg.questionPanelFooter) {
    const questionPanelFooter = document.getElementById('question-panel-footer');
    if (questionPanelFooter) {
      questionPanelFooter.outerHTML = msg.questionPanelFooter;
    }
  }
  if (msg.questionNavNextButton) {
    const questionNavNextButton = document.getElementById('question-nav-next');
    if (questionNavNextButton) {
      questionNavNextButton.outerHTML = msg.questionNavNextButton;
    }
  }
  setupDynamicObjects();
}

function updateStatus(submission: any) {
  const display = document.getElementById('grading-status-' + submission.id);
  if (!display) return;
  let label;
  const spinner = '<i class="fa fa-sync fa-spin fa-fw"></i>';
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

function setupDynamicObjects() {
  // Install on page load and reinstall on websocket re-render
  document.querySelectorAll('a.disable-on-click').forEach((link) => {
    link.addEventListener('click', () => {
      link.classList.add('disabled');
    });
  });
  // Enable popover
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });

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

function loadPendingSubmissionPanel(this: HTMLDivElement) {
  const { submissionId, dynamicRenderUrl } = this.dataset;
  if (submissionId == null || dynamicRenderUrl == null) return;

  fetch(dynamicRenderUrl)
    .then(async (response) => {
      // If the response is not a 200, delegate to the error handler (catch block)
      if (!response.ok) throw new Error('Failed to fetch submission');
      const msg = await response.json();
      updateDynamicPanels(msg, submissionId);
    })
    .catch(() => {
      const container = document.querySelector(`#submission-${submissionId}-body`);
      if (container != null) {
        container.innerHTML =
          '<div class="card-body submission-body">Error retrieving submission</div>';
      }
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
