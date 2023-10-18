import { io } from 'socket.io-client';
import { onDocumentReady, decodeData } from '@prairielearn/browser-utils';

import { mathjaxTypeset } from './lib/mathjax';
import { setupCountdown } from './lib/countdown';
import { confirmOnUnload } from './lib/confirmOnUnload';

onDocumentReady(() => {
  const { gradingMethod } = document.querySelector<HTMLElement>('.question-container').dataset;
  if (gradingMethod === 'External') {
    externalGradingLiveUpdate();
  }
  setupDynamicObjects();
  confirmOnUnload(document.querySelector('form.question-form'));
  disableOnSubmit();
});

function externalGradingLiveUpdate() {
  const { variantId, variantToken } =
    document.querySelector<HTMLElement>('.question-container').dataset;

  // Render initial grading states into the DOM
  let gradingPending = false;
  document.querySelectorAll('[id^=submission-]').forEach((elem: HTMLElement) => {
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

  socket.emit('init', { variant_id: variantId, variant_token: variantToken }, function (msg) {
    handleStatusChange(socket, msg);
  });

  socket.on('change:status', function (msg) {
    handleStatusChange(socket, msg);
  });
}

function handleStatusChange(socket, msg) {
  msg.submissions.forEach((submission) => {
    // Always update results
    updateStatus(submission);

    if (submission.grading_job_status === 'graded') {
      // Check if this state is reflected in the DOM; it's possible this is
      // just a message from the initial data sync and that we already have
      // results in the DOM.
      const element = document.getElementById('submission-' + submission.id);
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

function fetchResults(socket, submissionId) {
  const {
    variantId,
    questionId,
    instanceQuestionId,
    variantToken,
    urlPrefix,
    questionContext,
    csrfToken,
    authorizedEdit,
  } = document.querySelector<HTMLElement>('.question-container').dataset;

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
      authorized_edit: authorizedEdit,
    },
    function (msg) {
      // We're done with the socket for this incarnation of the page
      socket.close();
      if (msg.answerPanel) {
        const answerContainer = document.querySelector('.answer-body');
        answerContainer.innerHTML = msg.answerPanel;
        answerContainer.closest('.grading-block').classList.remove('d-none');
      }
      if (msg.submissionPanel) {
        // Using jQuery here because msg.submissionPanel may contain scripts
        // that must be executed. Typical vanilla JS alternatives don't support
        // this kind of script.
        $('#submission-' + submissionId).replaceWith(msg.submissionPanel);
        mathjaxTypeset();
        // Restore modal state if need be
        if (wasModalOpen) {
          $('#submissionInfoModal-' + submissionId).modal('show');
        }
      }
      if (msg.questionScorePanel) {
        document.getElementById('question-score-panel').outerHTML = msg.questionScorePanel;
      }
      if (msg.assessmentScorePanel) {
        document.getElementById('assessment-score-panel').outerHTML = msg.assessmentScorePanel;
      }
      if (msg.questionPanelFooter) {
        document.getElementById('question-panel-footer').outerHTML = msg.questionPanelFooter;
      }
      if (msg.questionNavNextButton) {
        document.getElementById('question-nav-next').outerHTML = msg.questionNavNextButton;
      }
      setupDynamicObjects();
    },
  );
}

function updateStatus(submission) {
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
        document.querySelector<HTMLButtonElement>('.question-grade').disabled = false;
        document
          .querySelectorAll<HTMLElement>('.submission-suspended-msg, .grade-rate-limit-popover')
          .forEach((elem) => {
            elem.style.display = 'none';
          });
      },
    });
  }
}

function disableOnSubmit() {
  const form = document.querySelector<HTMLFormElement>('form.question-form');
  form.addEventListener('submit', () => {
    if (!form.dataset.submitted) {
      form.dataset.submitted = 'true';

      // Since `.disabled` buttons don't POST, clone and hide as workaround
      form.querySelectorAll('.disable-on-submit').forEach((element: HTMLButtonElement) => {
        // Create disabled clone of button
        const clonedElement = element.cloneNode(true) as HTMLButtonElement;
        clonedElement.id = '';
        clonedElement.disabled = true;

        // Add it to the same position
        element.parentNode.insertBefore(clonedElement, element);

        // Hide actual submit button
        element.style.display = 'none';
      });
    }
  });
}
