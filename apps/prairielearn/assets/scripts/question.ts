import { type Observer, observe } from 'selector-observer';
import { type Socket, io } from 'socket.io-client';

import { decodeData, onDocumentReady, parseHTMLElement } from '@prairielearn/browser-utils';

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

onDocumentReady(() => {
  // We use `selector-observer` here to handle the case of updating the page's
  // contents without reloading the whole page. At the time of writing, this was
  // used on the AI question generation draft editor page.
  //
  // Note: we currently only support a single question container on a page at a time.
  // If we ever need to support multiple containers, we'll need to stop using IDs for
  // elements like `#submission-suspended-data` and `#submission-suspended-display`.
  observe('.question-container', {
    constructor: HTMLDivElement,
    initialize(container) {
      const controller = new QuestionContainerController(container);
      return { remove: () => controller.cleanup() };
    },
  });

  // Disable links after click to prevent double-clicks
  observe('.question-container a.disable-on-click', {
    constructor: HTMLAnchorElement,
    add(link) {
      link.addEventListener('click', () => link.classList.add('disabled'));
    },
  });

  // Set up countdown timer for grade rate limiting
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

class QuestionContainerController {
  private socket: Socket | null = null;
  private abortController = new AbortController();
  private submissionPanelObserver: Observer | null = null;

  constructor(private container: HTMLElement) {
    // TODO: is this the correct sequencing of MathJax?
    void mathjaxTypeset([this.container]);

    if (this.container.dataset.gradingMethod === 'External') {
      this.initializeExternalGrading();
    }

    const questionForm = this.container.querySelector<HTMLFormElement>('form.question-form');
    if (questionForm) {
      confirmOnUnload(questionForm);
    }

    this.initializeReadmeExpansion();
    this.setupDisableOnSubmit();
    this.initializeSubmissionPanelObserver();

    const copyQuestionForm =
      this.container.querySelector<HTMLFormElement>('.js-copy-question-form');
    copyContentModal(copyQuestionForm);
  }

  private get signal(): AbortSignal {
    return this.abortController.signal;
  }

  cleanup(): void {
    this.socket?.close();
    this.abortController.abort();
    this.submissionPanelObserver?.abort();
    // Note: DOM event listeners on child elements of the container are
    // automatically garbage collected when the container is removed from the DOM.
    // confirmOnUnload and copyContentModal add listeners to window/form which
    // will be cleaned up on page unload, so we don't manually clean them up here.
  }

  private initializeReadmeExpansion(): void {
    const markdownBody = this.container.querySelector<HTMLDivElement>('.markdown-body');
    const revealFade = this.container.querySelector<HTMLDivElement>('.reveal-fade');
    const expandButtonContainer = this.container.querySelector('.js-expand-button-container');
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

  private initializeSubmissionPanelObserver(): void {
    this.submissionPanelObserver = observe('.js-submission-body.render-pending', {
      constructor: HTMLDivElement,
      add: (panel) => {
        // Only observe panels that are descendants of this container
        if (!this.container.contains(panel)) return;

        panel.addEventListener('show.bs.collapse', () => {
          this.loadPendingSubmissionPanel(panel, false);
        });
      },
    });
  }

  private initializeExternalGrading(): void {
    const { variantId, variantToken } = this.container.dataset;

    // Render initial grading states into the DOM
    let gradingPending = false;
    for (const elem of this.container.querySelectorAll<HTMLElement>('[id^=submission-]')) {
      // Ensure that this is a valid submission element
      if (!/^submission-\d+$/.test(elem.id)) continue;

      const status = elem.dataset.gradingJobStatus as GradingJobStatus;
      const submissionId = elem.id.replace('submission-', '');
      this.updateStatus({ id: submissionId, grading_job_status: status });
      // Grading is not pending if it's done, or it's save-only, or has been canceled
      if (status !== 'graded' && status !== 'none' && status !== 'canceled') {
        gradingPending = true;
      }
    }

    // If everything has been graded or was canceled, don't even open a socket
    if (!gradingPending) return;

    // By this point, it's safe to open a socket
    this.socket = io('/external-grading');

    this.socket.emit(
      'init',
      { variant_id: variantId, variant_token: variantToken },
      (msg: StatusMessage) => this.handleStatusChange(msg),
    );

    this.socket.on('change:status', (msg: StatusMessage) => this.handleStatusChange(msg));
  }

  private handleStatusChange(msg: StatusMessage): void {
    msg.submissions.forEach((submission) => {
      // Always update results
      this.updateStatus(submission);

      if (submission.grading_job_status === 'graded') {
        const element = this.container.querySelector<HTMLElement>('#submission-' + submission.id);

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
          this.fetchResults(submission.id);

          // We don't need the socket anymore.
          this.socket?.close();
        }
      }
    });
  }

  private fetchResults(submissionId: string): void {
    window.bootstrap.Modal.getInstance(`#submissionInfoModal-${submissionId}`)?.hide();

    const submissionPanel = this.container.querySelector<HTMLElement>(
      `#submission-${submissionId}`,
    );
    if (!submissionPanel) return;

    const submissionBody = submissionPanel.querySelector<HTMLDivElement>('.js-submission-body');
    if (!submissionBody) return;

    this.loadPendingSubmissionPanel(submissionBody, true);
  }

  private updateDynamicPanels(msg: SubmissionPanels, submissionId: string): void {
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
      const answerContainer = this.container.querySelector('.answer-body');
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
      const submissionPanelElement = this.container.querySelector(submissionPanelSelector);
      // Using jQuery here because msg.submissionPanel may contain scripts
      // that must be executed. Typical vanilla JS alternatives don't support
      // this kind of script.
      if (submissionPanelElement) {
        $(submissionPanelElement).replaceWith(msg.submissionPanel);
        const updatedSubmissionPanelElement =
          this.container.querySelector(submissionPanelSelector);
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
      // Note: we use `document` and not `this.container` here because the question
      // score panel is outside the question container.
      const targetElement = document.getElementById(parsedHTML.id);
      targetElement?.replaceWith(parsedHTML);
    }

    if (msg.assessmentScorePanel) {
      // Note: we use `document` and not `this.container` here because the assessment
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
      const targetElement = this.container.querySelector(`#${parsedHTML.id}`);
      targetElement?.replaceWith(parsedHTML);
    }

    if (msg.questionNavNextButton) {
      // Note: we use `document` and not `this.container` here because this button
      // is outside the question container.
      const questionNavNextButton = document.getElementById('question-nav-next');
      if (questionNavNextButton) {
        questionNavNextButton.outerHTML = msg.questionNavNextButton;
      }
    }
  }

  private updateStatus(submission: Omit<StatusMessageSubmission, 'grading_job_id'>): void {
    const display = this.container.querySelector('#grading-status-' + submission.id);
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

  private loadPendingSubmissionPanel(panel: HTMLDivElement, includeScorePanels: boolean): void {
    const { submissionId, dynamicRenderUrl } = panel.dataset;
    if (submissionId == null || dynamicRenderUrl == null) return;

    const url = new URL(dynamicRenderUrl, window.location.origin);

    if (includeScorePanels) {
      url.searchParams.set('render_score_panels', 'true');
    }

    fetch(url, { signal: this.signal })
      .then(async (response) => {
        // If the response is not a 200, delegate to the error handler (catch block)
        if (!response.ok) throw new Error('Failed to fetch submission');
        const msg = await response.json();
        this.updateDynamicPanels(msg, submissionId);
      })
      .catch((err) => {
        // Don't show error if the request was aborted
        if (err.name === 'AbortError') return;

        panel.innerHTML =
          '<div class="card-body submission-body">Error retrieving submission</div>';
      });
  }

  private setupDisableOnSubmit(): void {
    const form = this.container.querySelector<HTMLFormElement>('form.question-form');

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
}
