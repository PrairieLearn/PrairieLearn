import { html } from '@prairielearn/html';

import { config } from '../lib/config.js';

import { Modal } from './Modal.js';

export function SupportModal() {
  return Modal({
    id: 'supportModal',
    title: 'Get help',
    size: 'default',
    form: false,
    body: html`
      <p>Get help with teaching in PrairieLearn.</p>
      ${
        config.supportSlackUrl
          ? html`
              <h3 class="h6">Slack community</h3>
              <p>Ask questions and connect with other instructors and the PrairieLearn team.</p>
              <a
                class="btn btn-primary mb-4"
                href="${config.supportSlackUrl}"
                target="_blank"
                rel="noreferrer"
              >
                <i class="bi bi-slack me-1" aria-hidden="true"></i>
                Join Slack
              </a>
            `
          : ''
      }
      ${
        config.supportOfficeHoursUrl
          ? html`
              <h3 class="h6">Zoom office hours</h3>
              <p>
                Meet with the PrairieLearn team for live help. Drop in on Thursdays, 3–4 p.m.
                Central Time.
              </p>
              <a
                class="btn btn-primary mb-4"
                href="${config.supportOfficeHoursUrl}"
                target="_blank"
                rel="noreferrer"
              >
                <i class="bi bi-camera-video me-1" aria-hidden="true"></i>
                Join office hours
              </a>
            `
          : ''
      }
      <p>
        Browse the
        <a href="https://docs.prairielearn.com" target="_blank" rel="noreferrer">documentation</a>
        for guides and reference material.
      </p>
      <p class="mb-0">
        For private questions or additional support, email
        <a href="mailto:support@prairielearn.com">support@prairielearn.com</a>.
      </p>
    `,
    footer: html`
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
    `,
  });
}
